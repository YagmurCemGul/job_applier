import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { BaseScraper } from './baseScraper.js';
import { loadJobsForSource } from './jobDataset.js';

export class IndeedScraper extends BaseScraper {
  constructor(options) {
    super(options);
    this.baseUrl = 'https://www.indeed.com';
  }

  async searchJobs(params) {
    await this.throttle('indeed');
    const filters = params?.filters ?? params ?? {};

    const page = await this.newPage(`${this.baseUrl}/jobs`);
    if (!page) {
      return loadJobsForSource('indeed', filters).map((job) => ({ ...job }));
    }

    try {
      await this.ensureLoggedIn(page, {
        authSelectors: ['#userOptionsLabel', 'a[data-tn-element="nav-profile"]'],
        loginSelectors: ['a[data-tn-element="nav-signin"]'],
        loginUrl: `${this.baseUrl}/account/login`
      });

      const keyword = filters.keywords ?? filters.keyword ?? filters.title ?? '';
      const location = filters.location ?? filters.locations?.[0] ?? '';

      const whatInput = await this.resolveLocator(page, ['input#text-input-what', 'input[name="q"]']);
      if (whatInput && keyword) {
        await this.typeHuman(whatInput, keyword);
      }

      const whereInput = await this.resolveLocator(page, ['input#text-input-where', 'input[name="l"]']);
      if (whereInput) {
        await whereInput.click({ clickCount: 3 });
        await whereInput.fill('');
        if (location) {
          await this.typeHuman(whereInput, location);
        }
      }

      const searchButton = await this.resolveLocator(page, ['button[type="submit"][aria-label="Find jobs"]', 'button[type="submit"]']);
      if (searchButton) {
        await searchButton.click();
      } else {
        await page.keyboard.press('Enter');
      }

      await page.waitForSelector('ul.jobsearch-ResultsList li', { timeout: 20000 });

      const scrapedJobs = await page.$$eval('ul.jobsearch-ResultsList li', (nodes) =>
        nodes
          .map((node) => {
            const titleNode = node.querySelector('h2.jobTitle');
            const anchor = titleNode?.querySelector('a');
            const companyNode = node.querySelector('span.companyName');
            const locationNode = node.querySelector('div.companyLocation');
            const snippetNode = node.querySelector('div.job-snippet');
            const salaryNode = node.querySelector('div.metadata.salary-snippet-container');
            const quickApply = Boolean(node.querySelector('span.ialbl')); // Indeed Apply label
            const href = anchor?.href ?? '';
            if (!href) return undefined;
            return {
              id: anchor.getAttribute('data-jk') ?? href,
              source: 'indeed',
              url: href.startsWith('http') ? href : `https://www.indeed.com${href}`,
              title: anchor?.textContent?.trim() ?? '',
              company: companyNode?.textContent?.trim() ?? '',
              location: locationNode?.textContent?.trim() ?? '',
              description: snippetNode?.textContent?.trim() ?? '',
              salaryHint: salaryNode?.textContent
                ? { text: salaryNode.textContent.trim() }
                : {},
              skills: [],
              applyMethod: quickApply ? 'platform' : 'external'
            };
          })
          .filter(Boolean)
      );

      return scrapedJobs.map((job, index) => ({
        ...job,
        id: job.id ?? `indeed-${index}-${randomUUID()}`
      }));
    } catch (error) {
      this.logger?.warn?.(`Indeed araması canlı modda başarısız: ${error.message}`);
      return loadJobsForSource('indeed', filters).map((job) => ({ ...job }));
    } finally {
      await this.closePage(page);
    }
  }

  async apply(job) {
    await this.throttle('indeed');
    const page = await this.newPage(job.url, { waitUntil: 'domcontentloaded' });
    if (!page) {
      return { success: false, steps: [], reason: 'playwright-disabled' };
    }

    const steps = [];
    const errors = [];
    const applicant = this.applicant;
    try {
      await this.ensureLoggedIn(page, {
        authSelectors: ['#userOptionsLabel'],
        loginSelectors: ['a[data-tn-element="nav-signin"]'],
        loginUrl: `${this.baseUrl}/account/login`
      });
      steps.push('loginChecked');

      const applyButton = await this.resolveLocator(page, [
        'button[data-testid="indeed-apply-button"]',
        'button.ia-IndeedApplyButton',
        'button#indeedApplyButton'
      ]);
      if (!applyButton) {
        errors.push({ field: 'applyButton', reason: 'not-found' });
        const artifacts = await this.captureDebugArtifacts(page, 'indeed-apply-missing-button');
        return { success: false, steps, errors, reason: 'apply-button-not-found', artifacts };
      }

      await applyButton.click();
      steps.push('openApplyModal');

      await page.waitForSelector('div.icl-IAForm', { timeout: 20000 });

      const fillField = async (selectors, value, stepName, mode = 'text') => {
        if (!value) return;
        const locator = await this.resolveLocator(page, selectors);
        if (!locator) {
          errors.push({ field: stepName, reason: 'selector-not-found' });
          return;
        }
        try {
          if (mode === 'text') {
            await this.typeHuman(locator, value);
          } else if (mode === 'select') {
            try {
              await locator.selectOption({ label: value });
            } catch {
              await locator.selectOption({ value });
            }
          }
          steps.push(stepName);
        } catch (error) {
          errors.push({ field: stepName, reason: error.message });
        }
      };

      await fillField(['input[name="applicant.firstName"]'], applicant.firstName ?? applicant.name?.split(' ')[0], 'fillFirstName');
      await fillField(['input[name="applicant.lastName"]'], applicant.lastName ?? applicant.name?.split(' ').slice(1).join(' '), 'fillLastName');
      await fillField(['input[name="applicant.phoneNumber"]'], applicant.phone, 'fillPhone');
      await fillField(['input[name="applicant.email"]'], applicant.email, 'fillEmail');
      await fillField(['input[name="applicant.streetAddress"]'], applicant.address, 'fillAddress');
      await fillField(['input[name="applicant.city"]'], applicant.city ?? applicant.location, 'fillCity');

      const resumeUpload = await this.resolveLocator(page, ['input[type="file"][name="resume"]']);
      if (resumeUpload && applicant?.resumePath) {
        const resolvedPath = resolve(process.cwd(), applicant.resumePath);
        if (await this.fileExists(resolvedPath)) {
          await resumeUpload.setInputFiles(resolvedPath);
          steps.push('uploadResume');
        } else {
          errors.push({ field: 'resume', reason: 'file-not-found', detail: resolvedPath });
        }
      }

      const coverLetterUpload = await this.resolveLocator(page, ['input[type="file"][name="coverLetter"]']);
      if (coverLetterUpload && applicant?.coverLetterPath) {
        const resolvedPath = resolve(process.cwd(), applicant.coverLetterPath);
        if (await this.fileExists(resolvedPath)) {
          await coverLetterUpload.setInputFiles(resolvedPath);
          steps.push('uploadCoverLetter');
        } else {
          errors.push({ field: 'coverLetter', reason: 'file-not-found', detail: resolvedPath });
        }
      }

      await this.autoFillQuestions(page, applicant.answers, steps, errors);

      const continueSelectors = [
        'button[data-testid="continue-button"]',
        'button[type="submit"].ia-continueButton'
      ];
      let continueButton = await this.resolveLocator(page, continueSelectors);
      let guard = 0;
      while (continueButton && guard < 5) {
        const isDisabled = await continueButton.isDisabled?.();
        if (isDisabled) {
          errors.push({ field: 'nextStep', reason: 'disabled-button' });
          break;
        }
        await continueButton.click();
        await this.humanDelay(400, 900);
        steps.push(`nextStep-${guard + 1}`);
        await this.autoFillQuestions(page, applicant.answers, steps, errors);
        const validationErrors = await this.collectValidationErrors(page);
        if (validationErrors.length > 0) {
          validationErrors.forEach((message) =>
            errors.push({ field: 'form', reason: 'validation', message })
          );
          break;
        }
        continueButton = await this.resolveLocator(page, continueSelectors);
        guard += 1;
      }

      const submitButton = await this.resolveLocator(page, [
        'button[data-testid="submit-button"]',
        'button[type="submit"].ia-SubmitButton'
      ]);
      if (submitButton) {
        await submitButton.click();
        steps.push('submit');
        await this.humanDelay(800, 1200);
        const validationErrors = await this.collectValidationErrors(page);
        if (validationErrors.length > 0) {
          validationErrors.forEach((message) =>
            errors.push({ field: 'form', reason: 'validation', message })
          );
          const artifacts = await this.captureDebugArtifacts(page, 'indeed-apply-validation');
          return { success: false, steps, errors, reason: 'validation-error', artifacts };
        }
        return { success: true, steps, errors };
      }

      errors.push({ field: 'submitButton', reason: 'not-found' });
      const artifacts = await this.captureDebugArtifacts(page, 'indeed-apply-missing-submit');
      return { success: false, steps, errors, reason: 'submit-button-missing', artifacts };
    } catch (error) {
      errors.push({ field: 'exception', reason: error.message });
      const artifacts = await this.captureDebugArtifacts(page, 'indeed-apply-exception');
      return { success: false, steps, errors, reason: error.message, artifacts };
    } finally {
      await this.closePage(page);
    }
  }
}
