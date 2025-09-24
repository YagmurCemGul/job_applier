import { app, BrowserWindow, ipcMain, Notification } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Orchestrator } from './pipeline/orchestrator.js';
import { createProvider } from './llm/providerFactory.js';
import { LinkedInScraper } from './automation/linkedinScraper.js';
import { IndeedScraper } from './automation/indeedScraper.js';
import { HiringCafeScraper } from './automation/hiringCafeScraper.js';
import { createUserProfile, createDefaultSettings } from './data/models.js';
import { PipelineStore } from './pipeline/pipelineStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let mainWindow;

const settings = createDefaultSettings();
const profile = createUserProfile({ name: 'Demo Kullanıcı', email: 'demo@example.com' });

const applicant = {
  name: profile.name,
  fullName: profile.name,
  firstName: profile.name.split(' ')[0] ?? profile.name,
  lastName: profile.name.split(' ').slice(1).join(' ') || profile.name,
  email: profile.email,
  phone: '+90 555 000 0000',
  location: profile.locations[0] ?? 'İstanbul, Türkiye',
  city: profile.locations[0] ?? 'İstanbul',
  address: 'İstanbul',
  summary: 'Mac için demo başvuru notu',
  note: 'Demo başvuru notu',
  resumePath: 'assets/demo-resume.pdf',
  coverLetterPath: 'assets/demo-cover-letter.pdf',
  linkedinUrl: 'https://www.linkedin.com/in/demo-kullanici/',
  portfolioUrl: 'https://portfolio.example.com',
  answers: {
    notice_period: 'Hemen başlayabilirim',
    relocation: 'Gerekirse taşınabilirim',
    salary_expectation: 'Yıllık 1.000.000 TRY brüt',
    work_authorization: 'Türkiye vatandaşıyım, çalışma izni gerekmiyor',
    remote_preference: 'Uzaktan çalışmaya açığım'
  }
};

const provider = createProvider('mock', {
  sessionProfile: {
    profilePath: settings.browser.profilePath,
    source: 'demo'
  }
});
const scraperConfig = {
  rateLimits: {
    global: settings.rateLimits.globalPerMin,
    linkedin: settings.rateLimits.perProviderPerMin,
    indeed: settings.rateLimits.perProviderPerMin,
    hiringCafe: settings.rateLimits.perProviderPerMin
  },
  browser: {
    engine: settings.browser.engine,
    headless: settings.browser.headless,
    profilePath: join(settings.browser.profilePath, 'scrapers'),
    launchArgs: ['--disable-blink-features=AutomationControlled'],
    slowMo: 35
  },
  applicant,
  debug: {
    artifactPath: 'artifacts/apply'
  }
};
const scrapers = {
  linkedin: new LinkedInScraper({
    playwright: /** @type {any} */ (null),
    config: {
      ...scraperConfig,
      browser: { ...scraperConfig.browser, profilePath: join(scraperConfig.browser.profilePath, 'linkedin') }
    }
  }),
  indeed: new IndeedScraper({
    playwright: /** @type {any} */ (null),
    config: {
      ...scraperConfig,
      browser: { ...scraperConfig.browser, profilePath: join(scraperConfig.browser.profilePath, 'indeed') }
    }
  }),
  hiringCafe: new HiringCafeScraper({
    playwright: /** @type {any} */ (null),
    config: {
      ...scraperConfig,
      browser: { ...scraperConfig.browser, profilePath: join(scraperConfig.browser.profilePath, 'hiringcafe') }
    }
  })
};

const pipelineStore = new PipelineStore();
const orchestrator = new Orchestrator({ provider, scrapers, profile, settings, pipelineStore });

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile(join(__dirname, 'ui/index.html'));
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('orchestrator:discoverJobs', async (_event, filters) => {
  const results = await orchestrator.discoverJobs({ filters });
  return results;
});

ipcMain.handle('orchestrator:buildResume', async (_event, { job, resume }) => {
  return orchestrator.buildResume(job, resume);
});

ipcMain.handle('orchestrator:buildCoverLetter', async (_event, { job, achievements, tone, language }) => {
  const coverLetter = await orchestrator.buildCoverLetter(job, achievements, tone, language);
  new Notification({
    title: 'Cover Letter Hazır',
    body: `${job.title} için taslak oluşturuldu.`
  }).show();
  return coverLetter;
});

ipcMain.handle('orchestrator:answerQuestion', async (_event, { question, vaultEntry }) => {
  return orchestrator.answerQuestion(question, vaultEntry);
});

ipcMain.handle('orchestrator:getVaultEntries', async () => {
  return orchestrator.getVaultEntries();
});

ipcMain.handle('orchestrator:saveVaultEntry', async (_event, entry) => {
  return orchestrator.saveVaultEntry(entry);
});

ipcMain.handle('orchestrator:deleteVaultEntry', async (_event, questionKey) => {
  await orchestrator.deleteVaultEntry(questionKey);
  return true;
});

ipcMain.handle('orchestrator:listApplications', async () => {
  return orchestrator.listApplications();
});

ipcMain.handle('orchestrator:applyToJob', async (_event, { jobId, options }) => {
  return orchestrator.applyToJob(jobId, options);
});

ipcMain.handle('orchestrator:updateApplicationStatus', async (_event, { applicationId, status }) => {
  return orchestrator.updateApplicationStatus(applicationId, status);
});

ipcMain.handle('orchestrator:getProfile', async () => {
  return orchestrator.getProfile();
});

ipcMain.handle('orchestrator:updateProfile', async (_event, patch) => {
  return orchestrator.updateProfile(patch);
});

ipcMain.handle('orchestrator:askForMissing', async (_event, missingFields) => {
  return orchestrator.askForMissingFields(missingFields);
});

ipcMain.handle('settings:get', async () => {
  return orchestrator.getSettings();
});

ipcMain.handle('settings:update', async (_event, patch) => {
  return orchestrator.updateSettings(patch);
});

ipcMain.handle('settings:bindSession', async (_event, { provider: providerKey, sessionProfile }) => {
  return orchestrator.bindSession(providerKey, sessionProfile);
});

ipcMain.handle('settings:testSession', async () => {
  return orchestrator.testLLMSession();
});
