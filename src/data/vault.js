import Store from 'electron-store';

const vaultStore = new Store({
  name: 'answer-vault',
  encryptionKey: undefined // Gerçek uygulamada kullanıcı anahtarından türetilmeli
});

/**
 * @param {string} questionKey
 * @returns {import('./models.js').AnswerVaultEntry | undefined}
 */
export function getAnswer(questionKey) {
  return vaultStore.get(questionKey);
}

/**
 * @param {import('./models.js').AnswerVaultEntry} entry
 */
export function upsertAnswer(entry) {
  vaultStore.set(entry.questionKey, entry);
}

/**
 * @returns {Record<string, import('./models.js').AnswerVaultEntry>}
 */
export function listAnswers() {
  return vaultStore.store;
}

/**
 * @param {string} questionKey
 */
export function removeAnswer(questionKey) {
  vaultStore.delete(questionKey);
}

/**
 * Cevap kasasına toplu import
 * @param {Array<import('./models.js').AnswerVaultEntry>} entries
 */
export function importAnswers(entries) {
  for (const entry of entries) {
    upsertAnswer(entry);
  }
}

