import { randomUUID } from 'node:crypto';
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
        return { success: false, steps, reason: 'apply-button-not-found' };
      }

      await applyButton.click();
      steps.push('openApplyModal');

      await page.waitForSelector('div.icl-IAForm', { timeout: 20000 });

      const phoneInput = await this.resolveLocator(page, ['input[name="applicant.phoneNumber"]']);
      if (phoneInput && this.config?.applicant?.phone) {
        await this.typeHuman(phoneInput, this.config.applicant.phone);
        steps.push('fillPhone');
      }

      const resumeUpload = await this.resolveLocator(page, ['input[type="file"][name="resume"]']);
      if (resumeUpload && this.config?.applicant?.resumePath) {
        await resumeUpload.setInputFiles(this.config.applicant.resumePath);
        steps.push('uploadResume');
      }

      const coverLetterUpload = await this.resolveLocator(page, ['input[type="file"][name="coverLetter"]']);
      if (coverLetterUpload && this.config?.applicant?.coverLetterPath) {
        await coverLetterUpload.setInputFiles(this.config.applicant.coverLetterPath);
        steps.push('uploadCoverLetter');
      }

      const continueSelectors = [
        'button[data-testid="continue-button"]',
        'button[type="submit"].ia-continueButton'
      ];
      let continueButton = await this.resolveLocator(page, continueSelectors);
      let guard = 0;
      while (continueButton && guard < 5) {
        await continueButton.click();
        await this.humanDelay(400, 900);
        steps.push('nextStep');
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
