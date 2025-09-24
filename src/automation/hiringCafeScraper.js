import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { BaseScraper } from './baseScraper.js';
import { loadJobsForSource } from './jobDataset.js';

export class HiringCafeScraper extends BaseScraper {
  constructor(options) {
    super(options);
    this.baseUrl = 'https://hiring.cafe';
  }

  async searchJobs(params) {
    await this.throttle('hiringCafe');
    const filters = params?.filters ?? params ?? {};

    const page = await this.newPage(`${this.baseUrl}/jobs`);
    if (!page) {
      return loadJobsForSource('hiringcafe', filters).map((job) => ({ ...job }));
    }

    try {
      const keyword = filters.keywords ?? filters.keyword ?? filters.title ?? '';
      const location = filters.location ?? filters.locations?.[0] ?? '';

      if (keyword) {
        const keywordInput = await this.resolveLocator(page, [
          'input[name="search"]',
          'input[placeholder*="Search"]'
        ]);
        if (keywordInput) {
          await this.typeHuman(keywordInput, keyword);
          await this.humanDelay(120, 320);
          await keywordInput.press('Enter');
        }
      }

      if (location) {
        const locationInput = await this.resolveLocator(page, [
          'input[name="location"]',
          'input[placeholder*="Location"]'
        ]);
        if (locationInput) {
          await this.typeHuman(locationInput, location);
          await this.humanDelay(120, 320);
          await locationInput.press('Enter');
        }
      }

      await page.waitForSelector('section[data-role="job-list"] article', { timeout: 15000 });

      const scrapedJobs = await page.$$eval('section[data-role="job-list"] article', (nodes) =>
        nodes.map((node) => {
          const anchor = node.querySelector('a');
          const titleNode = node.querySelector('h3, h2');
          const companyNode = node.querySelector('[data-role="company"], .job-card__company');
          const locationNode = node.querySelector('[data-role="location"], .job-card__location');
          const descriptionNode = node.querySelector('p, .job-card__snippet');
          const href = anchor?.href ?? '';
          if (!href) return undefined;
          return {
            id: node.getAttribute('data-id') ?? href,
            source: 'hiringcafe',
            url: href,
            title: titleNode?.textContent?.trim() ?? '',
            company: companyNode?.textContent?.trim() ?? '',
            location: locationNode?.textContent?.trim() ?? '',
            description: descriptionNode?.textContent?.trim() ?? '',
            skills: [],
            salaryHint: {},
            applyMethod: 'external'
          };
        }).filter(Boolean)
      );

      if (scrapedJobs.length === 0) {
        throw new Error('results-empty');
      }

      return scrapedJobs.map((job, index) => ({
        ...job,
        id: job.id ?? `hiringcafe-${index}-${randomUUID()}`
      }));
    } catch (error) {
      this.logger?.warn?.(`Hiring.cafe araması canlı modda başarısız: ${error.message}`);
      return loadJobsForSource('hiringcafe', filters).map((job) => ({ ...job }));
    } finally {
      await this.closePage(page);
    }
  }

  async apply(job) {
    await this.throttle('hiringCafe');
    const page = await this.newPage(job.url, { waitUntil: 'domcontentloaded' });
    if (!page) {
      return { success: false, steps: [], reason: 'playwright-disabled' };
    }

    const steps = [];
    const errors = [];
    const applicant = this.applicant;
    try {
      const externalApply = await this.resolveLocator(page, [
        'a[href*="apply"]',
        'a[rel="noopener"]',
        'a[target="_blank"]'
      ]);
      if (externalApply) {
        const href = await externalApply.getAttribute('href');
        steps.push('openExternal');
        return { success: true, steps, errors, externalUrl: href ?? job.url };
      }

      const applyButton = await this.resolveLocator(page, ['button[type="submit"]', 'button[data-role="apply"]']);
      if (applyButton) {
        await applyButton.click();
        steps.push('openInlineForm');
        await this.humanDelay(300, 600);
      }

      const form = await this.resolveLocator(page, ['form[action*="apply"]', 'form[data-role="application"]']);
      if (form) {
        const fillField = async (selectors, value, stepName) => {
          if (!value) return;
          const locator = await this.resolveLocator(page, selectors);
          if (!locator) {
            errors.push({ field: stepName, reason: 'selector-not-found' });
            return;
          }
          try {
            await this.typeHuman(locator, value);
            steps.push(stepName);
          } catch (error) {
            errors.push({ field: stepName, reason: error.message });
          }
        };

        await fillField(['input[name*="name"]', 'input[placeholder*="Name"]'], applicant.fullName ?? applicant.name, 'fillName');
        await fillField(['input[type="email"]', 'input[name*="email"]'], applicant.email, 'fillEmail');
        await fillField(['input[type="tel"]', 'input[name*="phone"]'], applicant.phone, 'fillPhone');
        await fillField(['input[name*="location"]', 'input[name*="city"]'], applicant.location, 'fillLocation');
        await fillField(['textarea[name*="note"]', 'textarea[name*="message"]'], applicant.note ?? applicant.summary, 'fillNotes');

        await this.autoFillQuestions(page, applicant.answers, steps, errors);

        const resumeUpload = await this.resolveLocator(page, [
          'input[type="file"][name*="resume"]',
          'input[type="file"][data-role="resume-upload"]'
        ]);
        if (resumeUpload && applicant?.resumePath) {
          const resolvedPath = resolve(process.cwd(), applicant.resumePath);
          if (await this.fileExists(resolvedPath)) {
            await resumeUpload.setInputFiles(resolvedPath);
            steps.push('uploadResume');
          } else {
            errors.push({ field: 'resume', reason: 'file-not-found', detail: resolvedPath });
          }
        }

        const coverUpload = await this.resolveLocator(page, [
          'input[type="file"][name*="cover"]',
          'input[type="file"][data-role="cover-upload"]'
        ]);
        if (coverUpload && applicant?.coverLetterPath) {
          const resolvedPath = resolve(process.cwd(), applicant.coverLetterPath);
          if (await this.fileExists(resolvedPath)) {
            await coverUpload.setInputFiles(resolvedPath);
            steps.push('uploadCoverLetter');
          } else {
            errors.push({ field: 'coverLetter', reason: 'file-not-found', detail: resolvedPath });
          }
        }

        const submitLocator = await this.resolveLocator(page, [
          'button[type="submit"]',
          'button[data-role="submit-application"]'
        ]);
        if (submitLocator) {
          await submitLocator.click();
          steps.push('submit');
          await this.humanDelay(500, 800);
          const validationErrors = await this.collectValidationErrors(page);
          if (validationErrors.length > 0) {
            validationErrors.forEach((message) =>
              errors.push({ field: 'form', reason: 'validation', message })
            );
            const artifacts = await this.captureDebugArtifacts(page, 'hiringcafe-apply-validation');
            return { success: false, steps, errors, reason: 'validation-error', artifacts };
          }
          return { success: true, steps, errors };
        }
      }

      if (applyButton) {
        const artifacts = await this.captureDebugArtifacts(page, 'hiringcafe-apply-submit-missing');
        errors.push({ field: 'submitButton', reason: 'not-found' });
        return { success: false, steps, errors, reason: 'submit-button-missing', artifacts };
      }

      const artifacts = await this.captureDebugArtifacts(page, 'hiringcafe-apply-no-form');
      errors.push({ field: 'form', reason: 'apply-target-not-found' });
      return { success: false, steps, errors, reason: 'apply-target-not-found', artifacts };
    } catch (error) {
      errors.push({ field: 'exception', reason: error.message });
      const artifacts = await this.captureDebugArtifacts(page, 'hiringcafe-apply-exception');
      return { success: false, steps, errors, reason: error.message, artifacts };
    } finally {
      await this.closePage(page);
    }
  }
}
