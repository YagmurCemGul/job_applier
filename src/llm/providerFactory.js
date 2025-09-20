/**
 * LLM sağlayıcı soyutlaması
 */

class BaseProvider {
  /**
   * @param {{ apiKey: string }} options
   */
  constructor(options) {
    this.apiKey = options.apiKey;
  }

  async generateCoverLetter(payload) {
    throw new Error('Not implemented');
  }

  async tailorResume(payload) {
    throw new Error('Not implemented');
  }

  async answerFormQuestion(payload) {
    throw new Error('Not implemented');
  }

  async askForMissing(payload) {
    throw new Error('Not implemented');
  }
}

class MockProvider extends BaseProvider {
  async generateCoverLetter({ jobText, achievements, tone, language }) {
    return `(${language?.toUpperCase() ?? 'TR'} | ${tone}) ${achievements?.join(', ') ?? ''}\n${jobText.slice(0, 120)}...`;
  }

  async tailorResume({ jobText, resumeText }) {
    return {
      diff: ['Deneyim bölümünü ilan gereksinimlerine göre güncelleyin.'],
      resume: `${resumeText}\n\n---\nUyarlanan Özet:\n${jobText.slice(0, 200)}...`
    };
  }

  async answerFormQuestion({ question }) {
    return {
      answer: `Örnek yanıt: ${question.slice(0, 80)}...`,
      needsUserApproval: false
    };
  }

  async askForMissing({ missingFields }) {
    const questions = missingFields.slice(0, 3).map((field) => ({
      q: `${field} bilgisini paylaşır mısınız?`,
      options: []
    }));
    return { questions };
  }
}

/**
 * @param {'chatgpt'|'gemini'|'claude'|'mock'} provider
 * @param {{ apiKey: string }} options
 */
export function createProvider(provider, options) {
  switch (provider) {
    case 'mock':
      return new MockProvider(options);
    default:
      return new BaseProvider(options);
  }
}

export { BaseProvider };
