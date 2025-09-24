import { composePrompt } from '../llm/promptComposer.js';
import { computeMatchScore } from '../data/models.js';
import { PipelineStore, groupByStatus } from './pipelineStore.js';

const QUESTION_LANG = 'tr';

let defaultVaultAdapter;
try {
  const vaultModule = await import('../data/vault.js');
  defaultVaultAdapter = {
    get: (key) => vaultModule.getAnswer(key),
    set: (entry) => vaultModule.upsertAnswer(entry),
    list: () => vaultModule.listAnswers(),
    remove: (key) => vaultModule.removeAnswer(key)
  };
} catch (error) {
  defaultVaultAdapter = {
    get: () => undefined,
    set: () => undefined,
    list: () => ({}),
    remove: () => undefined
  };
}

function buildQuestionKey(question) {
  return question
    .toLowerCase()
    .replace(/[^a-z0-9çğıöşü\s]/gi, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 120);
}

/**
 * Basit orchestrator örneği
 */
export class Orchestrator {
  /**
   * @param {{
   *  provider: import('../llm/providerFactory.js').WebLLMService,
   *  scrapers: {
   *    linkedin: import('../automation/linkedinScraper.js').LinkedInScraper,
   *    indeed: import('../automation/indeedScraper.js').IndeedScraper,
   *    hiringCafe: import('../automation/hiringCafeScraper.js').HiringCafeScraper
   *  },
   *  profile: import('../data/models.js').UserProfile
   * }} deps
   */
  constructor({ provider, scrapers, profile, pipelineStore, settings, vaultAdapter }) {
    this.provider = provider;
    this.scrapers = scrapers;
    this.profile = profile;
    this.settings = settings;
    this.pipelineStore = pipelineStore ?? new PipelineStore();
    this.vault = vaultAdapter ?? defaultVaultAdapter;
    this.jobCache = new Map();
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
    return jobs.map((job) => {
      this.jobCache.set(job.id, job);
      return {
      job,
      match: computeMatchScore(job, this.profile)
    };
    });
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
    const questionKey = buildQuestionKey(question);
    const existing = vaultEntry ?? (await this.vault.get(questionKey));
    if (existing?.answer) {
      return {
        answer: existing.answer,
        needsUserApproval: false,
        questionKey,
        source: 'vault'
      };
    }
    const prompt = composePrompt('form_qa', {
      QUESTION: question,
      PROFILE: this.profile,
      VAULT: await this.vault.list()
    });
    const response = await this.provider.answerFormQuestion({
      question,
      prompt,
      profile: this.profile,
      vaultEntry: existing
    });
    if (!response.needsUserApproval && response.answer) {
      await this.vault.set({
        questionKey,
        answer: response.answer,
        lang: QUESTION_LANG,
        updatedAt: new Date().toISOString()
      });
    }
    return { ...response, questionKey };
  }

  async getVaultEntries() {
    return this.vault.list();
  }

  async saveVaultEntry(entry) {
    await this.vault.set({
      ...entry,
      updatedAt: entry.updatedAt ?? new Date().toISOString()
    });
    return this.vault.get(entry.questionKey);
  }

  async deleteVaultEntry(questionKey) {
    await this.vault.remove(questionKey);
  }

  listApplications() {
    return this.pipelineStore.list();
  }

  getPipelineSummary() {
    return groupByStatus(this.pipelineStore.list());
  }

  applyToJob(jobId, options = {}) {
    const job = this.jobCache.get(jobId);
    if (!job) {
      throw new Error('İlan bulunamadı');
    }
    return this.pipelineStore.createFromJob(job, options);
  }

  updateApplicationStatus(applicationId, status) {
    return this.pipelineStore.updateStatus(applicationId, status);
  }

  getProfile() {
    return this.profile;
  }

  updateProfile(patch) {
    this.profile = {
      ...this.profile,
      ...patch,
      roles: patch.roles ?? this.profile.roles,
      locations: patch.locations ?? this.profile.locations,
      languages: patch.languages ?? this.profile.languages,
      salaryRange: {
        ...this.profile.salaryRange,
        ...patch.salaryRange
      }
    };
    return this.profile;
  }

  getSettings() {
    return this.settings;
  }

  updateSettings(patch) {
    this.settings = {
      ...this.settings,
      ...patch,
      sessions: { ...this.settings?.sessions, ...patch?.sessions }
    };
    if (patch?.sessions?.[this.settings.targetLLM]) {
      this.provider.setDefaultSessionProfile({
        ...this.provider.defaultSessionProfile,
        ...patch.sessions[this.settings.targetLLM]
      });
    }
    return this.settings;
  }

  bindSession(providerKey, sessionProfile) {
    const now = new Date().toISOString();
    this.settings.sessions = {
      ...this.settings.sessions,
      [providerKey]: {
        profilePath: sessionProfile.profilePath,
        lastLoginAt: now,
        cookiesEncrypted: true
      }
    };
    this.settings.targetLLM = providerKey;
    this.provider.setDefaultSessionProfile({
      profilePath: sessionProfile.profilePath,
      lastLoginAt: now
    });
    return this.settings.sessions[providerKey];
  }

  async testLLMSession() {
    return this.provider.testSession?.() ?? { ok: true, provider: 'mock' };
  }

  async askForMissingFields(missingFields) {
    const prompt = composePrompt('missing_info', { MISSING_FIELDS_LIST: missingFields });
    return this.provider.askForMissing({ missingFields, prompt });
  }
}
