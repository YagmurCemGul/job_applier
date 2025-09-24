import { randomUUID } from 'node:crypto';
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
    try {
      const externalApply = await this.resolveLocator(page, [
        'a[href*="apply"]',
        'a[rel="noopener"]',
        'a[target="_blank"]'
      ]);
      if (externalApply) {
        const href = await externalApply.getAttribute('href');
        steps.push('openExternal');
        return { success: true, steps, externalUrl: href ?? job.url };
      }

      const applyButton = await this.resolveLocator(page, ['button[type="submit"]', 'button[data-role="apply"]']);
      if (applyButton) {
        await applyButton.click();
        steps.push('submit');
        await this.humanDelay(400, 700);
        return { success: true, steps };
      }

      return { success: false, steps, reason: 'apply-target-not-found' };
    } catch (error) {
      return { success: false, steps, reason: error.message };
    } finally {
      await this.closePage(page);
    }
  }
}
