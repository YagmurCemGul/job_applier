import { composePrompt } from '../llm/promptComposer.js';
import { computeMatchScore } from '../data/models.js';

/**
 * Basit orchestrator örneği
 */
export class Orchestrator {
  /**
   * @param {{
   *  provider: import('../llm/providerFactory.js').BaseProvider,
   *  scrapers: {
   *    linkedin: import('../automation/linkedinScraper.js').LinkedInScraper,
   *    indeed: import('../automation/indeedScraper.js').IndeedScraper,
   *    hiringCafe: import('../automation/hiringCafeScraper.js').HiringCafeScraper
   *  },
   *  profile: import('../data/models.js').UserProfile
   * }} deps
   */
  constructor({ provider, scrapers, profile }) {
    this.provider = provider;
    this.scrapers = scrapers;
    this.profile = profile;
  }

  /**
   * @param {{ filters: Record<string, any> }} params
   */
  async discoverJobs(params) {
    const results = await Promise.all([
      this.scrapers.linkedin.searchJobs(params),
      this.scrapers.indeed.searchJobs(params),
      this.scrapers.hiringCafe.searchJobs(params)
    ]);
    const jobs = results.flat();
    return jobs.map((job) => ({
      job,
      match: computeMatchScore(job, this.profile)
    }));
  }

  /**
   * @param {import('../data/models.js').JobPosting} job
   */
  async buildResume(job, resumeText) {
    const prompt = composePrompt('resume_tailoring', {
      JOB_TEXT: job.description,
      RESUME_TEXT: resumeText,
      TARGET_SKILLS: job.skills
    });
    return this.provider.tailorResume({ jobText: job.description, resumeText, prompt });
  }

  async buildCoverLetter(job, achievements, tone = 'samimi', language = 'tr') {
    const prompt = composePrompt('cover_letter', {
      JOB_TEXT: job.description,
      ACHIEVEMENTS: achievements,
      COMPANY_NOTES: `${job.company} hakkında araştırma notları`,
      TONE: tone,
      LANG: language
    });
    return this.provider.generateCoverLetter({ jobText: job.description, achievements, tone, language, prompt });
  }

  async answerQuestion(question, vaultEntry) {
    const prompt = composePrompt('form_qa', {
      QUESTION: question,
      PROFILE: this.profile,
      VAULT: vaultEntry ?? {}
    });
    return this.provider.answerFormQuestion({ question, prompt, profile: this.profile, vaultEntry });
  }
}
