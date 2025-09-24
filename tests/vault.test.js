import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import crypto from 'node:crypto';

test('SQLCipher tabanlı vault kayıtları kalıcı saklar', async () => {
  const tempDir = path.join(process.cwd(), '.tmp', `vault-${crypto.randomUUID()}`);
  const vaultKey = crypto.randomBytes(32).toString('hex');

  const vaultModule = await import('../src/data/vault.js');
  vaultModule.configureVault({ dataDir: tempDir, key: vaultKey });

  const now = new Date().toISOString();
  await vaultModule.upsertAnswer({
    questionKey: 'salary_expectation',
    answer: 'Yıllık 1.200.000 TRY',
    lang: 'tr',
    updatedAt: now
  });

  const stored = await vaultModule.getAnswer('salary_expectation');
  assert.ok(stored);
  assert.equal(stored?.answer, 'Yıllık 1.200.000 TRY');

  const all = await vaultModule.listAnswers();
  assert.equal(Object.keys(all).length, 1);

  if (!vaultModule.isUsingMemoryFallback()) {
    const fs = await import('node:fs/promises');
    const vaultDir = path.join(tempDir, 'vault');
    const files = await fs.readdir(vaultDir);
    assert.ok(files.some((name) => name.endsWith('.db')));
  }

  await vaultModule.removeAnswer('salary_expectation');
  const removed = await vaultModule.getAnswer('salary_expectation');
  assert.equal(removed, undefined);

  await vaultModule.importAnswers([
    {
      questionKey: 'notice_period',
      answer: '2 hafta',
      lang: 'tr',
      updatedAt: now
    }
  ]);

  const imported = await vaultModule.listAnswers();
  assert.equal(imported.notice_period.answer, '2 hafta');
});
