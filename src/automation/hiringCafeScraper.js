import { BaseScraper } from './baseScraper.js';
import { v4 as uuid } from 'uuid';

export class HiringCafeScraper extends BaseScraper {
  async searchJobs(params) {
    await this.throttle('hiringCafe');
    return [
      {
        id: uuid(),
        source: 'hiring.cafe',
        url: 'https://hiring.cafe/jobs/789',
        title: 'Product Designer',
        company: 'Remote Startup',
        location: params.location ?? 'Remote',
        description: 'Design systems, UX research, Figma uzmanlığı.',
        skills: ['Design Systems', 'UX Research', 'Figma'],
        salaryHint: {},
        applyMethod: 'external'
      }
    ];
  }

  async apply(job) {
    await this.throttle('hiringCafe');
    return { success: true, steps: ['externalRedirect'] };
  }
}
