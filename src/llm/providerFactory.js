import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium, firefox, webkit } from 'playwright';

/**
 * Yardımcılar
 */
const BROWSER_TYPES = {
  chromium,
  firefox,
  webkit
};

const DEFAULT_DEBUG_DIR = join(process.cwd(), 'artifacts', 'llm-debug');

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

async function ensureDir(dir) {
  await mkdir(dir, { recursive: true });
}

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
   * Headful oturumu aç ve profil bilgilerini yükle. Stub sürücüde sadece durum saklanır.
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

/**
 * Playwright ile gerçek web arayüzünü kontrol eden sürücü.
 */
class PlaywrightWebLLMDriver extends BaseWebLLMDriver {
  /**
   * @param {{
   *  providerName: string,
   *  targetUrl: string,
   *  selectors: Record<string, string[]>,
   *  browserDefaults?: { engine?: 'chromium'|'firefox'|'webkit', headless?: boolean, userAgent?: string, profilePath?: string },
   *  launchArgs?: string[],
   *  antiStall?: { scroll?: boolean, refocus?: boolean, jitter?: boolean }
   * }} options
   */
  constructor(options) {
    super({ providerName: options.providerName });
    this.targetUrl = options.targetUrl;
    this.selectors = options.selectors ?? {};
    this.browserDefaults = {
      engine: options.browserDefaults?.engine ?? 'chromium',
      headless: options.browserDefaults?.headless ?? false,
      userAgent: options.browserDefaults?.userAgent,
      profilePath:
        options.browserDefaults?.profilePath ?? join(process.cwd(), '.llm-profiles', options.providerName)
    };
    this.launchArgs = options.launchArgs ?? ['--disable-blink-features=AutomationControlled'];
    this.antiStall = {
      scroll: true,
      refocus: true,
      jitter: true,
      ...(options.antiStall ?? {})
    };
    this.context = undefined;
    this.page = undefined;
  }

  async openSession(profile = {}) {
    const engine = profile.engine ?? this.browserDefaults.engine;
    const browserType = BROWSER_TYPES[engine] ?? chromium;
    const headless = profile.headless ?? this.browserDefaults.headless;
    const userAgent = profile.userAgent ?? this.browserDefaults.userAgent;
    const profilePath = resolve(profile.profilePath ?? this.browserDefaults.profilePath);
    await ensureDir(profilePath);

    if (this.context) {
      await this.context.close().catch(() => undefined);
      this.context = undefined;
      this.page = undefined;
    }

    this.context = await browserType.launchPersistentContext(profilePath, {
      headless,
      viewport: profile.viewport ?? { width: 1280, height: 720 },
      userAgent,
      ignoreHTTPSErrors: true,
      args: [...this.launchArgs, ...(profile.launchArgs ?? [])]
    });

    this.page = this.context.pages()[0] ?? (await this.context.newPage());
    await this.page.bringToFront().catch(() => undefined);

    if (!this.page.url() || this.page.url() === 'about:blank') {
      await this.page.goto(this.targetUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
    } else if (!this.page.url().startsWith(this.targetUrl)) {
      await this.page.goto(this.targetUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
    }

    await this.page.waitForLoadState('domcontentloaded', { timeout: 60000 }).catch(() => undefined);

    this.sessionProfile = {
      ...profile,
      engine,
      headless,
      userAgent,
      profilePath,
      openedAt: new Date().toISOString()
    };

    return { ok: true, provider: this.providerName, profile: this.sessionProfile };
  }

  async ensurePage() {
    if (!this.page) {
      throw new Error('LLM oturumu henüz başlatılmadı.');
    }
    return this.page;
  }

  typingDelay() {
    return 15 + Math.floor(Math.random() * 60);
  }

  async fillPromptArea(text) {
    const page = await this.ensurePage();
    const selectors = toArray(this.selectors.promptInput);
    for (const selector of selectors) {
      const locator = page.locator(selector).first();
      try {
        if (!(await locator.count())) {
          continue;
        }
        await locator.click({ clickCount: 1, timeout: 5000 });
        try {
          await locator.fill('');
          await locator.type(text, { delay: this.typingDelay() });
          return selector;
        } catch (fillError) {
          const filled = await page.evaluate(
            ({ sel, value }) => {
              const element = document.querySelector(sel);
              if (!element) return false;
              const isTextArea = Object.prototype.hasOwnProperty.call(element, 'value');
              if (isTextArea) {
                element.value = '';
                element.dispatchEvent(new Event('input', { bubbles: true }));
                element.value = value;
                element.dispatchEvent(new Event('input', { bubbles: true }));
                return true;
              }
              if (element.getAttribute && element.getAttribute('contenteditable') === 'true') {
                element.innerHTML = '';
                element.focus();
                const selection = window.getSelection();
                selection?.removeAllRanges();
                const range = document.createRange();
                range.selectNodeContents(element);
                selection?.addRange(range);
                document.execCommand('insertText', false, value);
                element.dispatchEvent(new Event('input', { bubbles: true }));
                return true;
              }
              return false;
            },
            { sel: selector, value: text }
          );
          if (filled) {
            return selector;
          }
        }
      } catch (error) {
        continue;
      }
    }
    throw new Error('Prompt alanı bulunamadı veya yazılamadı.');
  }

  buildPromptText(payload) {
    const { inputs = {}, constraints = {}, purpose } = payload;
    if (typeof inputs.prompt === 'string' && inputs.prompt.trim().length > 0) {
      return inputs.prompt;
    }
    const parts = [];
    if (inputs.preamble) {
      parts.push(inputs.preamble);
    }
    if (inputs.jobText) {
      parts.push(`İlan Metni:\n${inputs.jobText}`);
    }
    if (inputs.resumeText) {
      parts.push(`CV:\n${inputs.resumeText}`);
    }
    if (inputs.achievements?.length) {
      parts.push(`Başarılar:\n- ${inputs.achievements.join('\n- ')}`);
    }
    if (inputs.question) {
      parts.push(`Soru: ${inputs.question}`);
    }
    if (inputs.missingFields?.length) {
      parts.push(`Eksik Alanlar: ${inputs.missingFields.join(', ')}`);
    }
    if (constraints && Object.keys(constraints).length) {
      parts.push(`Kısıtlar: ${JSON.stringify(constraints, null, 2)}`);
    }
    if (parts.length === 0) {
      return `[${purpose}]`;
    }
    return parts.join('\n\n');
  }

  async sendPrompt(payload) {
    this.lastPrompt = payload;
    const page = await this.ensurePage();
    const text = this.buildPromptText(payload);
    const selector = await this.fillPromptArea(text);
    const sendSelectors = toArray(this.selectors.sendButton);
    for (const sendSelector of sendSelectors) {
      const button = page.locator(sendSelector).first();
      try {
        if ((await button.count()) && (await button.isEnabled())) {
          await button.click();
          return { submitted: true, selector, via: 'click', provider: this.providerName };
        }
      } catch (error) {
        continue;
      }
    }
    await page.keyboard.press('Enter');
    return { submitted: true, selector, via: 'enter', provider: this.providerName };
  }

  async anyVisible(selectors) {
    const page = await this.ensurePage();
    for (const selector of toArray(selectors)) {
      const locator = page.locator(selector).first();
      if (!(await locator.count())) continue;
      try {
        if (await locator.isVisible()) {
          return true;
        }
      } catch (error) {
        continue;
      }
    }
    return false;
  }

  async performAntiStall() {
    const page = await this.ensurePage();
    if (this.antiStall.scroll) {
      await page.mouse.wheel(0, 200 + Math.random() * 200).catch(() => undefined);
    }
    if (this.antiStall.refocus) {
      const selectors = toArray(this.selectors.promptInput);
      if (selectors.length > 0) {
        await page.locator(selectors[0]).click({ clickCount: 1 }).catch(() => undefined);
      }
    }
    if (this.antiStall.jitter) {
      await page.mouse.move(200 + Math.random() * 100, 300 + Math.random() * 100).catch(() => undefined);
    }
  }

  async awaitCompletion(options = {}) {
    const page = await this.ensurePage();
    const { timeout = 120000, stallHeuristics = [] } = options;
    const start = Date.now();
    const watchedSelectors = [
      ...toArray(this.selectors.generatingIndicators),
      ...toArray(this.selectors.typingIndicators),
      ...toArray(stallHeuristics)
    ];

    let lastUpdate = Date.now();
    while (Date.now() - start < timeout) {
      const active = await page.evaluate(
        ({ selectors }) => {
          const checkVisible = (sel) => {
            if (!sel) return false;
            return Array.from(document.querySelectorAll(sel)).some((el) => {
              const style = window.getComputedStyle(el);
              return style && style.visibility !== 'hidden' && style.display !== 'none' && el.offsetParent !== null;
            });
          };
          const { generatingIndicators = [], typingIndicators = [], spinnerSelectors = [] } = selectors ?? {};
          return [
            ...generatingIndicators,
            ...typingIndicators,
            ...spinnerSelectors
          ].some(checkVisible);
        },
        { selectors: this.selectors }
      );

      if (!active) {
        await page.waitForTimeout(600);
        const stopVisible = await this.anyVisible(this.selectors.stopButton);
        if (!stopVisible) {
          this.lastCompletionMeta = {
            completedAt: new Date().toISOString(),
            timeout,
            stallHeuristics
          };
          return { completed: true, heuristics: stallHeuristics };
        }
      }

      if (watchedSelectors.length > 0) {
        const anyWatched = await this.anyVisible(watchedSelectors);
        if (!anyWatched) {
          lastUpdate = Date.now();
        }
      }

      if (Date.now() - lastUpdate > 15000) {
        await this.performAntiStall();
        lastUpdate = Date.now();
      }

      await page.waitForTimeout(750);
    }

    await this.captureDebugArtifact('timeout');
    throw new Error(`${this.providerName} yanıtı belirtilen sürede tamamlanamadı.`);
  }

  async readResponse() {
    const page = await this.ensurePage();
    const response = await page.evaluate((selectors) => {
      const containers = [];
      for (const sel of selectors.responseBlocks ?? []) {
        const nodes = Array.from(document.querySelectorAll(sel));
        if (nodes.length) {
          containers.push(...nodes);
        }
      }
      const target = containers.length ? containers[containers.length - 1] : undefined;
      if (!target) {
        return { text: '', structured: {} };
      }
      const text = target.innerText ?? target.textContent ?? '';
      const html = target.innerHTML ?? '';
      const blocks = [];
      target.querySelectorAll('pre, code').forEach((node) => {
        blocks.push({ type: 'code', text: node.innerText ?? node.textContent ?? '' });
      });
      target.querySelectorAll('ul > li, ol > li').forEach((node) => {
        blocks.push({ type: 'list-item', text: node.innerText ?? node.textContent ?? '' });
      });
      target.querySelectorAll('p').forEach((node) => {
        blocks.push({ type: 'paragraph', text: node.innerText ?? node.textContent ?? '' });
      });
      return { text, html, blocks };
    }, this.selectors);

    this.lastResponse = response;
    return response;
  }

  async attachFile(path) {
    const page = await this.ensurePage();
    const fileInputs = toArray(this.selectors.fileInput);
    for (const selector of fileInputs) {
      const locator = page.locator(selector).first();
      if (!(await locator.count())) continue;
      try {
        await locator.setInputFiles(path);
        return { attached: true, selector };
      } catch (error) {
        continue;
      }
    }

    // Fallback: beklenen ekleme butonuna tıklayıp filechooser yakala
    const triggerSelectors = toArray(this.selectors.fileTrigger);
    for (const trigger of triggerSelectors) {
      const locator = page.locator(trigger).first();
      if (!(await locator.count())) continue;
      try {
        const [chooser] = await Promise.all([
          page.waitForEvent('filechooser', { timeout: 10000 }),
          locator.click()
        ]);
        await chooser.setFiles(path);
        return { attached: true, selector: trigger };
      } catch (error) {
        continue;
      }
    }

    throw new Error('Dosya ekleme alanı bulunamadı.');
  }

  async captureDebugArtifact(label) {
    if (!process.env.LLM_DEBUG) {
      return undefined;
    }
    try {
      const page = await this.ensurePage();
      const dir = process.env.LLM_DEBUG_DIR ? resolve(process.env.LLM_DEBUG_DIR) : DEFAULT_DEBUG_DIR;
      await ensureDir(dir);
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const baseName = `${this.providerName}-${label}-${stamp}-${randomUUID().slice(0, 8)}`;
      const screenshotPath = join(dir, `${baseName}.png`);
      const htmlPath = join(dir, `${baseName}.html`);
      await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => undefined);
      const html = await page.content();
      await writeFile(htmlPath, html, 'utf8');
      return { screenshotPath, htmlPath };
    } catch (error) {
      return undefined;
    }
  }

  async handleErrors() {
    const page = await this.ensurePage();
    const url = page.url();
    if (!url.startsWith(this.targetUrl)) {
      await this.captureDebugArtifact('redirect');
      return { recovered: false, requiresUser: true, reason: 'redirected' };
    }

    if (await this.anyVisible(this.selectors.loginIndicators)) {
      await this.captureDebugArtifact('login-required');
      return { recovered: false, requiresUser: true, reason: 'login-required' };
    }

    if (await this.anyVisible(this.selectors.captchaSelectors)) {
      await this.captureDebugArtifact('captcha');
      return { recovered: false, requiresUser: true, reason: 'captcha' };
    }

    if (await this.anyVisible(this.selectors.cloudflareSelectors)) {
      await this.captureDebugArtifact('cloudflare');
      return { recovered: false, requiresUser: true, reason: 'cloudflare' };
    }

    return { recovered: true };
  }

  chunkText(text, maxChars = 3500, overlap = 200) {
    if (!text) return [];
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (!normalized) return [];
    const segments = [];
    let index = 0;
    while (index < normalized.length) {
      const end = Math.min(normalized.length, index + maxChars);
      const chunk = normalized.slice(index, end);
      segments.push(chunk);
      if (end === normalized.length) {
        break;
      }
      index = end - overlap;
      if (index < 0) index = 0;
    }
    return segments;
  }

  async splitAndChain(options = {}) {
    const segments = [];
    if (Array.isArray(options.segments) && options.segments.length > 0) {
      segments.push(...options.segments);
    } else if (typeof options.text === 'string') {
      const chunks = this.chunkText(options.text, options.maxChars ?? 3500, options.overlap ?? 200);
      let i = 0;
      for (const chunk of chunks) {
        segments.push({
          role: 'assistant',
          purpose: options.purpose ?? 'chunked_prompt',
          inputs: {
            prompt: `${options.prefix ?? ''}${chunk}${options.suffix ?? ''}`,
            chunkIndex: i + 1,
            totalChunks: chunks.length
          },
          constraints: options.constraints
        });
        i += 1;
      }
    }

    const outputs = [];
    for (const segment of segments) {
      await this.sendPrompt(segment);
      await this.awaitCompletion({
        timeout: options.timeout ?? 180000,
        stallHeuristics: options.stallHeuristics ?? ['typing-indicator']
      });
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

const chatgptSelectors = {
  promptInput: [
    'textarea#prompt-textarea',
    'div[data-testid="textbox"] textarea',
    'textarea[placeholder*="Mesaj"]',
    'textarea[placeholder*="Message"]'
  ],
  sendButton: ['button[data-testid="send-button"]', 'button:has-text("Gönder")', 'button:has-text("Send")'],
  stopButton: ['button[data-testid="stop-button"]', 'button:has-text("Stop generating")'],
  generatingIndicators: ['button[data-testid="stop-button"]', 'div[class*="typingIndicator"]'],
  typingIndicators: ['div[data-testid="conversation-turn"] svg[aria-label="typing"]'],
  spinnerSelectors: ['div[data-testid="spinner"]'],
  responseBlocks: [
    'div[data-testid="conversation-turn"] div.markdown',
    'article:has(div.markdown)',
    'div.markdown.prose'
  ],
  loginIndicators: ['input[name="username"]', 'button:has-text("Log in")', 'button:has-text("Sign in")'],
  captchaSelectors: ['iframe[title*="security"]', 'div[class*="captcha"]'],
  cloudflareSelectors: ['div[id*="cf-challenge"]', 'div[class*="cloudflare"]'],
  fileInput: ['input[type="file"][accept*="."]'],
  fileTrigger: ['button[data-testid="upload-button"]', 'button:has-text("Dosya ekle")']
};

const geminiSelectors = {
  promptInput: [
    'textarea[name="promptTextArea"]',
    'textarea[aria-label*="Mesaj"]',
    'textarea[aria-label*="Message"]'
  ],
  sendButton: ['button[aria-label="Send message"]', 'button[aria-label*="Gönder"]'],
  stopButton: ['button[aria-label="Stop"]'],
  generatingIndicators: ['button[aria-label="Stop"]', 'md-linear-progress', 'div[role="progressbar"]'],
  typingIndicators: ['div[aria-live="assertive"] svg[aria-label="progress"]'],
  spinnerSelectors: ['md-circular-progress'],
  responseBlocks: ['div.response-container div.markdown', 'main article markdown'],
  loginIndicators: ['input[type="email"]', 'div[role="heading"]:has-text("Sign in")'],
  captchaSelectors: ['iframe[title*="recaptcha"]'],
  cloudflareSelectors: [],
  fileInput: ['input[type="file"]'],
  fileTrigger: ['button[aria-label*="Dosya"]', 'button[aria-label*="Upload"]']
};

const claudeSelectors = {
  promptInput: [
    'textarea[data-testid="input-textarea"]',
    'textarea[placeholder*="Message Claude"]',
    'textarea[placeholder*="Mesaj"]'
  ],
  sendButton: ['button[data-testid="send-button"]', 'button:has-text("Send")'],
  stopButton: ['button[data-testid="stop-button"]', 'button:has-text("Stop")'],
  generatingIndicators: ['button[data-testid="stop-button"]', 'div[data-testid="loading-dots"]'],
  typingIndicators: ['div[data-testid="typing-indicator"]'],
  spinnerSelectors: ['div[class*="spinner"]'],
  responseBlocks: ['section[data-testid="chat-message"] article', 'div[data-testid="assistant-response"]'],
  loginIndicators: ['input[name="email"]', 'button:has-text("Log in")'],
  captchaSelectors: ['iframe[title*="captcha"]'],
  cloudflareSelectors: ['div[id="cf-overlay"]', 'div[class*="cloudflare"]'],
  fileInput: ['input[type="file"]'],
  fileTrigger: ['button[data-testid="attach-button"]']
};

class ChatGPTWebDriver extends PlaywrightWebLLMDriver {
  constructor(options = {}) {
    super({
      providerName: 'chatgpt',
      targetUrl: 'https://chat.openai.com',
      selectors: chatgptSelectors,
      browserDefaults: options.browserDefaults,
      launchArgs: options.launchArgs,
      antiStall: options.antiStall
    });
  }

  async awaitCompletion(options = {}) {
    const heuristics = Array.from(
      new Set([...(options?.stallHeuristics ?? []), 'button[data-testid="stop-button"]'])
    );
    return super.awaitCompletion({ ...options, stallHeuristics: heuristics });
  }
}

class GeminiWebDriver extends PlaywrightWebLLMDriver {
  constructor(options = {}) {
    super({
      providerName: 'gemini',
      targetUrl: 'https://gemini.google.com',
      selectors: geminiSelectors,
      browserDefaults: options.browserDefaults,
      launchArgs: options.launchArgs,
      antiStall: options.antiStall
    });
  }

  async awaitCompletion(options = {}) {
    const heuristics = Array.from(new Set([...(options?.stallHeuristics ?? []), 'md-linear-progress']));
    return super.awaitCompletion({ ...options, stallHeuristics: heuristics });
  }
}

class ClaudeWebDriver extends PlaywrightWebLLMDriver {
  constructor(options = {}) {
    super({
      providerName: 'claude',
      targetUrl: 'https://claude.ai',
      selectors: claudeSelectors,
      browserDefaults: options.browserDefaults,
      launchArgs: options.launchArgs,
      antiStall: options.antiStall
    });
  }

  async awaitCompletion(options = {}) {
    const heuristics = Array.from(
      new Set([...(options?.stallHeuristics ?? []), 'div[data-testid="loading-dots"]'])
    );
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

  async testSession() {
    const profile = await this.ensureSession();
    await this.driver.sendPrompt({
      role: 'assistant',
      purpose: 'form_qa',
      inputs: { question: 'Oturum testi' }
    });
    await this.driver.awaitCompletion({ stallHeuristics: ['typing-indicator'] });
    const errorState = await this.driver.handleErrors();
    const response = await this.driver.readResponse();
    return {
      ok: errorState.recovered !== false,
      provider: this.driver.providerName,
      profile,
      sample: response?.text ?? ''
    };
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
    await this.driver.awaitCompletion({ stallHeuristics: ['button[data-testid="stop-button"]'] });
    const errorState = await this.driver.handleErrors();
    const response = await this.driver.readResponse();
    if (errorState.recovered === false) {
      return {
        error: errorState.reason,
        text: response?.text ?? ''
      };
    }
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
    const errorState = await this.driver.handleErrors();
    const response = await this.driver.readResponse();
    const structured = response?.structured ?? {};
    return {
      diff: structured.diff ?? ['LLM yanıtı alınamadı.'],
      resume: structured.resume ?? response?.text ?? '',
      error: errorState.recovered === false ? errorState.reason : undefined
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
    const errorState = await this.driver.handleErrors();
    const response = await this.driver.readResponse();
    const structured = response?.structured ?? { questions: [] };
    if (errorState.recovered === false) {
      structured.error = errorState.reason;
    }
    return structured;
  }
}

/**
 * Sağlayıcı bazlı web LLM servisini oluştur.
 * @param {'chatgpt'|'gemini'|'claude'|'mock'} provider
 * @param {{ sessionProfile?: Record<string, any>, browserDefaults?: any, launchArgs?: string[], antiStall?: any }} [options]
 */
export function createProvider(provider, options = {}) {
  const { sessionProfile, browserDefaults, launchArgs, antiStall } = options;
  let driver;
  switch (provider) {
    case 'chatgpt':
      driver = new ChatGPTWebDriver({ browserDefaults, launchArgs, antiStall });
      break;
    case 'gemini':
      driver = new GeminiWebDriver({ browserDefaults, launchArgs, antiStall });
      break;
    case 'claude':
      driver = new ClaudeWebDriver({ browserDefaults, launchArgs, antiStall });
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
  MockWebLLMDriver,
  PlaywrightWebLLMDriver
};
