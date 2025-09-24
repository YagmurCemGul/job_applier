import test from 'node:test';
import assert from 'node:assert/strict';
import { loadJobsForSource } from '../src/automation/jobDataset.js';

test('loadJobsForSource filters by role and keyword', () => {
  const jobs = loadJobsForSource('linkedin', { roles: ['product'], keywords: 'LLM' });
  assert.equal(jobs.length, 1);
  assert.ok(jobs[0].title.includes('Kıdemli'));
});

