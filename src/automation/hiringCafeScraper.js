import { BaseScraper } from './baseScraper.js';
import { loadJobsForSource } from './jobDataset.js';

export class HiringCafeScraper extends BaseScraper {
  async searchJobs(params) {
    await this.throttle('hiringCafe');
    const filters = params?.filters ?? params;
    const jobs = loadJobsForSource('hiringcafe', filters);
    return jobs.map((job) => ({ ...job }));
  }

  async apply(job) {
    await this.throttle('hiringCafe');
    return { success: true, steps: ['externalRedirect'] };
  }
}
