import { BaseScraper } from './baseScraper.js';
import { loadJobsForSource } from './jobDataset.js';

/**
 * LinkedIn sürücüsü (stub)
 */
export class LinkedInScraper extends BaseScraper {
  /**
   * @param {{ filters: Record<string, any> }} params
   */
  async searchJobs(params) {
    await this.throttle('linkedin');
    const filters = params?.filters ?? params;
    const jobs = loadJobsForSource('linkedin', filters);
    return jobs.map((job) => ({ ...job }));
  }

  /**
   * @param {import('../data/models.js').JobPosting} job
   */
  async apply(job) {
    await this.throttle('linkedin');
    return { success: true, steps: ['loginCheck', 'formFill', 'submit'] };
  }
}
