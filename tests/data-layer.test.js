import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';

import {
  configureDataLayer,
  isDataLayerUsingMemoryFallback,
  createUserProfile,
  createDefaultSettings,
  loadUserProfile,
  saveUserProfile,
  loadSettings,
  saveSettings,
  upsertJob,
  getJob,
  listJobs,
  removeJob,
  upsertApplication,
  getApplication,
  listApplications,
  removeApplication,
  saveDocument,
  getDocument,
  listDocuments,
  removeDocument
} from '../src/data/models.js';

test('SQLCipher veri katmanı temel CRUD işlemlerini kalıcı saklar', async () => {
  const tempDir = path.join(process.cwd(), '.tmp', `data-${crypto.randomUUID()}`);
  const key = crypto.randomBytes(32).toString('hex');
  configureDataLayer({ dataDir: tempDir, key, keyAccount: `test-${crypto.randomUUID()}` });

  const profileInput = createUserProfile({ name: 'Ada Lovelace', email: 'ada@example.com' });
  await saveUserProfile(profileInput);
  const storedProfile = await loadUserProfile();
  assert.equal(storedProfile.name, 'Ada Lovelace');
  assert.equal(storedProfile.email, 'ada@example.com');

  const settingsInput = createDefaultSettings({ dailyCap: 3, targetLLM: 'claude' });
  await saveSettings(settingsInput);
  const storedSettings = await loadSettings();
  assert.equal(storedSettings.dailyCap, 3);
  assert.equal(storedSettings.targetLLM, 'claude');

  const job = await upsertJob({
    id: 'job-1',
    source: 'linkedin',
    url: 'https://example.com/jobs/1',
    title: 'Kıdemli Yazılım Mühendisi',
    company: 'Acme',
    location: 'Remote',
    description: 'Node.js + React',
    skills: ['Node.js', 'React'],
    salaryHint: { currency: 'USD', min: 100000, max: 140000 },
    applyMethod: 'easy_apply'
  });
  const storedJob = await getJob(job.id);
  assert.equal(storedJob?.company, 'Acme');
  assert.deepEqual(storedJob?.skills, ['Node.js', 'React']);

  const allJobs = await listJobs();
  assert.equal(allJobs.length, 1);

  const application = await upsertApplication({
    id: 'app-1',
    jobId: job.id,
    resumeVariantId: 'res-1',
    coverLetterId: 'cl-1',
    status: 'applied',
    timestamps: { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), submittedAt: new Date().toISOString() },
    notes: 'Otomatik gönderildi',
    evidence: { screenshot: '/tmp/screen.png' }
  });
  const storedApplication = await getApplication(application.id);
  assert.equal(storedApplication?.jobId, job.id);
  assert.equal(storedApplication?.status, 'applied');

  const documentsBefore = await listDocuments();
  assert.equal(documentsBefore.length, 0);

  const document = await saveDocument({
    jobId: job.id,
    type: 'cover_letter',
    format: 'txt',
    content: 'Sayın yetkili,',
    metadata: { tone: 'samimi' }
  });
  assert.ok(document.id);
  assert.ok(document.path);
  const savedContent = await fs.readFile(document.path, 'utf8');
  assert.equal(savedContent, 'Sayın yetkili,');

  const storedDocument = await getDocument(document.id);
  assert.equal(storedDocument?.type, 'cover_letter');
  const filteredDocuments = await listDocuments({ jobId: job.id });
  assert.equal(filteredDocuments.length, 1);

  await removeDocument(document.id);
  const documentsAfter = await listDocuments();
  assert.equal(documentsAfter.length, 0);

  await removeApplication(application.id);
  const appsAfter = await listApplications();
  assert.equal(appsAfter.length, 0);

  await removeJob(job.id);
  const jobsAfter = await listJobs();
  assert.equal(jobsAfter.length, 0);

  const usingMemory = await isDataLayerUsingMemoryFallback();
  if (!usingMemory) {
    const storageDir = path.join(tempDir, 'data');
    const files = await fs.readdir(storageDir);
    assert.ok(files.some((file) => file.endsWith('.db')));
  }
});
