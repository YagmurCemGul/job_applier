import test from 'node:test';
import assert from 'node:assert/strict';
import { PipelineStore, groupByStatus } from '../src/pipeline/pipelineStore.js';

const sampleJob = {
  id: 'job-1',
  title: 'Product Manager',
  company: 'Acme',
  location: 'Remote',
  description: 'Sample job',
  skills: ['Product Strategy'],
  source: 'linkedin'
};

test('PipelineStore creates and updates applications', () => {
  const store = new PipelineStore();
  const created = store.createFromJob(sampleJob, { notes: 'LinkedIn' });
  assert.equal(created.status, 'found');
  assert.equal(store.list().length, 1);

  const updated = store.updateStatus(created.id, 'applied');
  assert.equal(updated.status, 'applied');
  assert.ok(updated.timestamps.submittedAt);

  const again = store.createFromJob(sampleJob);
  assert.equal(again.id, created.id, 'should reuse application per job');
});

test('groupByStatus groups pipeline cards', () => {
  const store = new PipelineStore();
  const app1 = store.createFromJob(sampleJob);
  const app2 = store.createFromJob({ ...sampleJob, id: 'job-2' });
  store.updateStatus(app2.id, 'hr');
  const grouped = groupByStatus(store.list());
  assert.equal(grouped.found.length, 1);
  assert.equal(grouped.hr.length, 1);
});
