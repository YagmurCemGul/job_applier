import { randomUUID } from 'node:crypto';

const DEFAULT_STATUSES = ['found', 'applied', 'hr', 'tech', 'offer', 'rejected'];

function normalizeStatus(status) {
  if (!status) return 'found';
  const normalized = status.toLowerCase();
  return DEFAULT_STATUSES.includes(normalized) ? normalized : 'found';
}

export class PipelineStore {
  constructor(initialState = {}) {
    const applications = initialState.applications ?? [];
    this.applications = new Map(applications.map((app) => [app.id, { ...app }]));
  }

  list() {
    return Array.from(this.applications.values()).sort((a, b) => {
      const aCreated = a.timestamps?.createdAt ?? '';
      const bCreated = b.timestamps?.createdAt ?? '';
      return aCreated > bCreated ? -1 : aCreated < bCreated ? 1 : 0;
    });
  }

  /**
   * @param {string} id
   */
  find(id) {
    return this.applications.get(id);
  }

  /**
   * @param {string} jobId
   */
  findByJob(jobId) {
    return Array.from(this.applications.values()).find((app) => app.jobId === jobId);
  }

  /**
   * @param {import('../data/models.js').JobPosting} job
   * @param {{ resumeVariantId?: string, coverLetterId?: string, notes?: string }} [options]
   */
  createFromJob(job, options = {}) {
    const existing = this.findByJob(job.id);
    const now = new Date().toISOString();
    const application = {
      id: existing?.id ?? randomUUID(),
      jobId: job.id,
      resumeVariantId: options.resumeVariantId ?? existing?.resumeVariantId ?? '',
      coverLetterId: options.coverLetterId ?? existing?.coverLetterId ?? '',
      status: existing?.status ?? 'found',
      timestamps: {
        createdAt: existing?.timestamps?.createdAt ?? now,
        updatedAt: now,
        submittedAt: existing?.timestamps?.submittedAt
      },
      notes: options.notes ?? existing?.notes ?? '',
      evidence: existing?.evidence ?? {}
    };
    this.applications.set(application.id, application);
    return application;
  }

  /**
   * @param {string} applicationId
   * @param {'found'|'applied'|'hr'|'tech'|'offer'|'rejected'} status
   */
  updateStatus(applicationId, status) {
    const application = this.find(applicationId);
    if (!application) {
      throw new Error('Application not found');
    }
    const now = new Date().toISOString();
    const normalizedStatus = normalizeStatus(status);
    application.status = normalizedStatus;
    application.timestamps = {
      ...application.timestamps,
      updatedAt: now,
      submittedAt: normalizedStatus === 'applied' ? now : application.timestamps?.submittedAt
    };
    this.applications.set(applicationId, application);
    return application;
  }

  /**
   * @param {string} applicationId
   * @param {Partial<import('../data/models.js').Application>} patch
   */
  patch(applicationId, patch) {
    const application = this.find(applicationId);
    if (!application) {
      throw new Error('Application not found');
    }
    const now = new Date().toISOString();
    const updated = {
      ...application,
      ...patch,
      timestamps: {
        ...application.timestamps,
        ...patch.timestamps,
        updatedAt: now
      }
    };
    this.applications.set(applicationId, updated);
    return updated;
  }

  toJSON() {
    return {
      applications: this.list()
    };
  }
}

export function groupByStatus(applications) {
  return applications.reduce((acc, app) => {
    const status = normalizeStatus(app.status);
    acc[status] = acc[status] ?? [];
    acc[status].push(app);
    return acc;
  }, /** @type {Record<string, import('../data/models.js').Application[]>} */ ({}));
}

