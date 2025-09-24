import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test, expect } from '@playwright/test';
import {
  ChatGPTWebDriver,
  GeminiWebDriver,
  ClaudeWebDriver
} from '../../src/llm/providerFactory.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, 'fixtures');
const HEADLESS = process.env.CI ? true : !process.env.DISPLAY;

function createProfileDir(provider) {
  return mkdtempSync(join(tmpdir(), `llm-${provider}-`));
}

function fixturePath(name) {
  return join(fixturesDir, name);
}

function toFileUrl(path) {
  return pathToFileURL(path).href;
}

test.describe.configure({ mode: 'serial' });

test.describe('LLM web sürücüleri E2E', () => {
  const providers = [
    { name: 'chatgpt', Driver: ChatGPTWebDriver, fixture: 'chatgpt-session.html' },
    { name: 'gemini', Driver: GeminiWebDriver, fixture: 'gemini-session.html' },
    { name: 'claude', Driver: ClaudeWebDriver, fixture: 'claude-session.html' }
  ];

  for (const { name, Driver, fixture } of providers) {
    test(`${name} oturumu kalıcı profil ile tamamlayıp yanıt okur`, async () => {
      const profileDir = createProfileDir(name);
      const driver = new Driver({
        browserDefaults: {
          profilePath: profileDir,
          headless: HEADLESS
        }
      });
      driver.targetUrl = toFileUrl(fixturePath(fixture));

      try {
        const sessionOpen = await driver.openSession({ headless: HEADLESS });
        expect(sessionOpen.ok).toBeTruthy();

        await driver.page.waitForTimeout(100);
        await driver.page.evaluate(() => {
          localStorage.setItem('persisted', 'true');
        });

        await driver.sendPrompt({
          role: 'user',
          purpose: 'cover_letter',
          inputs: {
            jobText: 'Kıdemli Yazılım Geliştirici ilanı',
            achievements: ['Playwright E2E senaryoları']
          }
        });
        await driver.awaitCompletion({ timeout: 5000 });
        const response = await driver.readResponse();
        expect(response.text).toContain('Kıdemli');

        await driver.context.close();
        driver.context = undefined;
        driver.page = undefined;

        const reopened = await driver.openSession({ headless: HEADLESS });
        expect(reopened.ok).toBeTruthy();
        const persisted = await driver.page.evaluate(() => localStorage.getItem('persisted'));
        expect(persisted).toBe('true');
      } finally {
        await driver.context?.close().catch(() => undefined);
        rmSync(profileDir, { recursive: true, force: true });
      }
    });
  }

  test('login uyarısı kullanıcı müdahalesi gerektirir', async () => {
    const profileDir = createProfileDir('login');
    const driver = new ChatGPTWebDriver({
      browserDefaults: { profilePath: profileDir, headless: HEADLESS }
    });
    driver.targetUrl = toFileUrl(fixturePath('chatgpt-session.html'));

    try {
      await driver.openSession({ headless: HEADLESS });
      await driver.page.evaluate(() => {
        const input = document.createElement('input');
        input.name = 'username';
        document.body.appendChild(input);
      });
      const result = await driver.handleErrors();
      expect(result.requiresUser).toBeTruthy();
      expect(result.reason).toBe('login-required');
    } finally {
      await driver.context?.close().catch(() => undefined);
      rmSync(profileDir, { recursive: true, force: true });
    }
  });

  test('captcha görünürse manuel çözüm istenir', async () => {
    const profileDir = createProfileDir('captcha');
    const driver = new ChatGPTWebDriver({
      browserDefaults: { profilePath: profileDir, headless: HEADLESS }
    });
    driver.targetUrl = toFileUrl(fixturePath('chatgpt-session.html'));

    try {
      await driver.openSession({ headless: HEADLESS });
      await driver.page.evaluate(() => {
        const captcha = document.createElement('div');
        captcha.className = 'captcha-challenge';
        captcha.textContent = 'Captcha';
        document.body.appendChild(captcha);
      });
      const result = await driver.handleErrors();
      expect(result.requiresUser).toBeTruthy();
      expect(result.reason).toBe('captcha');
    } finally {
      await driver.context?.close().catch(() => undefined);
      rmSync(profileDir, { recursive: true, force: true });
    }
  });
});
