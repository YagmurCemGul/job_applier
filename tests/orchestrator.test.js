import test from 'node:test';
import assert from 'node:assert/strict';
import { Orchestrator } from '../src/pipeline/orchestrator.js';
import { createUserProfile, createDefaultSettings } from '../src/data/models.js';
import { PipelineStore } from '../src/pipeline/pipelineStore.js';
import { createProvider } from '../src/llm/providerFactory.js';

const stubJobs = [
  {
    id: 'job-1',
    source: 'linkedin',
    url: 'https://example.com/job-1',
    title: 'AI Product Lead',
    company: 'Crescent',
    location: 'Remote',
    description: 'Prompt engineering and product discovery.',
    skills: ['Prompt Engineering', 'Product Discovery'],
    salaryHint: {},
    applyMethod: 'platform',
    language: 'en',
    remote: 'remote'
  },
  {
    id: 'job-2',
    source: 'indeed',
    url: 'https://example.com/job-2',
    title: 'Product Marketing Manager',
    company: 'Nova',
    location: 'Remote',
    description: 'GTM strategy and analytics.',
    skills: ['Go-To-Market'],
    salaryHint: {},
    applyMethod: 'external',
    language: 'en',
    remote: 'remote'
  }
];

function createScraper(jobs) {
  return {
    searchJobs: async () => jobs,
    apply: async () => ({ success: true })
  };
}

test('Orchestrator discovers jobs and caches them', async () => {
  const scrapers = {
    linkedin: createScraper([stubJobs[0]]),
    indeed: createScraper([stubJobs[1]]),
    hiringCafe: createScraper([])
  };
  const vault = new Map();
  const orchestrator = new Orchestrator({
    provider: createProvider('mock'),
    scrapers,
    profile: createUserProfile({ skills: ['Prompt Engineering'] }),
    settings: createDefaultSettings(),
    pipelineStore: new PipelineStore(),
    vaultAdapter: {
      get: (key) => vault.get(key),
      set: (entry) => vault.set(entry.questionKey, entry),
      list: () => Object.fromEntries(vault),
      remove: (key) => vault.delete(key)
    }
  });

  const results = await orchestrator.discoverJobs({ filters: { keywords: 'Prompt' } });
  assert.equal(results.length, 2);
  assert.ok(results[0].match.score >= 50);

  const application = orchestrator.applyToJob('job-1', { notes: 'Manual test' });
  assert.equal(application.jobId, 'job-1');
  assert.equal(orchestrator.listApplications().length, 1);

  const updated = orchestrator.updateApplicationStatus(application.id, 'applied');
  assert.equal(updated.status, 'applied');
});

test('Orchestrator stores answers in vault and reuses them', async () => {
  const scrapers = {
    linkedin: createScraper([]),
    indeed: createScraper([]),
    hiringCafe: createScraper([])
  };
  const vault = new Map();
  const orchestrator = new Orchestrator({
    provider: createProvider('mock'),
    scrapers,
    profile: createUserProfile({}),
    settings: createDefaultSettings(),
    pipelineStore: new PipelineStore(),
    vaultAdapter: {
      get: (key) => vault.get(key),
      set: (entry) => vault.set(entry.questionKey, entry),
      list: () => Object.fromEntries(vault),
      remove: (key) => vault.delete(key)
    }
  });

  const response = await orchestrator.answerQuestion('Maaş beklentiniz nedir?');
  assert.ok(response.answer.includes('Maaş'));
  assert.equal(vault.size, 1);

  const second = await orchestrator.answerQuestion('Maaş beklentiniz nedir?');
  assert.equal(second.source, 'vault');
  assert.equal(second.needsUserApproval, false);
});

test('askForMissingFields delegates to provider', async () => {
  const scrapers = {
    linkedin: createScraper([]),
    indeed: createScraper([]),
    hiringCafe: createScraper([])
  };
  const orchestrator = new Orchestrator({
    provider: createProvider('mock'),
    scrapers,
    profile: createUserProfile({}),
    settings: createDefaultSettings(),
    pipelineStore: new PipelineStore(),
    vaultAdapter: {
      get: () => undefined,
      set: () => undefined,
      list: () => ({}),
      remove: () => undefined
    }
  });

  const result = await orchestrator.askForMissingFields(['salaryRange', 'noticePeriod']);
  assert.ok(Array.isArray(result.questions));
  assert.equal(result.questions.length > 0, true);
});
