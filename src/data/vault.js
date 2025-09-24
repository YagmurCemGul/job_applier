import path from 'node:path';
import { promises as fs } from 'node:fs';

import { getOrCreateVaultKey, resolveDataDirectory } from './keychain.js';

let sqlite3;
try {
  const sqlite3pkg = await import('@journeyapps/sqlcipher');
  const base = sqlite3pkg.default ?? sqlite3pkg;
  sqlite3 = base.verbose();
} catch (error) {
  console.warn(`SQLCipher modülü yüklenemedi (${error?.message ?? 'bilinmiyor'}). In-memory vault fallback kullanılacak.`);
}

const CONFIG = {
  dataDir: process.env.JOB_APPLIER_DATA_DIR,
  keyOverride: process.env.JOB_APPLIER_VAULT_KEY
};

let db;
let initPromise;
let memoryFallback;

function run(dbInstance, sql, params = []) {
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

function get(dbInstance, sql, params = []) {
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

function all(dbInstance, sql, params = []) {
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

async function initialize() {
  if (db || memoryFallback) {
    return;
  }
  if (!initPromise) {
    initPromise = (async () => {
      if (!sqlite3) {
        if (!memoryFallback) {
          memoryFallback = new Map();
        }
        return;
      }
      try {
        const dataDir = await resolveDataDirectory(CONFIG.dataDir);
        const vaultDir = path.join(dataDir, 'vault');
        await fs.mkdir(vaultDir, { recursive: true });
        const databasePath = path.join(vaultDir, 'answer-vault.db');

        const key = await getOrCreateVaultKey({
          dataDir: vaultDir,
          keyOverride: CONFIG.keyOverride
        });

        db = new sqlite3.Database(databasePath);
        await run(db, `PRAGMA cipher_compatibility = 4`);
        await run(db, `PRAGMA key = '${key.replace(/'/g, "''")}'`);
        await run(
          db,
          `CREATE TABLE IF NOT EXISTS answer_vault (
            question_key TEXT PRIMARY KEY,
            answer TEXT NOT NULL,
            lang TEXT NOT NULL,
            updated_at TEXT NOT NULL
          )`
        );
      } catch (error) {
        console.warn(`SQLCipher vault başlatılırken hata oluştu (${error?.message ?? 'bilinmiyor'}). In-memory fallback kullanılacak.`);
        if (!memoryFallback) {
          memoryFallback = new Map();
        }
      }
    })();
  }
  await initPromise;
}

function ensureEntry(entry) {
  const now = new Date().toISOString();
  return {
    ...entry,
    updatedAt: entry.updatedAt ?? now
  };
}

export function configureVault(options = {}) {
  if (db || memoryFallback || initPromise) {
    throw new Error('Vault zaten başlatıldı, konfigürasyon değiştirilemez.');
  }
  if (options.dataDir) {
    CONFIG.dataDir = options.dataDir;
  }
  if (options.key) {
    CONFIG.keyOverride = options.key;
  }
}

export function isUsingMemoryFallback() {
  return !sqlite3 || Boolean(memoryFallback);
}

/**
 * @param {string} questionKey
 * @returns {Promise<import('./models.js').AnswerVaultEntry|undefined>}
 */
export async function getAnswer(questionKey) {
  await initialize();
  if (memoryFallback) {
    return memoryFallback.get(questionKey);
  }
  const row = await get(
    db,
    `SELECT question_key as questionKey, answer, lang, updated_at as updatedAt FROM answer_vault WHERE question_key = ?`,
    [questionKey]
  );
  return row ?? undefined;
}

/**
 * @param {import('./models.js').AnswerVaultEntry} entry
 */
export async function upsertAnswer(entry) {
  await initialize();
  const normalized = ensureEntry(entry);
  if (memoryFallback) {
    memoryFallback.set(normalized.questionKey, normalized);
    return normalized;
  }
  await run(
    db,
    `INSERT INTO answer_vault(question_key, answer, lang, updated_at)
     VALUES ($questionKey, $answer, $lang, $updatedAt)
     ON CONFLICT(question_key) DO UPDATE SET
       answer = excluded.answer,
       lang = excluded.lang,
       updated_at = excluded.updated_at`,
    {
      $questionKey: normalized.questionKey,
      $answer: normalized.answer,
      $lang: normalized.lang,
      $updatedAt: normalized.updatedAt
    }
  );
  return normalized;
}

/**
 * @returns {Promise<Record<string, import('./models.js').AnswerVaultEntry>>}
 */
export async function listAnswers() {
  await initialize();
  if (memoryFallback) {
    return Object.fromEntries(memoryFallback.entries());
  }
  const rows = await all(
    db,
    `SELECT question_key as questionKey, answer, lang, updated_at as updatedAt FROM answer_vault`
  );
  return rows.reduce((acc, row) => {
    acc[row.questionKey] = row;
    return acc;
  }, /** @type {Record<string, import('./models.js').AnswerVaultEntry>} */ ({}));
}

/**
 * @param {string} questionKey
 */
export async function removeAnswer(questionKey) {
  await initialize();
  if (memoryFallback) {
    memoryFallback.delete(questionKey);
    return;
  }
  await run(db, `DELETE FROM answer_vault WHERE question_key = ?`, [questionKey]);
}

/**
 * @param {Array<import('./models.js').AnswerVaultEntry>} entries
 */
export async function importAnswers(entries) {
  for (const entry of entries) {
    await upsertAnswer(entry);
  }
}
