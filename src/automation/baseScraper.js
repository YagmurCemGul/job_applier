import { setTimeout as wait } from 'node:timers/promises';

/**
 * Playwright tabanlı sürücüler için temel sınıf
 */
export class BaseScraper {
  /**
   * @param {{ playwright: import('playwright').BrowserContext, config: any }} options
   */
  constructor({ playwright, config }) {
    this.context = playwright;
    this.config = config;
  }

  /**
   * İnsan benzeri etkileşim için gecikme
   * @param {number} min
   * @param {number} max
   */
  async humanDelay(min = 200, max = 750) {
    const delta = Math.random() * (max - min) + min;
    await wait(delta);
  }

  async scrollPage(page) {
    await page.mouse.wheel(0, 400 + Math.random() * 200);
    await this.humanDelay();
  }

  async throttle(siteKey = 'global') {
    const limit = this.config.rateLimits?.[siteKey] ?? this.config.rateLimits?.global ?? 30;
    const interval = Math.ceil(60000 / limit);
    await wait(interval + Math.random() * 120);
  }

  async withRetry(fn, attempts = 3) {
    let lastError;
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        await wait(500 * (i + 1));
      }
    }
    throw lastError;
  }
}
