import { BaseScraper } from './baseScraper.js';
import { v4 as uuid } from 'uuid';

export class IndeedScraper extends BaseScraper {
  async searchJobs(params) {
    await this.throttle('indeed');
    return [
      {
        id: uuid(),
        source: 'indeed',
        url: 'https://tr.indeed.com/viewjob?jk=456',
        title: 'Senior Software Engineer',
        company: 'Teknoloji AŞ',
        location: params.location ?? 'İstanbul',
        description: 'Node.js ve Playwright otomasyon deneyimi.',
        skills: ['Node.js', 'Playwright', 'Automation'],
        salaryHint: { currency: 'TRY', min: 900000, max: 1200000 },
        applyMethod: 'platform'
      }
    ];
  }

  async apply(job) {
    await this.throttle('indeed');
    return { success: true, steps: ['loginCheck', 'fileUpload', 'submit'] };
  }
}
