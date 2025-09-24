import { setTimeout as wait } from 'node:timers/promises';
import { access, mkdir, writeFile } from 'node:fs/promises';
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

  get applicant() {
    return this.config?.applicant ?? {};
  }

  get applicantAnswers() {
    return this.applicant?.answers ?? {};
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

  normalizeQuestionKey(text) {
    if (!text) return '';
    return text
      .toLowerCase()
      .replace(/[^a-z0-9çğıöşü\s]/gi, '')
      .trim()
      .replace(/\s+/g, '_')
      .slice(0, 160);
  }

  lookupAnswer(questionText, answers = this.applicantAnswers) {
    if (!questionText) return undefined;
    const normalized = this.normalizeQuestionKey(questionText);
    return answers?.[normalized] ?? answers?.[questionText] ?? undefined;
  }

  async autoFillQuestions(page, answers = this.applicantAnswers, steps = [], errors = []) {
    if (!answers || Object.keys(answers).length === 0) {
      return;
    }

    const questionSelectors = [
      '[data-test-form-element]',
      '.jobs-easy-apply-form-element',
      '.ia-FormQuestion',
      'fieldset[data-test-form-element]',
      'div[data-testid="QuestionContainer"]'
    ];

    const handles = await page.$$(questionSelectors.join(','));
    for (const handle of handles) {
      try {
        const questionText = await handle.evaluate((node) => {
          const label =
            node.querySelector('.jobs-easy-apply-form-element__question') ||
            node.querySelector('[data-test="form-label"]') ||
            node.querySelector('label, legend, h2, h3, h4');
          return label?.textContent?.trim() ?? '';
        });
        if (!questionText) continue;
        const answerValue = this.lookupAnswer(questionText, answers);
        if (!answerValue) continue;
        const normalizedKey = this.normalizeQuestionKey(questionText);
        const descriptor =
          typeof answerValue === 'string'
            ? { value: answerValue, type: 'text' }
            : { type: 'text', ...answerValue };

        let filled = false;

        const input = await handle.$('textarea, input[type="text"], input[type="number"], input[type="tel"], input[type="url"], input:not([type])');
        if (input && descriptor.type !== 'select' && descriptor.type !== 'option') {
          await input.fill('');
          await input.type(descriptor.value, { delay: 40 + Math.random() * 80 });
          filled = true;
        }

        if (!filled) {
          const select = await handle.$('select');
          if (select) {
            try {
              await select.selectOption({ label: descriptor.value });
            } catch {
              await select.selectOption({ value: descriptor.value });
            }
            filled = true;
          }
        }

        if (!filled) {
          const radios = await handle.$$('input[type="radio"]');
          if (radios.length > 0) {
            const lowerValue = descriptor.value.toLowerCase();
            for (const radio of radios) {
              const label = await radio.evaluate((node) => {
                const labelNode = node.closest('label') ?? node.parentElement;
                return labelNode?.textContent?.trim() ?? '';
              });
              if (label.toLowerCase().includes(lowerValue)) {
                await radio.click();
                filled = true;
                break;
              }
            }
          }
        }

        if (!filled) {
          const checkboxes = await handle.$$('input[type="checkbox"]');
          if (checkboxes.length > 0) {
            const shouldCheck = descriptor.value === true || descriptor.value === 'true' || descriptor.value === 'yes';
            for (const checkbox of checkboxes) {
              const isChecked = await checkbox.isChecked();
              if (shouldCheck && !isChecked) {
                await checkbox.click();
                filled = true;
              } else if (!shouldCheck && isChecked) {
                await checkbox.click();
                filled = true;
              }
            }
          }
        }

        if (!filled) {
          errors.push({ field: questionText, reason: 'answer-apply-failed' });
        } else {
          steps.push(`answer:${normalizedKey}`);
        }
      } catch (error) {
        errors.push({ field: 'dynamic-question', reason: error.message });
      }
    }
  }

  async collectValidationErrors(page) {
    const selectors = [
      '.artdeco-inline-feedback__message',
      '.artdeco-toast-item__message',
      '.jobs-easy-apply-alert__text',
      '.ia-ErrorMessage',
      'div[role="alert"]',
      '[data-test="form-error-message"]'
    ];
    try {
      const messages = await page.evaluate((errorSelectors) => {
        const unique = new Set();
        errorSelectors.forEach((selector) => {
          document.querySelectorAll(selector).forEach((node) => {
            const text = node.textContent?.trim();
            if (text) {
              unique.add(text);
            }
          });
        });
        return Array.from(unique);
      }, selectors);
      return messages;
    } catch (error) {
      this.logger?.warn?.(
        `[${this.constructor.name}] Doğrulama hataları okunamadı: ${error.message}`
      );
      return [];
    }
  }

  async captureDebugArtifacts(page, prefix = 'apply') {
    const targetDir = resolve(
      process.cwd(),
      this.config?.debug?.artifactPath ?? 'artifacts/apply'
    );
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const baseName = `${prefix}-${timestamp}`;
    const screenshotPath = resolve(targetDir, `${baseName}.png`);
    const htmlPath = resolve(targetDir, `${baseName}.html`);
    try {
      await mkdir(targetDir, { recursive: true });
    } catch (error) {
      this.logger?.warn?.(
        `[${this.constructor.name}] Artifact klasörü oluşturulamadı: ${error.message}`
      );
    }

    try {
      await page.screenshot({ path: screenshotPath, fullPage: true });
    } catch (error) {
      this.logger?.warn?.(
        `[${this.constructor.name}] Screenshot alınamadı: ${error.message}`
      );
    }

    try {
      const html = await page.content();
      await writeFile(htmlPath, html, 'utf8');
    } catch (error) {
      this.logger?.warn?.(
        `[${this.constructor.name}] HTML snapshot kaydedilemedi: ${error.message}`
      );
    }

    return { screenshotPath, htmlPath };
  }

  async fileExists(filePath) {
    try {
      await access(filePath);
      return true;
    } catch {
      return false;
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
