import path from 'node:path';
import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';

import { getOrCreateVaultKey, resolveDataDirectory } from './keychain.js';

let sqlite3;
try {
  const sqlite3pkg = await import('@journeyapps/sqlcipher');
  const base = sqlite3pkg.default ?? sqlite3pkg;
  sqlite3 = base.verbose();
} catch (error) {
  console.warn(
    `SQLCipher modülü yüklenemedi (${error?.message ?? 'bilinmiyor'}). Veri katmanı için in-memory fallback kullanılacak.`
  );
}

const CONFIG = {
  dataDir: process.env.JOB_APPLIER_DATA_DIR,
  keyOverride: process.env.JOB_APPLIER_DB_KEY,
  keyAccount: 'app-data',
  keyService: 'job-applier-data'
};

let db;
let initPromise;
let memoryStore;
let resolvedDataDir;
let documentsDir;

function createMemoryStore(baseDir) {
  return {
    baseDir,
    profile: undefined,
    settings: undefined,
    jobs: new Map(),
    applications: new Map(),
    documents: new Map()
  };
}

function run(dbInstance, sql, params = {}) {
  return new Promise((resolve, reject) => {
    dbInstance.run(sql, params, function (error) {
      if (error) {
        reject(error);
        return;
      }
      resolve(this);
    });
  });
}

function get(dbInstance, sql, params = {}) {
  return new Promise((resolve, reject) => {
    dbInstance.get(sql, params, (error, row) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(row ?? null);
    });
  });
}

function all(dbInstance, sql, params = {}) {
  return new Promise((resolve, reject) => {
    dbInstance.all(sql, params, (error, rows) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(rows ?? []);
    });
  });
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function stringifyJson(value) {
  return JSON.stringify(value ?? null);
}

function nowIso() {
  return new Date().toISOString();
}

function ensureProfileDefaults(profile) {
  return createUserProfile(profile);
}

function ensureSettingsDefaults(settings) {
  return createDefaultSettings(settings);
}

function rowToJob(row) {
  if (!row) return undefined;
  return {
    id: row.id,
    source: row.source,
    url: row.url,
    title: row.title,
    company: row.company,
    location: row.location,
    description: row.description,
    skills: parseJson(row.skills, []),
    salaryHint: parseJson(row.salary_hint, {}),
    applyMethod: row.apply_method,
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined
  };
}

function rowToApplication(row) {
  if (!row) return undefined;
  return {
    id: row.id,
    jobId: row.job_id,
    resumeVariantId: row.resume_variant_id,
    coverLetterId: row.cover_letter_id,
    status: row.status,
    timestamps: parseJson(row.timestamps, {}),
    notes: row.notes ?? '',
    evidence: parseJson(row.evidence, {}),
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined
  };
}

function rowToDocument(row) {
  if (!row) return undefined;
  return {
    id: row.id,
    jobId: row.job_id,
    type: row.type,
    format: row.format,
    path: row.path,
    metadata: parseJson(row.metadata, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function ensureDataDirectory() {
  if (!resolvedDataDir) {
    resolvedDataDir = await resolveDataDirectory(CONFIG.dataDir);
  }
  return resolvedDataDir;
}

async function initialize() {
  if (db || memoryStore) {
    return;
  }
  if (!initPromise) {
    initPromise = (async () => {
      const baseDir = await ensureDataDirectory();
      const storageDir = path.join(baseDir, 'data');
      documentsDir = path.join(baseDir, 'documents');
      await fs.mkdir(storageDir, { recursive: true });
      await fs.mkdir(documentsDir, { recursive: true });

      if (!sqlite3) {
        memoryStore = createMemoryStore(baseDir);
        return;
      }

      try {
        const dbPath = path.join(storageDir, 'app-data.db');
        const key = await getOrCreateVaultKey({
          service: CONFIG.keyService,
          account: CONFIG.keyAccount,
          keyOverride: CONFIG.keyOverride,
          dataDir: storageDir
        });

        db = new sqlite3.Database(dbPath);
        await run(db, `PRAGMA cipher_compatibility = 4`);
        await run(db, `PRAGMA cipher_page_size = 4096`);
        await run(db, `PRAGMA kdf_iter = 64000`);
        await run(db, `PRAGMA key = '${key.replace(/'/g, "''")}'`);
        await run(db, `PRAGMA journal_mode = WAL`);

        await run(
          db,
          `CREATE TABLE IF NOT EXISTS user_profile (
            id TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            updated_at TEXT NOT NULL
          )`
        );

        await run(
          db,
          `CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            updated_at TEXT NOT NULL
          )`
        );

        await run(
          db,
          `CREATE TABLE IF NOT EXISTS jobs (
            id TEXT PRIMARY KEY,
            source TEXT,
            url TEXT,
            title TEXT,
            company TEXT,
            location TEXT,
            description TEXT,
            skills TEXT,
            salary_hint TEXT,
            apply_method TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          )`
        );

        await run(
          db,
          `CREATE TABLE IF NOT EXISTS applications (
            id TEXT PRIMARY KEY,
            job_id TEXT NOT NULL,
            resume_variant_id TEXT,
            cover_letter_id TEXT,
            status TEXT NOT NULL,
            timestamps TEXT,
            notes TEXT,
            evidence TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          )`
        );

        await run(
          db,
          `CREATE TABLE IF NOT EXISTS documents (
            id TEXT PRIMARY KEY,
            job_id TEXT,
            type TEXT,
            format TEXT,
            path TEXT,
            metadata TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          )`
        );
      } catch (error) {
        console.warn(
          `SQLCipher veri katmanı başlatılırken hata oluştu (${error?.message ?? 'bilinmiyor'}). In-memory fallback kullanılacak.`
        );
        memoryStore = createMemoryStore(baseDir);
      }
    })();
  }
  await initPromise;
}

export function configureDataLayer(options = {}) {
  if (db || memoryStore || initPromise) {
    throw new Error('Veri katmanı zaten başlatıldı; konfigürasyon değiştirilemez.');
  }
  if (options.dataDir) {
    CONFIG.dataDir = options.dataDir;
  }
  if (options.key) {
    CONFIG.keyOverride = options.key;
  }
  if (options.keyAccount) {
    CONFIG.keyAccount = options.keyAccount;
  }
  if (options.keyService) {
    CONFIG.keyService = options.keyService;
  }
}

export async function isDataLayerUsingMemoryFallback() {
  await initialize();
  return !sqlite3 || Boolean(memoryStore);
}

async function getDocumentsDir() {
  await initialize();
  if (documentsDir) {
    return documentsDir;
  }
  const baseDir = memoryStore?.baseDir ?? (await ensureDataDirectory());
  const dir = path.join(baseDir, 'documents');
  await fs.mkdir(dir, { recursive: true });
  documentsDir = dir;
  return dir;
}

async function persistDocumentFile(id, format, content) {
  if (!content) return undefined;
  const docDir = await getDocumentsDir();
  const extension = format ?? 'txt';
  const filePath = path.join(docDir, `${id}.${extension}`);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  if (content instanceof Uint8Array || Buffer.isBuffer(content)) {
    await fs.writeFile(filePath, content);
  } else {
    await fs.writeFile(filePath, content, 'utf8');
  }
  return filePath;
}

async function deleteFileSafe(filePath) {
  if (!filePath) return;
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.warn('Belge dosyası silinirken hata oluştu:', error);
    }
  }
}

/**
 * @typedef {Object} UserProfile
 * @property {string} name
 * @property {string} email
 * @property {string[]} locations
 * @property {string[]} roles
 * @property {string[]} skills
 * @property {Array<{code: string, level: 'beginner'|'intermediate'|'advanced'|'native'}>} languages
 * @property {string} workAuth
 * @property {boolean} relocation
 * @property {{ currency: string, min: number, max: number }} salaryRange
 * @property {string} noticePeriod
 * @property {'remote'|'hybrid'|'onsite'|'any'} [remotePreference]
 * @property {number} [dailyCap]
 * @property {string[]} [highlights]
 * @property {string} [coverTone]
 * @property {string} createdAt
 */

/**
 * @typedef {Object} ResumeVariant
 * @property {string} id
 * @property {string} baseResumeRef
 * @property {string} jobId
 * @property {string} diff
 * @property {{ pdf?: string, docx?: string }} filePaths
 */

/**
 * @typedef {Object} CoverLetter
 * @property {string} id
 * @property {string} jobId
 * @property {string} text
 * @property {'tr'|'en'} language
 * @property {string} tone
 */

/**
 * @typedef {Object} JobPosting
 * @property {string} id
 * @property {string} source
 * @property {string} url
 * @property {string} title
 * @property {string} company
 * @property {string} location
 * @property {string} description
 * @property {string[]} skills
 * @property {{ currency?: string, min?: number, max?: number }} salaryHint
 * @property {string} applyMethod
 * @property {string} [createdAt]
 * @property {string} [updatedAt]
 */

/**
 * @typedef {Object} Application
 * @property {string} id
 * @property {string} jobId
 * @property {string} resumeVariantId
 * @property {string} coverLetterId
 * @property {'found'|'applied'|'hr'|'tech'|'offer'|'rejected'} status
 * @property {{ createdAt: string, updatedAt: string, submittedAt?: string }} timestamps
 * @property {string} notes
 * @property {{ screenshot?: string, logPath?: string }} evidence
 * @property {string} [createdAt]
 * @property {string} [updatedAt]
 */

/**
 * @typedef {Object} AnswerVaultEntry
 * @property {string} questionKey
 * @property {string} answer
 * @property {'tr'|'en'} lang
 * @property {string} updatedAt
 */

/**
 * @typedef {Object} LLMWebSession
 * @property {string} profilePath
 * @property {string|null} [lastLoginAt]
 * @property {boolean} cookiesEncrypted
 */

/**
 * @typedef {Object} Settings
 * @property {'chatgpt'|'gemini'|'claude'} targetLLM
 * @property {string[]} llmWebTargets
 * @property {{ engine: 'chromium'|'webkit'|'firefox', headless: boolean, userAgentProfile: string, profilePath: string }} browser
 * @property {{ chatgpt?: LLMWebSession, gemini?: LLMWebSession, claude?: LLMWebSession }} sessions
 * @property {{ globalPerMin: number, perProviderPerMin: number, backoff: 'exponential'|'linear' }} rateLimits
 * @property {{ mode: 'manual'|'assisted', notify: boolean }} captchaHandling
 * @property {number} dailyCap
 * @property {string[]} blacklists
 * @property {string[]} whitelists
 * @property {{ uiAutomationOnLLMSites: boolean, storeCookies: boolean }} consentFlags
 */

/**
 * @typedef {Object} StoredDocument
 * @property {string} id
 * @property {string} [jobId]
 * @property {string} type
 * @property {string} format
 * @property {string|undefined} path
 * @property {Record<string, any>} [metadata]
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @param {Partial<UserProfile>} profile
 * @returns {UserProfile}
 */
export function createUserProfile(profile = {}) {
  const now = new Date();
  return {
    name: profile.name ?? 'Ad Soyad',
    email: profile.email ?? 'example@email.com',
    locations: profile.locations ?? [],
    roles: profile.roles ?? [],
    skills: profile.skills ?? [],
    languages: profile.languages ?? [{ code: 'tr', level: 'native' }],
    workAuth: profile.workAuth ?? 'Belirtilmedi',
    relocation: profile.relocation ?? false,
    remotePreference: profile.remotePreference ?? 'any',
    dailyCap: profile.dailyCap ?? 10,
    highlights: profile.highlights ?? [],
    coverTone: profile.coverTone ?? 'samimi',
    salaryRange:
      profile.salaryRange ??
      {
        currency: 'TRY',
        min: 0,
        max: 0
      },
    noticePeriod: profile.noticePeriod ?? 'Hazır',
    createdAt: profile.createdAt ?? now.toISOString()
  };
}

/**
 * @param {Partial<Settings>} settings
 * @returns {Settings}
 */
export function createDefaultSettings(settings = {}) {
  const defaultTargets = [
    'https://chat.openai.com',
    'https://gemini.google.com',
    'https://claude.ai'
  ];

  const buildSession = (session) => {
    if (!session) return undefined;
    return {
      profilePath: session.profilePath ?? '',
      lastLoginAt: session.lastLoginAt ?? null,
      cookiesEncrypted: session.cookiesEncrypted ?? true
    };
  };

  const sessions = {};
  const inputSessions = settings.sessions ?? {};
  for (const provider of /** @type {const} */ (['chatgpt', 'gemini', 'claude'])) {
    const built = buildSession(inputSessions[provider]);
    if (built) {
      sessions[provider] = built;
    }
  }

  return {
    targetLLM: settings.targetLLM ?? 'chatgpt',
    llmWebTargets: settings.llmWebTargets ?? defaultTargets,
    browser: {
      engine: settings.browser?.engine ?? 'chromium',
      headless: settings.browser?.headless ?? false,
      userAgentProfile: settings.browser?.userAgentProfile ?? 'default',
      profilePath: settings.browser?.profilePath ?? 'profiles/default'
    },
    sessions,
    rateLimits: {
      globalPerMin: settings.rateLimits?.globalPerMin ?? 4,
      perProviderPerMin: settings.rateLimits?.perProviderPerMin ?? 2,
      backoff: settings.rateLimits?.backoff ?? 'exponential'
    },
    captchaHandling: {
      mode: settings.captchaHandling?.mode ?? 'manual',
      notify: settings.captchaHandling?.notify ?? true
    },
    dailyCap: settings.dailyCap ?? 10,
    blacklists: settings.blacklists ?? [],
    whitelists: settings.whitelists ?? [],
    consentFlags: {
      uiAutomationOnLLMSites: settings.consentFlags?.uiAutomationOnLLMSites ?? true,
      storeCookies: settings.consentFlags?.storeCookies ?? true
    }
  };
}

export async function loadUserProfile() {
  await initialize();
  if (memoryStore) {
    if (!memoryStore.profile) {
      memoryStore.profile = ensureProfileDefaults(memoryStore.profile);
    }
    return memoryStore.profile;
  }
  const row = await get(db, `SELECT data FROM user_profile WHERE id = $id`, { $id: 'default' });
  if (!row) {
    const profile = ensureProfileDefaults();
    await saveUserProfile(profile);
    return profile;
  }
  const parsed = parseJson(row.data, {});
  return ensureProfileDefaults(parsed);
}

export async function saveUserProfile(profile) {
  await initialize();
  const normalized = ensureProfileDefaults(profile);
  const now = nowIso();
  if (memoryStore) {
    memoryStore.profile = { ...normalized, updatedAt: now };
    return memoryStore.profile;
  }
  await run(
    db,
    `INSERT INTO user_profile(id, data, updated_at)
     VALUES ($id, $data, $updatedAt)
     ON CONFLICT(id) DO UPDATE SET
       data = excluded.data,
       updated_at = excluded.updated_at`,
    {
      $id: 'default',
      $data: stringifyJson(normalized),
      $updatedAt: now
    }
  );
  return normalized;
}

export async function loadSettings() {
  await initialize();
  if (memoryStore) {
    if (!memoryStore.settings) {
      memoryStore.settings = ensureSettingsDefaults();
    }
    return memoryStore.settings;
  }
  const row = await get(db, `SELECT data FROM settings WHERE key = $key`, { $key: 'global' });
  if (!row) {
    const settings = ensureSettingsDefaults();
    await saveSettings(settings);
    return settings;
  }
  const parsed = parseJson(row.data, {});
  return ensureSettingsDefaults(parsed);
}

export async function saveSettings(settings) {
  await initialize();
  const normalized = ensureSettingsDefaults(settings);
  const now = nowIso();
  if (memoryStore) {
    memoryStore.settings = { ...normalized, updatedAt: now };
    return memoryStore.settings;
  }
  await run(
    db,
    `INSERT INTO settings(key, data, updated_at)
     VALUES ($key, $data, $updatedAt)
     ON CONFLICT(key) DO UPDATE SET
       data = excluded.data,
       updated_at = excluded.updated_at`,
    {
      $key: 'global',
      $data: stringifyJson(normalized),
      $updatedAt: now
    }
  );
  return normalized;
}

export async function upsertJob(job) {
  await initialize();
  const now = nowIso();
  const jobId = job.id ?? randomUUID();
  const normalized = {
    ...job,
    id: jobId,
    skills: job.skills ?? [],
    salaryHint: job.salaryHint ?? {},
    createdAt: job.createdAt ?? now,
    updatedAt: now
  };
  if (memoryStore) {
    memoryStore.jobs.set(jobId, normalized);
    return normalized;
  }
  await run(
    db,
    `INSERT INTO jobs(id, source, url, title, company, location, description, skills, salary_hint, apply_method, created_at, updated_at)
     VALUES ($id, $source, $url, $title, $company, $location, $description, $skills, $salaryHint, $applyMethod, $createdAt, $updatedAt)
     ON CONFLICT(id) DO UPDATE SET
       source = excluded.source,
       url = excluded.url,
       title = excluded.title,
       company = excluded.company,
       location = excluded.location,
       description = excluded.description,
       skills = excluded.skills,
       salary_hint = excluded.salary_hint,
       apply_method = excluded.apply_method,
       updated_at = excluded.updated_at`,
    {
      $id: normalized.id,
      $source: normalized.source,
      $url: normalized.url,
      $title: normalized.title,
      $company: normalized.company,
      $location: normalized.location,
      $description: normalized.description,
      $skills: stringifyJson(normalized.skills),
      $salaryHint: stringifyJson(normalized.salaryHint),
      $applyMethod: normalized.applyMethod,
      $createdAt: normalized.createdAt,
      $updatedAt: normalized.updatedAt
    }
  );
  return normalized;
}

export async function getJob(jobId) {
  await initialize();
  if (memoryStore) {
    return memoryStore.jobs.get(jobId);
  }
  const row = await get(
    db,
    `SELECT id, source, url, title, company, location, description, skills, salary_hint, apply_method, created_at, updated_at FROM jobs WHERE id = $id`,
    { $id: jobId }
  );
  return rowToJob(row);
}

export async function listJobs() {
  await initialize();
  if (memoryStore) {
    return Array.from(memoryStore.jobs.values()).sort((a, b) => {
      const aUpdated = a.updatedAt ?? '';
      const bUpdated = b.updatedAt ?? '';
      return aUpdated > bUpdated ? -1 : aUpdated < bUpdated ? 1 : 0;
    });
  }
  const rows = await all(
    db,
    `SELECT id, source, url, title, company, location, description, skills, salary_hint, apply_method, created_at, updated_at FROM jobs ORDER BY updated_at DESC`
  );
  return rows.map((row) => rowToJob(row));
}

export async function removeJob(jobId) {
  await initialize();
  if (memoryStore) {
    memoryStore.jobs.delete(jobId);
    return;
  }
  await run(db, `DELETE FROM jobs WHERE id = $id`, { $id: jobId });
}

export async function upsertApplication(application) {
  await initialize();
  const now = nowIso();
  const appId = application.id ?? randomUUID();
  const normalized = {
    ...application,
    id: appId,
    timestamps: application.timestamps ?? {},
    evidence: application.evidence ?? {},
    createdAt: application.createdAt ?? now,
    updatedAt: now
  };
  if (memoryStore) {
    memoryStore.applications.set(appId, normalized);
    return normalized;
  }
  await run(
    db,
    `INSERT INTO applications(id, job_id, resume_variant_id, cover_letter_id, status, timestamps, notes, evidence, created_at, updated_at)
     VALUES ($id, $jobId, $resumeVariantId, $coverLetterId, $status, $timestamps, $notes, $evidence, $createdAt, $updatedAt)
     ON CONFLICT(id) DO UPDATE SET
       job_id = excluded.job_id,
       resume_variant_id = excluded.resume_variant_id,
       cover_letter_id = excluded.cover_letter_id,
       status = excluded.status,
       timestamps = excluded.timestamps,
       notes = excluded.notes,
       evidence = excluded.evidence,
       updated_at = excluded.updated_at`,
    {
      $id: normalized.id,
      $jobId: normalized.jobId,
      $resumeVariantId: normalized.resumeVariantId,
      $coverLetterId: normalized.coverLetterId,
      $status: normalized.status,
      $timestamps: stringifyJson(normalized.timestamps),
      $notes: normalized.notes ?? '',
      $evidence: stringifyJson(normalized.evidence),
      $createdAt: normalized.createdAt,
      $updatedAt: normalized.updatedAt
    }
  );
  return normalized;
}

export async function getApplication(applicationId) {
  await initialize();
  if (memoryStore) {
    return memoryStore.applications.get(applicationId);
  }
  const row = await get(
    db,
    `SELECT id, job_id, resume_variant_id, cover_letter_id, status, timestamps, notes, evidence, created_at, updated_at FROM applications WHERE id = $id`,
    { $id: applicationId }
  );
  return rowToApplication(row);
}

export async function listApplications() {
  await initialize();
  if (memoryStore) {
    return Array.from(memoryStore.applications.values()).sort((a, b) => {
      const aUpdated = a.updatedAt ?? '';
      const bUpdated = b.updatedAt ?? '';
      return aUpdated > bUpdated ? -1 : aUpdated < bUpdated ? 1 : 0;
    });
  }
  const rows = await all(
    db,
    `SELECT id, job_id, resume_variant_id, cover_letter_id, status, timestamps, notes, evidence, created_at, updated_at FROM applications ORDER BY updated_at DESC`
  );
  return rows.map((row) => rowToApplication(row));
}

export async function removeApplication(applicationId) {
  await initialize();
  if (memoryStore) {
    memoryStore.applications.delete(applicationId);
    return;
  }
  await run(db, `DELETE FROM applications WHERE id = $id`, { $id: applicationId });
}

export async function saveDocument({ id, jobId, type, format, content, metadata = {} }) {
  await initialize();
  const now = nowIso();
  const documentId = id ?? randomUUID();
  const pathResult = await persistDocumentFile(documentId, format, content);
  const record = {
    id: documentId,
    jobId: jobId ?? null,
    type,
    format,
    path: pathResult,
    metadata,
    createdAt: now,
    updatedAt: now
  };
  if (memoryStore) {
    memoryStore.documents.set(documentId, record);
    return record;
  }
  await run(
    db,
    `INSERT INTO documents(id, job_id, type, format, path, metadata, created_at, updated_at)
     VALUES ($id, $jobId, $type, $format, $path, $metadata, $createdAt, $updatedAt)
     ON CONFLICT(id) DO UPDATE SET
       job_id = excluded.job_id,
       type = excluded.type,
       format = excluded.format,
       path = excluded.path,
       metadata = excluded.metadata,
       updated_at = excluded.updated_at`,
    {
      $id: record.id,
      $jobId: record.jobId,
      $type: record.type,
      $format: record.format,
      $path: record.path,
      $metadata: stringifyJson(record.metadata),
      $createdAt: record.createdAt,
      $updatedAt: record.updatedAt
    }
  );
  return record;
}

export async function getDocument(documentId) {
  await initialize();
  if (memoryStore) {
    return memoryStore.documents.get(documentId);
  }
  const row = await get(
    db,
    `SELECT id, job_id, type, format, path, metadata, created_at, updated_at FROM documents WHERE id = $id`,
    { $id: documentId }
  );
  return rowToDocument(row);
}

export async function listDocuments(filters = {}) {
  await initialize();
  if (memoryStore) {
    const items = Array.from(memoryStore.documents.values());
    return items.filter((item) => {
      if (filters.jobId && item.jobId !== filters.jobId) return false;
      if (filters.type && item.type !== filters.type) return false;
      return true;
    });
  }
  const conditions = [];
  const params = {};
  if (filters.jobId) {
    conditions.push('job_id = $jobId');
    params.$jobId = filters.jobId;
  }
  if (filters.type) {
    conditions.push('type = $type');
    params.$type = filters.type;
  }
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = await all(
    db,
    `SELECT id, job_id, type, format, path, metadata, created_at, updated_at FROM documents ${whereClause} ORDER BY updated_at DESC`,
    params
  );
  return rows.map((row) => rowToDocument(row));
}

export async function removeDocument(documentId) {
  await initialize();
  if (memoryStore) {
    const doc = memoryStore.documents.get(documentId);
    memoryStore.documents.delete(documentId);
    if (doc?.path) {
      await deleteFileSafe(doc.path);
    }
    return;
  }
  const existing = await get(
    db,
    `SELECT path FROM documents WHERE id = $id`,
    { $id: documentId }
  );
  await run(db, `DELETE FROM documents WHERE id = $id`, { $id: documentId });
  if (existing?.path) {
    await deleteFileSafe(existing.path);
  }
}

/**
 * İlan eşleşmesi için skor hesaplama (basit anahtar kelime oranı)
 * @param {JobPosting} job
 * @param {UserProfile} profile
 * @returns {{ score: number, matchedSkills: string[] }}
 */
export function computeMatchScore(job, profile) {
  const skills = job.skills ?? [];
  const profileSkills = new Set((profile.skills ?? []).map((s) => s.toLowerCase()));
  if (skills.length === 0 || profileSkills.size === 0) {
    return { score: 0, matchedSkills: [] };
  }
  const matched = skills.filter((skill) => profileSkills.has(skill.toLowerCase()));
  const score = Math.round((matched.length / skills.length) * 100);
  return { score, matchedSkills: matched };
}

/**
 * @param {Application[]} applications
 * @returns {Record<string, number>}
 */
export function summarizePipeline(applications) {
  return applications.reduce((acc, app) => {
    acc[app.status] = (acc[app.status] ?? 0) + 1;
    return acc;
  }, /** @type {Record<string, number>} */ ({}));
}
