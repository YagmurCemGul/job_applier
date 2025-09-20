/**
 * Ortak veri modelleri ve yardımcıları
 * Not: SQLCipher gerçek kullanımı için native modüller gerekir; bu dosya sadece şema ve temel doğrulama sağlar.
 */

/**
 * @typedef {Object} UserProfile
 * @property {string} name
 * @property {string} email
 * @property {string[]} locations
 * @property {string[]} roles
 * @property {string[]} skills
 * @property {Array<{code: string, level: 'beginner'|'intermediate'|'advanced'|'native'}>} languages
 * @property {string} workAuth
 * @property {boolean} relocation
 * @property {{ currency: string, min: number, max: number }} salaryRange
 * @property {string} noticePeriod
 * @property {string} createdAt
 */

/**
 * @typedef {Object} ResumeVariant
 * @property {string} id
 * @property {string} baseResumeRef
 * @property {string} jobId
 * @property {string} diff
 * @property {{ pdf?: string, docx?: string }} filePaths
 */

/**
 * @typedef {Object} CoverLetter
 * @property {string} id
 * @property {string} jobId
 * @property {string} text
 * @property {'tr'|'en'} language
 * @property {string} tone
 */

/**
 * @typedef {Object} JobPosting
 * @property {string} id
 * @property {string} source
 * @property {string} url
 * @property {string} title
 * @property {string} company
 * @property {string} location
 * @property {string} description
 * @property {string[]} skills
 * @property {{ currency?: string, min?: number, max?: number }} salaryHint
 * @property {string} applyMethod
 */

/**
 * @typedef {Object} Application
 * @property {string} id
 * @property {string} jobId
 * @property {string} resumeVariantId
 * @property {string} coverLetterId
 * @property {'found'|'applied'|'hr'|'tech'|'offer'|'rejected'} status
 * @property {{ createdAt: string, updatedAt: string, submittedAt?: string }} timestamps
 * @property {string} notes
 * @property {{ screenshot?: string, logPath?: string }} evidence
 */

/**
 * @typedef {Object} AnswerVaultEntry
 * @property {string} questionKey
 * @property {string} answer
 * @property {'tr'|'en'} lang
 * @property {string} updatedAt
 */

/**
 * @typedef {Object} Settings
 * @property {'chatgpt'|'gemini'|'claude'} provider
 * @property {number} dailyCap
 * @property {{ global: number, linkedin: number, indeed: number, hiringCafe: number }} rateLimits
 * @property {string[]} blacklists
 * @property {string[]} whitelists
 * @property {boolean} nightMode
 */

/**
 * @param {Partial<UserProfile>} profile
 * @returns {UserProfile}
 */
export function createUserProfile(profile = {}) {
  const now = new Date();
  return {
    name: profile.name ?? 'Ad Soyad',
    email: profile.email ?? 'example@email.com',
    locations: profile.locations ?? [],
    roles: profile.roles ?? [],
    skills: profile.skills ?? [],
    languages: profile.languages ?? [{ code: 'tr', level: 'native' }],
    workAuth: profile.workAuth ?? 'Belirtilmedi',
    relocation: profile.relocation ?? false,
    salaryRange:
      profile.salaryRange ??
      {
        currency: 'TRY',
        min: 0,
        max: 0
      },
    noticePeriod: profile.noticePeriod ?? 'Hazır',
    createdAt: now.toISOString()
  };
}

/**
 * @param {Partial<Settings>} settings
 * @returns {Settings}
 */
export function createDefaultSettings(settings = {}) {
  return {
    provider: settings.provider ?? 'chatgpt',
    dailyCap: settings.dailyCap ?? 10,
    rateLimits:
      settings.rateLimits ??
      {
        global: 30,
        linkedin: 15,
        indeed: 15,
        hiringCafe: 10
      },
    blacklists: settings.blacklists ?? [],
    whitelists: settings.whitelists ?? [],
    nightMode: settings.nightMode ?? false
  };
}

/**
 * İlan eşleşmesi için skor hesaplama (basit anahtar kelime oranı)
 * @param {JobPosting} job
 * @param {UserProfile} profile
 * @returns {{ score: number, matchedSkills: string[] }}
 */
export function computeMatchScore(job, profile) {
  const skills = job.skills ?? [];
  const profileSkills = new Set((profile.skills ?? []).map((s) => s.toLowerCase()));
  if (skills.length === 0 || profileSkills.size === 0) {
    return { score: 0, matchedSkills: [] };
  }
  const matched = skills.filter((skill) => profileSkills.has(skill.toLowerCase()));
  const score = Math.round((matched.length / skills.length) * 100);
  return { score, matchedSkills: matched };
}

/**
 * @param {Application[]} applications
 * @returns {Record<string, number>}
 */
export function summarizePipeline(applications) {
  return applications.reduce((acc, app) => {
    acc[app.status] = (acc[app.status] ?? 0) + 1;
    return acc;
  }, /** @type {Record<string, number>} */ ({}));
}
