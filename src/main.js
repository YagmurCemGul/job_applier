import { app, BrowserWindow, ipcMain, Notification } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Orchestrator } from './pipeline/orchestrator.js';
import { createProvider } from './llm/providerFactory.js';
import { LinkedInScraper } from './automation/linkedinScraper.js';
import { IndeedScraper } from './automation/indeedScraper.js';
import { HiringCafeScraper } from './automation/hiringCafeScraper.js';
import { createUserProfile, createDefaultSettings } from './data/models.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let mainWindow;

const settings = createDefaultSettings();
const profile = createUserProfile({ name: 'Demo Kullanıcı', email: 'demo@example.com' });

const provider = createProvider('mock', { apiKey: '' });
const scraperConfig = { rateLimits: settings.rateLimits };
const scrapers = {
  linkedin: new LinkedInScraper({ playwright: /** @type {any} */ (null), config: scraperConfig }),
  indeed: new IndeedScraper({ playwright: /** @type {any} */ (null), config: scraperConfig }),
  hiringCafe: new HiringCafeScraper({ playwright: /** @type {any} */ (null), config: scraperConfig })
};

const orchestrator = new Orchestrator({ provider, scrapers, profile });

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
