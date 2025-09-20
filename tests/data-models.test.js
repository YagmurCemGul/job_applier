import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createUserProfile,
  createDefaultSettings,
  computeMatchScore,
  summarizePipeline
} from '../src/data/models.js';
import { composePrompt } from '../src/llm/promptComposer.js';

test('createUserProfile sets defaults', () => {
  const profile = createUserProfile({ name: 'Test' });
  assert.equal(profile.name, 'Test');
  assert.equal(profile.languages[0].code, 'tr');
  assert.ok(profile.createdAt);
});

test('createDefaultSettings merges overrides', () => {
  const settings = createDefaultSettings({ dailyCap: 5 });
  assert.equal(settings.dailyCap, 5);
  assert.equal(settings.provider, 'chatgpt');
});

test('computeMatchScore calculates percentage', () => {
  const score = computeMatchScore(
    { skills: ['Node.js', 'React', 'SQL'] },
    { skills: ['react', 'playwright', 'node.js'] }
  );
  assert.equal(score.score, 67);
  assert.deepEqual(score.matchedSkills.sort(), ['Node.js', 'React'].sort());
});

test('summarizePipeline groups status counts', () => {
  const summary = summarizePipeline([
    { status: 'found' },
    { status: 'found' },
    { status: 'applied' }
  ]);
  assert.equal(summary.found, 2);
  assert.equal(summary.applied, 1);
});

test('composePrompt replaces variables', () => {
  const prompt = composePrompt('missing_info', { MISSING_FIELDS_LIST: ['salary', 'noticePeriod'] });
  assert.ok(prompt.includes('salary'));
});
