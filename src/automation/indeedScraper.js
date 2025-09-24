import { BaseScraper } from './baseScraper.js';
import { loadJobsForSource } from './jobDataset.js';

export class IndeedScraper extends BaseScraper {
  async searchJobs(params) {
    await this.throttle('indeed');
    const filters = params?.filters ?? params;
    const jobs = loadJobsForSource('indeed', filters);
    return jobs.map((job) => ({ ...job }));
  }

  async apply(job) {
    await this.throttle('indeed');
    return { success: true, steps: ['loginCheck', 'fileUpload', 'submit'] };
  }
}
