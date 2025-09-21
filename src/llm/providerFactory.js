/**
 * LLM web arayüz otomasyonu için sürücü ve servis soyutlaması
 */

/**
 * @typedef {Object} PromptPayload
 * @property {string} role
 * @property {string} purpose
 * @property {Record<string, any>} [inputs]
 * @property {Record<string, any>} [constraints]
 */

/**
 * Playwright tabanlı web LLM sürücülerinin temel sınıfı.
 */
export class BaseWebLLMDriver {
  /**
   * @param {{ providerName?: string }} [options]
   */
  constructor(options = {}) {
    this.providerName = options.providerName ?? 'base';
    this.sessionProfile = undefined;
    this.lastPrompt = undefined;
    this.lastResponse = undefined;
    this.lastCompletionMeta = undefined;
  }

  /**
   * Headful oturumu aç ve profil bilgilerini yükle.
   * @param {Record<string, any>} [profile]
   */
  async openSession(profile = {}) {
    this.sessionProfile = { ...profile, openedAt: new Date().toISOString() };
    return { ok: true, provider: this.providerName, profile: this.sessionProfile };
  }

  /**
   * Prompt'u sohbet alanına gönder (stub).
   * @param {PromptPayload} payload
   */
  async sendPrompt(payload) {
    this.lastPrompt = payload;
    return { submitted: true, provider: this.providerName };
  }

  /**
   * Yanıtın tamamlanmasını DOM sinyalleriyle izle (stub).
   * @param {{ timeout?: number, stallHeuristics?: string[] }} [options]
   */
  async awaitCompletion(options = {}) {
    const { timeout = 120000, stallHeuristics = [] } = options;
    this.lastCompletionMeta = { timeout, stallHeuristics, completedAt: new Date().toISOString() };
    return { completed: true, heuristics: stallHeuristics };
  }

  /**
   * DOM'dan yanıtı oku (stub).
   */
  async readResponse() {
    return this.lastResponse ?? { text: '', structured: {} };
  }

  /**
   * Dosya eklemesi (ör. CV) yap (stub).
   * @param {string} path
   */
  async attachFile(path) {
    this.lastAttachment = path;
    return { attached: Boolean(path) };
  }

  /**
   * Hata durumlarını kontrol et (stub).
   * @returns {Promise<{ recovered: boolean, requiresUser?: boolean, reason?: string }>}
   */
  async handleErrors() {
    return { recovered: true };
  }

  /**
   * Uzun içerikleri parça parça gönderip yanıtları birleştir (stub).
   * @param {{ segments: PromptPayload[] }} options
   */
  async splitAndChain(options) {
    const outputs = [];
    for (const segment of options?.segments ?? []) {
      await this.sendPrompt(segment);
      await this.awaitCompletion({ stallHeuristics: ['typing-indicator'] });
      const response = await this.readResponse();
      if (response?.text) {
        outputs.push(response.text);
      }
    }
    return outputs.join('\n');
  }
}

class MockWebLLMDriver extends BaseWebLLMDriver {
  constructor(options = {}) {
    super({ ...options, providerName: options.providerName ?? 'mock' });
  }

  async sendPrompt(payload) {
    await super.sendPrompt(payload);
    const { purpose, inputs = {} } = payload;
    switch (purpose) {
      case 'cover_letter': {
        const jobPreview = (inputs.jobText ?? '').slice(0, 120);
        const achievements = Array.isArray(inputs.achievements) ? inputs.achievements.join(', ') : '';
        this.lastResponse = {
          text: `(${this.providerName}) Cover Letter Taslağı: ${achievements}\n${jobPreview}...`,
          structured: {
            coverLetter: `Sayın İlgili,\n\n(${this.providerName}) ${achievements || 'Deneyimlerinizi'} vurgulayan bir taslak.\n\n${jobPreview}...\n\nSaygılarımla,\nMock Agent`
          }
        };
        break;
      }
      case 'resume_tailoring': {
        const targetSkills = Array.isArray(inputs.targetSkills) ? inputs.targetSkills.join(', ') : 'öncelikli beceriler';
        const resumeText = inputs.resumeText ?? '';
        const jobPreview = (inputs.jobText ?? '').slice(0, 160);
        this.lastResponse = {
          text: `(${this.providerName}) Resume Diff: ${targetSkills}`,
          structured: {
            diff: [`${targetSkills} becerilerini öne çıkaracak şekilde deneyim bölümünü güncelle.`],
            resume: `${resumeText}\n\n---\nÖne çıkarılan ilan özeti (${this.providerName}): ${jobPreview}...`
          }
        };
        break;
      }
      case 'form_qa': {
        const question = inputs.question ?? '';
        this.lastResponse = {
          text: `(${this.providerName}) Yanıt: ${question.slice(0, 80)}...`,
          structured: {
            answer: `(${this.providerName}) ${question} sorusu için örnek yanıt`,
            needsUserApproval: false
          }
        };
        break;
      }
      case 'missing_info': {
        const missingFields = Array.isArray(inputs.missingFields) ? inputs.missingFields : [];
        this.lastResponse = {
          text: `(${this.providerName}) Eksik alan sorgusu`,
          structured: {
            questions: missingFields.slice(0, 3).map((field) => ({
              q: `${field} bilgisine ihtiyacımız var, aşağıdaki seçeneklerden seçebilir veya yanıt yazabilirsiniz.`,
              options: []
            }))
          }
        };
        break;
      }
      default: {
        this.lastResponse = {
          text: `(${this.providerName}) Yanıt: ${purpose}`,
          structured: {}
        };
      }
    }
    return { submitted: true, provider: this.providerName };
  }
}

class ChatGPTWebDriver extends MockWebLLMDriver {
  constructor(options = {}) {
    super({ ...options, providerName: 'chatgpt' });
  }

  async awaitCompletion(options = {}) {
    const heuristics = Array.from(new Set([...(options?.stallHeuristics ?? []), 'stop-button', 'typing-indicator']));
    return super.awaitCompletion({ ...options, stallHeuristics: heuristics });
  }
}

class GeminiWebDriver extends MockWebLLMDriver {
  constructor(options = {}) {
    super({ ...options, providerName: 'gemini' });
  }

  async awaitCompletion(options = {}) {
    const heuristics = Array.from(new Set([...(options?.stallHeuristics ?? []), 'progress-ring']));
    return super.awaitCompletion({ ...options, stallHeuristics: heuristics });
  }
}

class ClaudeWebDriver extends MockWebLLMDriver {
  constructor(options = {}) {
    super({ ...options, providerName: 'claude' });
  }

  async awaitCompletion(options = {}) {
    const heuristics = Array.from(new Set([...(options?.stallHeuristics ?? []), 'stop-generating-button']));
    return super.awaitCompletion({ ...options, stallHeuristics: heuristics });
  }
}

/**
 * Web LLM servis katmanı, sürücüye yüksek seviyeli işlemler sunar.
 */
export class WebLLMService {
  /**
   * @param {BaseWebLLMDriver} driver
   * @param {{ sessionProfile?: Record<string, any> }} [options]
   */
  constructor(driver, options = {}) {
    this.driver = driver;
    this.defaultSessionProfile = options.sessionProfile ?? {};
    this.sessionReady = false;
  }

  /**
   * Varsayılan oturum profilini güncelle.
   * @param {Record<string, any>} profile
   */
  setDefaultSessionProfile(profile) {
    this.defaultSessionProfile = profile ?? {};
    this.sessionReady = false;
  }

  async ensureSession(profile) {
    const finalProfile = { ...this.defaultSessionProfile, ...(profile ?? {}) };
    if (!this.sessionReady || profile?.forceReconnect) {
      await this.driver.openSession(finalProfile);
      this.sessionReady = true;
    }
    return finalProfile;
  }

  /**
   * @param {{ jobText: string, achievements?: string[], tone?: string, language?: string, prompt?: string, sessionProfile?: Record<string, any> }} payload
   */
  async generateCoverLetter(payload) {
    const { sessionProfile, jobText, achievements = [], tone = 'samimi', language = 'tr', prompt } = payload;
    await this.ensureSession(sessionProfile);
    await this.driver.sendPrompt({
      role: 'assistant',
      purpose: 'cover_letter',
      inputs: { jobText, achievements, tone, language, prompt },
      constraints: { tone, language, maxLength: '1_page' }
    });
    await this.driver.awaitCompletion({ stallHeuristics: ['stop-button'] });
    await this.driver.handleErrors();
    const response = await this.driver.readResponse();
    return response?.structured?.coverLetter ?? response?.text ?? '';
  }

  /**
   * @param {{ jobText: string, resumeText: string, targetSkills?: string[], prompt?: string, sessionProfile?: Record<string, any> }} payload
   */
  async tailorResume(payload) {
    const { sessionProfile, jobText, resumeText, targetSkills = [], prompt } = payload;
    await this.ensureSession(sessionProfile);
    await this.driver.sendPrompt({
      role: 'assistant',
      purpose: 'resume_tailoring',
      inputs: { jobText, resumeText, targetSkills, prompt },
      constraints: { maxPages: 1 }
    });
    await this.driver.awaitCompletion({ stallHeuristics: ['typing-indicator'] });
    await this.driver.handleErrors();
    const response = await this.driver.readResponse();
    const structured = response?.structured ?? {};
    return {
      diff: structured.diff ?? ['Mock diff önerisi'],
      resume: structured.resume ?? response?.text ?? ''
    };
  }

  /**
   * @param {{ question: string, profile?: Record<string, any>, vaultEntry?: any, prompt?: string, sessionProfile?: Record<string, any> }} payload
   */
  async answerFormQuestion(payload) {
    const { sessionProfile, question, profile, vaultEntry, prompt } = payload;
    await this.ensureSession(sessionProfile);
    await this.driver.sendPrompt({
      role: 'assistant',
      purpose: 'form_qa',
      inputs: { question, profile, vaultEntry, prompt }
    });
    await this.driver.awaitCompletion({ stallHeuristics: ['typing-indicator'] });
    const errorState = await this.driver.handleErrors();
    const response = await this.driver.readResponse();
    const structured = response?.structured ?? {};
    return {
      answer: structured.answer ?? response?.text ?? '',
      needsUserApproval: structured.needsUserApproval ?? errorState?.requiresUser ?? false,
      suggestions: structured.suggestions ?? []
    };
  }

  /**
   * @param {{ missingFields: string[], prompt?: string, sessionProfile?: Record<string, any> }} payload
   */
  async askForMissing(payload) {
    const { sessionProfile, missingFields, prompt } = payload;
    await this.ensureSession(sessionProfile);
    await this.driver.sendPrompt({
      role: 'assistant',
      purpose: 'missing_info',
      inputs: { missingFields, prompt }
    });
    await this.driver.awaitCompletion({ stallHeuristics: ['prompt-hint'] });
    await this.driver.handleErrors();
    const response = await this.driver.readResponse();
    return response?.structured ?? { questions: [] };
  }
}

/**
 * Sağlayıcı bazlı web LLM servisini oluştur.
 * @param {'chatgpt'|'gemini'|'claude'|'mock'} provider
 * @param {{ sessionProfile?: Record<string, any> }} [options]
 */
export function createProvider(provider, options = {}) {
  const { sessionProfile } = options;
  let driver;
  switch (provider) {
    case 'chatgpt':
      driver = new ChatGPTWebDriver();
      break;
    case 'gemini':
      driver = new GeminiWebDriver();
      break;
    case 'claude':
      driver = new ClaudeWebDriver();
      break;
    case 'mock':
    default:
      driver = new MockWebLLMDriver({ providerName: provider ?? 'mock' });
      break;
  }
  return new WebLLMService(driver, { sessionProfile });
}

export {
  ChatGPTWebDriver,
  GeminiWebDriver,
  ClaudeWebDriver,
  MockWebLLMDriver
};
