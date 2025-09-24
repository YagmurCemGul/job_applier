import { setTimeout as wait } from 'node:timers/promises';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, firefox, webkit } from 'playwright';

const BROWSER_TYPES = {
  chromium,
  firefox,
  webkit
};

/**
 * Playwright tabanlı sürücüler için temel sınıf
 */
export class BaseScraper {
  /**
   * @param {{ playwright?: import('playwright').BrowserContext, config?: any }} options
   */
  constructor({ playwright, config }) {
    this.context = playwright ?? null;
    this.config = config ?? {};
    this.logger = this.config.logger ?? console;
    this.lastAutomationError = null;
    const envDisable = process.env.PLAYWRIGHT_SCRAPERS_DISABLED === '1';
    this.disableAutomation = this.config?.disableAutomation ?? envDisable;
    this.managedContext = false;
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

  /**
   * Basit throttle uygulaması
   * @param {string} [siteKey]
   */
  async throttle(siteKey = 'global') {
    const limit = this.config.rateLimits?.[siteKey] ?? this.config.rateLimits?.global ?? 30;
    const interval = Math.ceil(60000 / limit);
    await wait(interval + Math.random() * 120);
  }

  /**
   * Playwright bağlamı oluşturur veya mevcut bağlamı döner.
   * Başarısız olursa null döner ve üst seviye mock dataset kullanabilir.
   * @returns {Promise<import('playwright').BrowserContext|null>}
   */
  async ensureContext() {
    if (this.context?.newPage) {
      return this.context;
    }

    if (this.disableAutomation) {
      return null;
    }

    const engineKey = this.config?.browser?.engine ?? 'chromium';
    const browserType = BROWSER_TYPES[engineKey] ?? chromium;

    const profilePath = this.config?.browser?.profilePath
      ? resolve(process.cwd(), this.config.browser.profilePath)
      : resolve(process.cwd(), 'profiles', this.constructor.name.toLowerCase());

    try {
      await mkdir(profilePath, { recursive: true });
      this.context = await browserType.launchPersistentContext(profilePath, {
        headless: this.config?.browser?.headless ?? false,
        locale: this.config?.browser?.locale ?? 'tr-TR',
        userAgent: this.config?.browser?.userAgent,
        viewport: this.config?.browser?.viewport ?? { width: 1280, height: 800 },
        args: this.config?.browser?.launchArgs ?? ['--disable-blink-features=AutomationControlled'],
        slowMo: this.config?.browser?.slowMo ?? 50
      });
      this.managedContext = true;
      return this.context;
    } catch (error) {
      this.lastAutomationError = error;
      this.logger?.warn?.(
        `[${this.constructor.name}] Playwright context oluşturulamadı, dataset fallback kullanılacak: ${error.message}`
      );
      return null;
    }
  }

  /**
   * Yeni bir sayfa açıp verilen URL'ye gider.
   * @param {string} url
   * @param {{ waitUntil?: import('playwright').LoadState, timeout?: number }} [options]
   */
  async newPage(url, options = {}) {
    const context = await this.ensureContext();
    if (!context) return null;
    const page = await context.newPage();
    const waitUntil = options.waitUntil ?? 'networkidle';
    const timeout = options.timeout ?? 45000;
    await page.goto(url, { waitUntil, timeout });
    return page;
  }

  /**
   * İlk eşleşen seçiciyi döndürür.
   * @param {import('playwright').Page} page
   * @param {string[]} selectors
   */
  async resolveLocator(page, selectors = []) {
    for (const selector of selectors) {
      const locator = page.locator(selector).first();
      if ((await locator.count()) > 0) {
        return locator;
      }
    }
    return null;
  }

  /**
   * Seçicilerden herhangi birinin görünür olup olmadığını kontrol eder.
   * @param {import('playwright').Page} page
   * @param {string[]} selectors
   */
  async isAnyVisible(page, selectors = []) {
    const locator = await this.resolveLocator(page, selectors);
    if (!locator) return false;
    try {
      return await locator.isVisible();
    } catch {
      return false;
    }
  }

  /**
   * Gerekirse kullanıcının manuel giriş yapmasını bekler.
   * @param {import('playwright').Page} page
   * @param {{ loginUrl?: string, authSelectors?: string[], loginSelectors?: string[], timeout?: number }} checkpoints
   */
  async ensureLoggedIn(page, checkpoints = {}) {
    const authSelectors = checkpoints.authSelectors ?? [];
    const loginSelectors = checkpoints.loginSelectors ?? [];
    const timeout = checkpoints.timeout ?? 60000;

    if (authSelectors.length > 0) {
      const alreadyLoggedIn = await this.isAnyVisible(page, authSelectors);
      if (alreadyLoggedIn) {
        return { loggedIn: true, manual: false };
      }
    }

    if (checkpoints.loginUrl) {
      await page.goto(checkpoints.loginUrl, { waitUntil: 'domcontentloaded' });
    }

    if (loginSelectors.length > 0) {
      const loginVisible = await this.isAnyVisible(page, loginSelectors);
      if (loginVisible) {
        this.logger?.info?.(
          `[${this.constructor.name}] Oturum tespit edilemedi, manuel giriş bekleniyor...`
        );
        try {
          await page.waitForFunction(
            (selectors) =>
              selectors.some((selector) => {
                const el = document.querySelector(selector);
                if (!el) return false;
                const style = window.getComputedStyle(el);
                return style?.display !== 'none' && style?.visibility !== 'hidden';
              }),
            authSelectors,
            { timeout }
          );
          return { loggedIn: true, manual: true };
        } catch (error) {
          this.logger?.warn?.(
            `[${this.constructor.name}] Oturum doğrulanamadı: ${error.message}`
          );
          return { loggedIn: false, manual: true };
        }
      }
    }

    return { loggedIn: true, manual: false };
  }

  /**
   * İnsan benzeri yazım
   * @param {import('playwright').Locator} locator
   * @param {string} value
   */
  async typeHuman(locator, value) {
    await locator.click({ delay: 100 });
    await locator.fill('');
    for (const char of value) {
      await locator.type(char, { delay: 50 + Math.random() * 100 });
    }
  }

  async closePage(page) {
    if (!page) return;
    try {
      await page.close();
    } catch (error) {
      this.logger?.warn?.(`[${this.constructor.name}] Sayfa kapatma hatası: ${error.message}`);
    }
  }

  async dispose() {
    if (this.context && this.managedContext) {
      await this.context.close();
    }
    this.context = null;
    this.managedContext = false;
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
