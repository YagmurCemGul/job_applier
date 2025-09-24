import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';

const DEFAULT_SERVICE = 'job-applier';
const DEFAULT_ACCOUNT = 'answer-vault';

let cachedKey;

/**
 * Resolve uygulamanın kalıcı veri dizini.
 * Electron ortamında userData klasörünü tercih eder, aksi halde kullanıcı
 * home dizini altında gizli klasöre düşer.
 * @param {string|undefined} preferred
 */
export async function resolveDataDirectory(preferred) {
  if (preferred) {
    return preferred;
  }

  if (process.env.JOB_APPLIER_DATA_DIR) {
    return process.env.JOB_APPLIER_DATA_DIR;
  }

  try {
    const electron = await import('electron');
    const app = electron.app ?? electron.remote?.app;
    if (app?.getPath) {
      try {
        return path.join(app.getPath('userData'), 'storage');
      } catch (error) {
        console.warn('Electron userData yoluna erişilemedi, varsayılan dizine düşülüyor.', error);
      }
    }
  } catch (error) {
    // Test/CLI ortamında Electron bulunmayabilir; sessizce yoksay.
  }

  return path.join(os.homedir(), '.job-applier');
}

async function ensureKeyFile(filePath, key) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, key, { mode: 0o600 });
}

/**
 * Keychain veya güvenli dosya üzerinden SQLCipher anahtarını döndürür.
 * macOS üzerinde Keychain kullanılır; aksi halde şifreli dosya.
 * @param {{
 *  service?: string,
 *  account?: string,
 *  keyOverride?: string,
 *  dataDir?: string
 * }} [options]
 */
export async function getOrCreateVaultKey(options = {}) {
  if (options.keyOverride) {
    cachedKey = options.keyOverride;
    return cachedKey;
  }

  if (cachedKey) {
    return cachedKey;
  }

  if (process.env.JOB_APPLIER_VAULT_KEY) {
    cachedKey = process.env.JOB_APPLIER_VAULT_KEY;
    return cachedKey;
  }

  const service = options.service ?? DEFAULT_SERVICE;
  const account = options.account ?? DEFAULT_ACCOUNT;

  if (process.platform === 'darwin') {
    try {
      const keytarMod = await import('keytar');
      const keytar = keytarMod.default ?? keytarMod;
      const existing = await keytar.getPassword(service, account);
      if (existing) {
        cachedKey = existing;
        return existing;
      }
      const generated = crypto.randomBytes(32).toString('hex');
      await keytar.setPassword(service, account, generated);
      cachedKey = generated;
      return generated;
    } catch (error) {
      console.warn('macOS Keychain erişimi başarısız oldu, dosya tabanlı anahtara düşülüyor.', error);
    }
  }

  const baseDir = options.dataDir ?? (await resolveDataDirectory());
  const keyFile = path.join(baseDir, '.keys', `${account}.key`);
  try {
    const data = await fs.readFile(keyFile, 'utf8');
    if (data?.trim()) {
      cachedKey = data.trim();
      return cachedKey;
    }
  } catch (error) {
    // dosya yoksa oluşturulacak
  }

  const generated = crypto.randomBytes(32).toString('hex');
  await ensureKeyFile(keyFile, generated);
  cachedKey = generated;
  return generated;
}

/**
 * Test ortamları için cache temizleyici.
 */
export function resetCachedKey() {
  cachedKey = undefined;
}
