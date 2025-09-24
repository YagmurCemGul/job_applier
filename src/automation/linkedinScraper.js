import { randomUUID } from 'node:crypto';
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
        return { success: false, steps, reason: 'apply-button-not-found' };
      }

      await applyButton.click();
      steps.push('openApplyModal');

      await page.waitForSelector('div.jobs-easy-apply-modal', { timeout: 20000 });

      // Telefon, konum gibi temel alanları doldurmayı dene.
      const phoneInput = await this.resolveLocator(page, [
        'input[aria-label="Telefon Numarası"]',
        'input[aria-label*="Phone number"]'
      ]);
      if (phoneInput && this.config?.applicant?.phone) {
        await this.typeHuman(phoneInput, this.config.applicant.phone);
        steps.push('fillPhone');
      }

      const resumeUpload = await this.resolveLocator(page, ['input[type="file"][data-test="resume-upload-input"]']);
      if (resumeUpload && this.config?.applicant?.resumePath) {
        await resumeUpload.setInputFiles(this.config.applicant.resumePath);
        steps.push('uploadResume');
      }

      // Çok adımlı formlarda "İleri" düğmesini kontrol et.
      const nextButtonSelectors = [
        'button[aria-label="Continue to next step"]',
        'button[aria-label="Review your application"]',
        'button[data-control-name="continue_unify"]'
      ];

      let continueButton = await this.resolveLocator(page, nextButtonSelectors);
      let safetyCounter = 0;
      while (continueButton && safetyCounter < 5) {
        await continueButton.click();
        await this.humanDelay(400, 900);
        steps.push('nextStep');
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
        return { success: true, steps };
      }

      return { success: false, steps, reason: 'submit-button-missing' };
    } catch (error) {
      return { success: false, steps, reason: error.message };
    } finally {
      await this.closePage(page);
    }
  }
}
