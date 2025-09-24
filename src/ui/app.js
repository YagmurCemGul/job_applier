const views = document.querySelectorAll('.view');
const tabButtons = document.querySelectorAll('.tab-bar button');
const onboardingForm = document.getElementById('onboarding-form');
const jobFilterForm = document.getElementById('job-filter-form');
const jobListEl = document.getElementById('job-list');
const resumeOutputEl = document.getElementById('resume-output');
const coverLetterOutputEl = document.getElementById('cover-letter-output');
const formQuestionEl = document.getElementById('form-question');
const formAnswerEl = document.getElementById('form-answer');
const answerFormBtn = document.getElementById('answer-form');
const pipelineColumnsEl = document.getElementById('pipeline-columns');
const vaultRowsEl = document.getElementById('vault-rows');
const vaultForm = document.getElementById('vault-form');
const sessionIndicator = document.getElementById('session-indicator');
const openWizardBtn = document.getElementById('open-llm-wizard');
const llmModal = document.getElementById('llm-modal');
const closeWizardBtn = document.getElementById('close-llm-modal');
const llmForm = document.getElementById('llm-form');
const settingsStatusEl = document.getElementById('settings-llm-status');
const settingsRateLimitEl = document.getElementById('settings-rate-limit');
const testSessionBtn = document.getElementById('test-session');

const state = {
  profile: null,
  settings: null,
  jobs: [],
  selectedJobId: null,
  pipeline: [],
  vault: {}
};

const STATUSES = ['found', 'applied', 'hr', 'tech', 'offer', 'rejected'];

function switchView(viewId) {
  views.forEach((view) => {
    view.classList.toggle('active', view.id === `view-${viewId}`);
  });
  tabButtons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === viewId);
  });
}

tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});

function parseCommaList(value) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseLanguages(value) {
  const entries = parseCommaList(value);
  if (entries.length === 0) {
    return [{ code: 'tr', level: 'native' }];
  }
  return entries.map((entry) => {
    const [code, level] = entry.split(':').map((token) => token.trim());
    return { code: code || 'tr', level: level || 'advanced' };
  });
}

function buildQuestionKey(question) {
  return question
    .toLowerCase()
    .replace(/[^a-z0-9çğıöşü\s]/gi, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 120);
}

function updateOnboardingForm(profile) {
  if (!profile) return;
  onboardingForm.name.value = profile.name ?? '';
  onboardingForm.email.value = profile.email ?? '';
  onboardingForm.roles.value = (profile.roles ?? []).join(', ');
  onboardingForm.locations.value = (profile.locations ?? []).join(', ');
  onboardingForm.remotePreference.value = profile.remotePreference ?? 'any';
  onboardingForm.salaryMin.value = profile.salaryRange?.min ?? '';
  onboardingForm.noticePeriod.value = profile.noticePeriod ?? '';
  onboardingForm.languages.value = (profile.languages ?? [])
    .map((lang) => `${lang.code}:${lang.level}`)
    .join(', ');
  onboardingForm.relocation.checked = Boolean(profile.relocation);
  onboardingForm.dailyCap.value = profile.dailyCap ?? 10;
}

function renderJobs() {
  jobListEl.innerHTML = '';
  if (state.jobs.length === 0) {
    const empty = document.createElement('li');
    empty.textContent = 'Henüz ilan bulunmadı. Filtreleri kullanarak tarama yapın.';
    jobListEl.appendChild(empty);
    return;
  }

  state.jobs.forEach(({ job, match }) => {
    const li = document.createElement('li');
    li.className = 'job-card';
    li.innerHTML = `
      <header>
        <div>
          <h3>${job.title}</h3>
          <small>${job.company} · ${job.location}</small>
        </div>
        <span class="status">${match.score}% uyum</span>
      </header>
      <div class="meta">
        <span>${job.source.toUpperCase()}</span>
        <span>${job.remote === 'remote' ? 'Remote' : job.remote === 'hybrid' ? 'Hibrit' : 'Ofis'}</span>
        <span>${job.language.toUpperCase()}</span>
      </div>
      <p>${job.description.slice(0, 200)}...</p>
      <div class="actions">
        <button data-action="resume">CV Uyarlama</button>
        <button data-action="cover">Cover Letter</button>
        <button data-action="select">Form İçin Seç</button>
        <button data-action="apply">Pipeline'a Ekle</button>
      </div>
    `;

    li.querySelector('[data-action="resume"]').addEventListener('click', async () => {
      resumeOutputEl.textContent = 'LLM çağrısı yapılıyor...';
      const result = await window.appBridge.buildResume({ job, resume: state.profile?.resumeText ?? 'Varsayılan CV içeriği' });
      resumeOutputEl.textContent = JSON.stringify(result, null, 2);
    });

    li.querySelector('[data-action="cover"]').addEventListener('click', async () => {
      coverLetterOutputEl.textContent = 'LLM çağrısı yapılıyor...';
      const cover = await window.appBridge.buildCoverLetter({
        job,
        achievements: state.profile?.highlights ?? ['Ölçülebilir büyüme', 'LLM entegrasyonu'],
        tone: state.profile?.coverTone ?? 'analitik',
        language: job.language
      });
      coverLetterOutputEl.textContent = cover;
    });

    li.querySelector('[data-action="select"]').addEventListener('click', () => {
      state.selectedJobId = job.id;
      formAnswerEl.textContent = `${job.title} form soruları için seçildi.`;
    });

    li.querySelector('[data-action="apply"]').addEventListener('click', async () => {
      const application = await window.appBridge.applyToJob(job.id, {
        notes: `Kaynak: ${job.source}`
      });
      await refreshPipeline();
      formAnswerEl.textContent = `${job.title} pipeline'a eklendi (${application.status}).`;
    });

    jobListEl.appendChild(li);
  });
}

function groupByStatus(applications) {
  return applications.reduce((acc, app) => {
    const status = app.status ?? 'found';
    acc[status] = acc[status] ?? [];
    acc[status].push(app);
    return acc;
  }, {});
}

function renderPipeline() {
  pipelineColumnsEl.innerHTML = '';
  const grouped = groupByStatus(state.pipeline);

  STATUSES.forEach((status) => {
    const column = document.createElement('div');
    column.className = 'pipeline-column';
    const title = status === 'found'
      ? 'Bulundu'
      : status === 'applied'
      ? 'Başvuruldu'
      : status === 'hr'
      ? 'HR Görüşmesi'
      : status === 'tech'
      ? 'Teknik'
      : status === 'offer'
      ? 'Teklif'
      : 'Reddedildi';
    column.innerHTML = `<h3>${title}</h3>`;

    const apps = grouped[status] ?? [];
    if (apps.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'hint';
      empty.textContent = 'Henüz kayıt yok.';
      column.appendChild(empty);
    } else {
      apps.forEach((app) => {
        const card = document.createElement('div');
        card.className = 'pipeline-card';
        const job = state.jobs.find((item) => item.job.id === app.jobId)?.job;
        const jobTitle = job?.title ?? app.jobId;
        card.innerHTML = `
          <strong>${jobTitle}</strong>
          <span>${app.notes ?? ''}</span>
        `;
        const select = document.createElement('select');
        STATUSES.forEach((option) => {
          const opt = document.createElement('option');
          opt.value = option;
          opt.textContent = option;
          if (option === app.status) opt.selected = true;
          select.appendChild(opt);
        });
        select.addEventListener('change', async () => {
          await window.appBridge.updateApplicationStatus(app.id, select.value);
          await refreshPipeline();
        });
        card.appendChild(select);
        column.appendChild(card);
      });
    }

    pipelineColumnsEl.appendChild(column);
  });
}

function renderVault() {
  vaultRowsEl.innerHTML = '';
  const entries = Object.values(state.vault ?? {});
  if (entries.length === 0) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 4;
    cell.textContent = 'Kayıt yok.';
    row.appendChild(cell);
    vaultRowsEl.appendChild(row);
    return;
  }

  entries
    .sort((a, b) => (a.updatedAt ?? '').localeCompare(b.updatedAt ?? ''))
    .reverse()
    .forEach((entry) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${entry.questionKey}</td>
        <td>${entry.answer}</td>
        <td>${new Date(entry.updatedAt ?? Date.now()).toLocaleString('tr-TR')}</td>
        <td><button data-question="${entry.questionKey}" class="secondary">Sil</button></td>
      `;
      row.querySelector('button').addEventListener('click', async () => {
        await window.appBridge.deleteVaultEntry(entry.questionKey);
        await refreshVault();
      });
      vaultRowsEl.appendChild(row);
    });
}

function updateSessionIndicator(settings) {
  const targetSession = settings?.sessions?.[settings?.targetLLM];
  if (targetSession?.profilePath) {
    sessionIndicator.classList.remove('status-idle');
    sessionIndicator.textContent = `${settings.targetLLM.toUpperCase()} oturumu hazır`;
    settingsStatusEl.textContent = `Aktif sağlayıcı: ${settings.targetLLM.toUpperCase()} (son giriş: ${
      targetSession.lastLoginAt ?? 'bilinmiyor'
    })`;
  } else {
    sessionIndicator.classList.add('status-idle');
    sessionIndicator.textContent = 'LLM oturumu bağlı değil';
    settingsStatusEl.textContent = 'Oturum doğrulanmadı.';
  }
}

function updateRateLimitView(settings) {
  settingsRateLimitEl.innerHTML = `
    <p>Global dakika limiti: ${settings?.rateLimits?.globalPerMin ?? 4}</p>
    <p>Sağlayıcı başına dakika limiti: ${settings?.rateLimits?.perProviderPerMin ?? 2}</p>
    <p>Günlük kota: ${settings?.dailyCap ?? 10}</p>
  `;
}

async function refreshPipeline() {
  state.pipeline = await window.appBridge.listApplications();
  renderPipeline();
}

async function refreshVault() {
  state.vault = await window.appBridge.getVaultEntries();
  renderVault();
}

async function refreshSettings() {
  state.settings = await window.appBridge.getSettings();
  updateSessionIndicator(state.settings);
  updateRateLimitView(state.settings);
}

async function refreshProfile() {
  state.profile = await window.appBridge.getProfile();
  updateOnboardingForm(state.profile);
}

async function init() {
  await refreshProfile();
  await refreshSettings();
  await refreshPipeline();
  await refreshVault();
}

onboardingForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(onboardingForm);
  const profilePatch = {
    name: formData.get('name'),
    email: formData.get('email'),
    roles: parseCommaList(String(formData.get('roles') ?? '')),
    locations: parseCommaList(String(formData.get('locations') ?? '')),
    remotePreference: formData.get('remotePreference'),
    salaryRange: {
      currency: 'TRY',
      min: Number(formData.get('salaryMin')) || 0,
      max: state.profile?.salaryRange?.max ?? 0
    },
    noticePeriod: formData.get('noticePeriod'),
    languages: parseLanguages(String(formData.get('languages') ?? '')),
    relocation: Boolean(formData.get('relocation')),
    dailyCap: Number(formData.get('dailyCap')) || 10
  };
  state.profile = await window.appBridge.updateProfile(profilePatch);
  formAnswerEl.textContent = 'Profil güncellendi.';
});

jobFilterForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(jobFilterForm);
  const filters = {
    location: data.get('location') ?? undefined,
    roles: parseCommaList(String(data.get('roles') ?? '')),
    keywords: data.get('keywords') ?? undefined,
    remote: data.get('remote') ?? 'any',
    languages: data.get('language') ? [data.get('language')] : undefined,
    salaryMin: state.profile?.salaryRange?.min ?? undefined
  };
  state.jobs = await window.appBridge.discoverJobs(filters);
  renderJobs();
});

answerFormBtn.addEventListener('click', async () => {
  const question = formQuestionEl.value.trim();
  if (!question) {
    formAnswerEl.textContent = 'Önce bir soru yazın.';
    return;
  }
  const response = await window.appBridge.answerQuestion({ question, vaultEntry: null });
  formAnswerEl.textContent = JSON.stringify(response, null, 2);
  await refreshVault();
});

vaultForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(vaultForm);
  const question = String(formData.get('question') ?? '');
  const answer = String(formData.get('answer') ?? '');
  if (!question || !answer) return;
  const questionKey = buildQuestionKey(question);
  await window.appBridge.saveVaultEntry({ questionKey, answer, lang: 'tr' });
  vaultForm.reset();
  await refreshVault();
});

openWizardBtn.addEventListener('click', () => {
  llmModal.classList.remove('hidden');
});

closeWizardBtn.addEventListener('click', () => {
  llmModal.classList.add('hidden');
});

llmForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(llmForm);
  const provider = formData.get('provider');
  const profilePath = formData.get('profilePath');
  if (!provider || !profilePath) return;
  await window.appBridge.bindSession(provider, { profilePath });
  await refreshSettings();
  llmModal.classList.add('hidden');
});

testSessionBtn.addEventListener('click', async () => {
  settingsStatusEl.textContent = 'Oturum test ediliyor...';
  const result = await window.appBridge.testSession();
  if (result?.ok) {
    settingsStatusEl.textContent = `Bağlantı başarılı: ${result.provider.toUpperCase()}`;
  } else {
    settingsStatusEl.textContent = 'Oturum doğrulanamadı. Lütfen yeniden deneyin.';
  }
});

init();
