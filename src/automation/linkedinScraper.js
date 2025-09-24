import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { BaseScraper } from './baseScraper.js';
import { loadJobsForSource } from './jobDataset.js';

const JOB_RESULTS_SELECTOR = 'ul.jobs-search__results-list li';

/**
 * LinkedIn sürücüsü gerçek Playwright adımlarını uygular.
 */
export class LinkedInScraper extends BaseScraper {
  constructor(options) {
    super(options);
    this.baseUrl = 'https://www.linkedin.com';
  }

  /**
   * LinkedIn job search sonuçlarını DOM üzerinden toplar.
   * @param {{ filters: Record<string, any> }} params
   */
  async searchJobs(params) {
    await this.throttle('linkedin');
    const filters = params?.filters ?? params ?? {};

    const page = await this.newPage(`${this.baseUrl}/jobs/`);
    if (!page) {
      return loadJobsForSource('linkedin', filters).map((job) => ({ ...job }));
    }

    try {
      await this.ensureLoggedIn(page, {
        authSelectors: ['.global-nav__me-photo', 'button[data-control-name="nav.settings"]'],
        loginSelectors: ['a.nav__button-secondary', 'a.nav__button-tertiary'],
        loginUrl: `${this.baseUrl}/login`,
        timeout: 120000
      });

      const keyword = filters.keywords ?? filters.keyword ?? filters.title ?? '';
      const location = filters.location ?? filters.locations?.[0] ?? '';

      if (keyword) {
        const keywordInput = await this.resolveLocator(page, [
          'input[aria-label*="Meslek"]',
          'input[aria-label*="Search by title"]',
          'input[aria-label="Arama"]',
          'input.jobs-search-box__text-input'
        ]);
        if (keywordInput) {
          await this.typeHuman(keywordInput, keyword);
          await this.humanDelay(150, 450);
        }
      }

      if (location) {
        const locationInput = await this.resolveLocator(page, [
          'input[aria-label*="Location"]',
          'input[aria-label*="Konum"]',
          'input.jobs-search-box__text-input[aria-label*="City"]'
        ]);
        if (locationInput) {
          await locationInput.click({ clickCount: 3 });
          await locationInput.fill('');
          await this.typeHuman(locationInput, location);
          await this.humanDelay(200, 400);
        }
      }

      const searchButton = await this.resolveLocator(page, [
        'button.jobs-search-box__submit-button',
        'button[aria-label="Search"]'
      ]);
      if (searchButton) {
        await searchButton.click();
      } else {
        await page.keyboard.press('Enter');
      }

      await page.waitForSelector(JOB_RESULTS_SELECTOR, { timeout: 20000 });

      const scrapedJobs = await page.$$eval(JOB_RESULTS_SELECTOR, (nodes) =>
        nodes.slice(0, 20).map((node) => {
          const anchor = node.querySelector('a.base-card__full-link');
          const title = node.querySelector('h3.base-search-card__title');
          const company = node.querySelector('h4.base-search-card__subtitle');
          const locationNode = node.querySelector('.job-search-card__location');
          const descriptionNode = node.querySelector('.job-search-card__snippet');
          const easyApply = Boolean(node.querySelector('[data-job-card-link="easyApply"]'));
          const idAttr = node.getAttribute('data-entity-urn') ?? anchor?.getAttribute('data-entity-urn');
          const href = anchor?.href ?? '';
          return {
            id: idAttr ?? href ?? '',
            source: 'linkedin',
            url: href,
            title: title?.textContent?.trim() ?? '',
            company: company?.textContent?.trim() ?? '',
            location: locationNode?.textContent?.trim() ?? '',
            description: descriptionNode?.textContent?.trim() ?? '',
            skills: [],
            salaryHint: {},
            applyMethod: easyApply ? 'platform' : 'external'
          };
        })
      );

      return scrapedJobs
        .filter((job) => job.url)
        .map((job, index) => ({
          ...job,
          id: job.id && job.id.length > 4 ? job.id : `linkedin-${index}-${randomUUID()}`
        }));
    } catch (error) {
      this.logger?.warn?.(`LinkedIn araması canlı modda başarısız: ${error.message}`);
      return loadJobsForSource('linkedin', filters).map((job) => ({ ...job }));
    } finally {
      await this.closePage(page);
    }
  }

  /**
   * @param {import('../data/models.js').JobPosting} job
   */
  async apply(job) {
    await this.throttle('linkedin');
    const page = await this.newPage(job.url, { waitUntil: 'domcontentloaded' });
    if (!page) {
      return { success: false, steps: [], reason: 'playwright-disabled' };
    }

    const steps = [];
    const errors = [];
    const applicant = this.applicant;
    try {
      await this.ensureLoggedIn(page, {
        authSelectors: ['.global-nav__primary-link[data-test-global-nav-link="profile"]'],
        loginSelectors: ['a.nav__button-secondary'],
        loginUrl: `${this.baseUrl}/login`
      });

      steps.push('loginChecked');

      const applyButton = await this.resolveLocator(page, [
        'button.jobs-apply-button',
        'button[data-control-name="jobdetails_topcard_inapply"]'
      ]);
      if (!applyButton) {
        errors.push({ field: 'applyButton', reason: 'not-found' });
        const artifacts = await this.captureDebugArtifacts(page, 'linkedin-apply-missing-button');
        return { success: false, steps, errors, reason: 'apply-button-not-found', artifacts };
      }

      await applyButton.click();
      steps.push('openApplyModal');

      await page.waitForSelector('div.jobs-easy-apply-modal', { timeout: 20000 });

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

      await fillField(
        [
          'input[aria-label*="Telefon"]',
          'input[aria-label*="Phone"]',
          'input[data-test="phoneNumber"]'
        ],
        applicant.phone,
        'fillPhone'
      );
      await fillField(
        ['input[aria-label*="Email"]', 'input[data-test="emailAddress"]'],
        applicant.email,
        'fillEmail'
      );
      await fillField(
        ['input[aria-label*="Location"]', 'input[data-test="currentLocation"]'],
        applicant.location,
        'fillLocation'
      );
      await fillField(
        ['input[aria-label*="Last name"]', 'input[aria-label*="Full name"]'],
        applicant.fullName ?? applicant.name,
        'fillName'
      );

      const resumeUpload = await this.resolveLocator(page, [
        'input[type="file"][data-test="resume-upload-input"]'
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
        'input[type="file"][data-test="cover-letter-upload-input"]'
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

      await this.autoFillQuestions(page, applicant.answers, steps, errors);

      // Çok adımlı formlarda "İleri" düğmesini kontrol et.
      const nextButtonSelectors = [
        'button[aria-label="Continue to next step"]',
        'button[aria-label="Review your application"]',
        'button[data-control-name="continue_unify"]'
      ];

      let continueButton = await this.resolveLocator(page, nextButtonSelectors);
      let safetyCounter = 0;
      while (continueButton && safetyCounter < 5) {
        const isDisabled = await continueButton.isDisabled?.();
        if (isDisabled) {
          errors.push({ field: 'nextStep', reason: 'disabled-button' });
          break;
        }
        await continueButton.click();
        await this.humanDelay(400, 900);
        steps.push('nextStep');
        await this.autoFillQuestions(page, applicant.answers, steps, errors);
        const validationErrors = await this.collectValidationErrors(page);
        if (validationErrors.length > 0) {
          validationErrors.forEach((message) =>
            errors.push({ field: 'form', reason: 'validation', message })
          );
          break;
        }
        continueButton = await this.resolveLocator(page, nextButtonSelectors);
        safetyCounter += 1;
      }

      const submitButton = await this.resolveLocator(page, [
        'button[aria-label="Submit application"]',
        'button[data-control-name="submit_unify"]'
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
          const artifacts = await this.captureDebugArtifacts(page, 'linkedin-apply-validation');
          return { success: false, steps, errors, reason: 'validation-error', artifacts };
        }
        return { success: true, steps, errors };
      }

      errors.push({ field: 'submitButton', reason: 'not-found' });
      const artifacts = await this.captureDebugArtifacts(page, 'linkedin-apply-missing-submit');
      return { success: false, steps, errors, reason: 'submit-button-missing', artifacts };
    } catch (error) {
      errors.push({ field: 'exception', reason: error.message });
      const artifacts = await this.captureDebugArtifacts(page, 'linkedin-apply-exception');
      return { success: false, steps, errors, reason: error.message, artifacts };
    } finally {
      await this.closePage(page);
    }
  }
}
