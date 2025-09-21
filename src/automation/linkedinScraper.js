import { BaseScraper } from './baseScraper.js';
import { v4 as uuid } from 'uuid';

/**
 * LinkedIn sürücüsü (stub)
 */
export class LinkedInScraper extends BaseScraper {
  /**
   * @param {{ filters: Record<string, any> }} params
   */
  async searchJobs(params) {
    await this.throttle('linkedin');
    return [
      {
        id: uuid(),
        source: 'linkedin',
        url: 'https://www.linkedin.com/jobs/view/123',
        title: 'Senior Product Manager',
        company: 'Örnek Şirket',
        location: params.location ?? 'Remote',
        description: 'Ürün stratejisi ve çapraz ekip iş birliği.',
        skills: ['Product Strategy', 'Roadmap', 'Stakeholder Management'],
        salaryHint: {},
        applyMethod: 'platform'
      }
    ];
  }

  /**
   * @param {import('../data/models.js').JobPosting} job
   */
  async apply(job) {
    await this.throttle('linkedin');
    return { success: true, steps: ['loginCheck', 'formFill', 'submit'] };
  }
}
