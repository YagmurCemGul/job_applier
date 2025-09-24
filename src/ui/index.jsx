import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';

const STATUSES = ['found', 'applied', 'hr', 'tech', 'offer', 'rejected'];
const STATUS_LABELS = {
  found: 'Bulundu',
  applied: 'Başvuruldu',
  hr: 'HR Görüşmesi',
  tech: 'Teknik',
  offer: 'Teklif',
  rejected: 'Reddedildi'
};

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

function stringifyLanguages(languages) {
  if (!languages || languages.length === 0) {
    return '';
  }
  return languages.map((lang) => `${lang.code}:${lang.level}`).join(', ');
}

function buildQuestionKey(question) {
  return question
    .toLowerCase()
    .replace(/[^a-z0-9çğıöşü\s]/gi, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 120);
}

function createProfileForm(profile) {
  return {
    name: profile?.name ?? '',
    email: profile?.email ?? '',
    roles: (profile?.roles ?? []).join(', '),
    locations: (profile?.locations ?? []).join(', '),
    remotePreference: profile?.remotePreference ?? 'any',
    salaryMin: profile?.salaryRange?.min ? String(profile.salaryRange.min) : '',
    noticePeriod: profile?.noticePeriod ?? '',
    languages: stringifyLanguages(profile?.languages ?? []),
    relocation: Boolean(profile?.relocation ?? false),
    dailyCap: profile?.dailyCap ? String(profile.dailyCap) : '10'
  };
}

function buildSessionStatus(settings) {
  const target = settings?.targetLLM;
  if (!target) {
    return {
      ready: false,
      label: 'LLM oturumu bağlı değil',
      details: 'Oturum doğrulanmadı.'
    };
  }
  const session = settings?.sessions?.[target];
  if (session?.profilePath) {
    return {
      ready: true,
      label: `${target.toUpperCase()} oturumu hazır`,
      details: `Aktif sağlayıcı: ${target.toUpperCase()} (son giriş: ${
        session.lastLoginAt ?? 'bilinmiyor'
      })`
    };
  }
  return {
    ready: false,
    label: 'LLM oturumu bağlı değil',
    details: 'Oturum doğrulanmadı.'
  };
}

function groupByStatus(applications) {
  return applications.reduce((acc, app) => {
    const status = app.status ?? 'found';
    acc[status] = acc[status] ?? [];
    acc[status].push(app);
    return acc;
  }, {});
}

function JobsView({
  filters,
  onChangeFilters,
  onSearch,
  jobs,
  onBuildResume,
  onBuildCoverLetter,
  onSelectForForm,
  onApply,
  resumeOutput,
  coverLetterOutput,
  formQuestion,
  setFormQuestion,
  onAnswerQuestion,
  formAnswer,
  selectedJobId,
  isSearching
}) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">İlan Tarama</h2>
          {selectedJobId && (
            <span className="status-pill status-pill-ready">
              Form için seçili ilan: {selectedJobId}
            </span>
          )}
        </div>
        <form
          onSubmit={onSearch}
          className="card space-y-4"
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="text-sm font-medium text-slate-300">
              Lokasyon / Saat Dilimi
              <input
                className="mt-1 w-full rounded-lg border-slate-700 bg-slate-950/70 text-sm text-slate-100 focus:border-brand-500 focus:ring-brand-500"
                type="text"
                name="location"
                value={filters.location}
                onChange={(event) => onChangeFilters({ location: event.target.value })}
                placeholder="Remote, İstanbul"
              />
            </label>
            <label className="text-sm font-medium text-slate-300">
              Roller
              <input
                className="mt-1 w-full rounded-lg border-slate-700 bg-slate-950/70 text-sm text-slate-100 focus:border-brand-500 focus:ring-brand-500"
                type="text"
                name="roles"
                value={filters.roles}
                onChange={(event) => onChangeFilters({ roles: event.target.value })}
                placeholder="Product, Software"
              />
            </label>
            <label className="text-sm font-medium text-slate-300">
              Anahtar Kelimeler
              <input
                className="mt-1 w-full rounded-lg border-slate-700 bg-slate-950/70 text-sm text-slate-100 focus:border-brand-500 focus:ring-brand-500"
                type="text"
                name="keywords"
                value={filters.keywords}
                onChange={(event) => onChangeFilters({ keywords: event.target.value })}
                placeholder="LLM, Playwright"
              />
            </label>
            <label className="text-sm font-medium text-slate-300">
              Uzaktan Tercihi
              <select
                className="mt-1 w-full rounded-lg border-slate-700 bg-slate-950/70 text-sm text-slate-100 focus:border-brand-500 focus:ring-brand-500"
                name="remote"
                value={filters.remote}
                onChange={(event) => onChangeFilters({ remote: event.target.value })}
              >
                <option value="any">Hepsi</option>
                <option value="remote">Remote</option>
                <option value="hybrid">Hibrit</option>
                <option value="onsite">Ofis</option>
              </select>
            </label>
            <label className="text-sm font-medium text-slate-300">
              İlan Dili
              <select
                className="mt-1 w-full rounded-lg border-slate-700 bg-slate-950/70 text-sm text-slate-100 focus:border-brand-500 focus:ring-brand-500"
                name="language"
                value={filters.language}
                onChange={(event) => onChangeFilters({ language: event.target.value })}
              >
                <option value="">TR/EN</option>
                <option value="tr">Türkçe</option>
                <option value="en">İngilizce</option>
              </select>
            </label>
          </div>
          <button type="submit" className="primary-btn" disabled={isSearching}>
            {isSearching ? 'Taranıyor…' : 'İlanları Tara'}
          </button>
        </form>
        <ul className="space-y-4">
          {jobs.length === 0 && (
            <li className="card text-sm text-slate-300">
              Henüz ilan bulunmadı. Filtreleri kullanarak tarama yapın.
            </li>
          )}
          {jobs.map(({ job, match }) => (
            <li key={job.id} className="card space-y-4">
              <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                <div>
                  <h3 className="text-lg font-semibold text-white">{job.title}</h3>
                  <p className="text-sm text-slate-300">
                    {job.company} · {job.location}
                  </p>
                </div>
                <span className="status-pill status-pill-ready">{match.score}% uyum</span>
              </header>
              <div className="flex flex-wrap gap-2 text-xs text-slate-400">
                <span className="status-pill">{job.source.toUpperCase()}</span>
                <span className="status-pill">
                  {job.remote === 'remote' ? 'Remote' : job.remote === 'hybrid' ? 'Hibrit' : 'Ofis'}
                </span>
                <span className="status-pill">{job.language.toUpperCase()}</span>
              </div>
              <p className="text-sm leading-relaxed text-slate-200">
                {job.description.slice(0, 280)}...
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  className="primary-btn"
                  type="button"
                  onClick={() => onBuildResume(job)}
                >
                  CV Uyarlama
                </button>
                <button
                  className="secondary-btn"
                  type="button"
                  onClick={() => onBuildCoverLetter(job)}
                >
                  Cover Letter
                </button>
                <button
                  className="secondary-btn"
                  type="button"
                  onClick={() => onSelectForForm(job)}
                >
                  Form İçin Seç
                </button>
                <button
                  className="secondary-btn"
                  type="button"
                  onClick={() => onApply(job)}
                >
                  Pipeline'a Ekle
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <aside className="space-y-4">
        <div className="card space-y-3">
          <h3 className="text-lg font-semibold">CV Uyarlama Önizlemesi</h3>
          <pre className="output-box whitespace-pre-wrap">{resumeOutput}</pre>
        </div>
        <div className="card space-y-3">
          <h3 className="text-lg font-semibold">Cover Letter Taslağı</h3>
          <pre className="output-box whitespace-pre-wrap">{coverLetterOutput}</pre>
        </div>
        <div className="card space-y-3">
          <h3 className="text-lg font-semibold">Form Soru Yanıtı</h3>
          <textarea
            className="h-24 w-full rounded-lg border border-slate-700 bg-slate-950/70 text-sm text-slate-100 focus:border-brand-500 focus:ring-brand-500"
            placeholder="Maaş beklentiniz nedir?"
            value={formQuestion}
            onChange={(event) => setFormQuestion(event.target.value)}
          />
          <button type="button" className="primary-btn" onClick={onAnswerQuestion}>
            Yanıt Öner
          </button>
          <pre className="output-box whitespace-pre-wrap">{formAnswer}</pre>
        </div>
      </aside>
    </div>
  );
}

function OnboardingView({ form, onChange, onSubmit }) {
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">İlk Kurulum</h2>
      <form onSubmit={onSubmit} className="card space-y-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="text-sm font-medium text-slate-300">
            Ad Soyad
            <input
              className="mt-1 w-full rounded-lg border-slate-700 bg-slate-950/70 text-sm text-slate-100 focus:border-brand-500 focus:ring-brand-500"
              type="text"
              name="name"
              value={form.name}
              onChange={(event) => onChange({ name: event.target.value })}
              required
            />
          </label>
          <label className="text-sm font-medium text-slate-300">
            E-posta
            <input
              className="mt-1 w-full rounded-lg border-slate-700 bg-slate-950/70 text-sm text-slate-100 focus:border-brand-500 focus:ring-brand-500"
              type="email"
              name="email"
              value={form.email}
              onChange={(event) => onChange({ email: event.target.value })}
              required
            />
          </label>
          <label className="text-sm font-medium text-slate-300">
            Hedef Roller
            <input
              className="mt-1 w-full rounded-lg border-slate-700 bg-slate-950/70 text-sm text-slate-100 focus:border-brand-500 focus:ring-brand-500"
              type="text"
              name="roles"
              value={form.roles}
              onChange={(event) => onChange({ roles: event.target.value })}
              placeholder="Product, Software, Design"
            />
          </label>
          <label className="text-sm font-medium text-slate-300">
            Tercih Edilen Lokasyonlar
            <input
              className="mt-1 w-full rounded-lg border-slate-700 bg-slate-950/70 text-sm text-slate-100 focus:border-brand-500 focus:ring-brand-500"
              type="text"
              name="locations"
              value={form.locations}
              onChange={(event) => onChange({ locations: event.target.value })}
              placeholder="Remote, İstanbul, Berlin"
            />
          </label>
          <label className="text-sm font-medium text-slate-300">
            Uzaktan Çalışma Tercihi
            <select
              className="mt-1 w-full rounded-lg border-slate-700 bg-slate-950/70 text-sm text-slate-100 focus:border-brand-500 focus:ring-brand-500"
              name="remotePreference"
              value={form.remotePreference}
              onChange={(event) => onChange({ remotePreference: event.target.value })}
            >
              <option value="any">Farketmez</option>
              <option value="remote">Remote</option>
              <option value="hybrid">Hibrit</option>
              <option value="onsite">Ofis</option>
            </select>
          </label>
          <label className="text-sm font-medium text-slate-300">
            Maaş Alt Limiti (Yıllık)
            <input
              className="mt-1 w-full rounded-lg border-slate-700 bg-slate-950/70 text-sm text-slate-100 focus:border-brand-500 focus:ring-brand-500"
              type="number"
              name="salaryMin"
              value={form.salaryMin}
              onChange={(event) => onChange({ salaryMin: event.target.value })}
              placeholder="750000"
            />
          </label>
          <label className="text-sm font-medium text-slate-300">
            Bildirim Süresi
            <input
              className="mt-1 w-full rounded-lg border-slate-700 bg-slate-950/70 text-sm text-slate-100 focus:border-brand-500 focus:ring-brand-500"
              type="text"
              name="noticePeriod"
              value={form.noticePeriod}
              onChange={(event) => onChange({ noticePeriod: event.target.value })}
              placeholder="2 hafta"
            />
          </label>
          <label className="text-sm font-medium text-slate-300">
            Diller
            <input
              className="mt-1 w-full rounded-lg border-slate-700 bg-slate-950/70 text-sm text-slate-100 focus:border-brand-500 focus:ring-brand-500"
              type="text"
              name="languages"
              value={form.languages}
              onChange={(event) => onChange({ languages: event.target.value })}
              placeholder="tr:ana dil,en:ileri"
            />
          </label>
          <label className="flex items-center gap-3 text-sm font-medium text-slate-300 md:col-span-2">
            <input
              className="rounded border-slate-700 text-brand-500 focus:ring-brand-500"
              type="checkbox"
              name="relocation"
              checked={form.relocation}
              onChange={(event) => onChange({ relocation: event.target.checked })}
            />
            Gerekirse taşınabilirim
          </label>
          <label className="text-sm font-medium text-slate-300 md:col-span-2">
            Günlük başvuru limiti
            <input
              className="mt-1 w-full rounded-lg border-slate-700 bg-slate-950/70 text-sm text-slate-100 focus:border-brand-500 focus:ring-brand-500"
              type="number"
              min="1"
              max="30"
              name="dailyCap"
              value={form.dailyCap}
              onChange={(event) => onChange({ dailyCap: event.target.value })}
            />
          </label>
        </div>
        <div className="space-y-2">
          <button type="submit" className="primary-btn">
            Profili Kaydet
          </button>
          <p className="text-xs text-slate-400">
            Bu bilgiler Answer Vault ve otomatik başvuru akışında kullanılacak.
          </p>
        </div>
      </form>
    </section>
  );
}

function PipelineView({ grouped, onChangeStatus }) {
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">Başvuru Pipeline</h2>
      <div className="grid gap-4 lg:grid-cols-3 xl:grid-cols-6">
        {STATUSES.map((status) => {
          const apps = grouped[status] ?? [];
          return (
            <div key={status} className="card flex min-h-[220px] flex-col gap-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
                {STATUS_LABELS[status]}
              </h3>
              {apps.length === 0 ? (
                <p className="text-xs text-slate-500">Henüz kayıt yok.</p>
              ) : (
                <ul className="space-y-3">
                  {apps.map((app) => (
                    <li key={app.id} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-200">
                      <div className="flex flex-col gap-1">
                        <strong className="text-sm font-semibold text-white">
                          {app.jobTitle ?? app.jobId}
                        </strong>
                        {app.notes && <span className="text-xs text-slate-400">{app.notes}</span>}
                      </div>
                      <select
                        className="mt-2 w-full rounded-lg border-slate-700 bg-slate-900 text-xs text-slate-100 focus:border-brand-500 focus:ring-brand-500"
                        value={app.status ?? 'found'}
                        onChange={(event) => onChangeStatus(app.id, event.target.value)}
                      >
                        {STATUSES.map((option) => (
                          <option key={option} value={option}>
                            {STATUS_LABELS[option]}
                          </option>
                        ))}
                      </select>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function VaultView({ entries, onDelete, onSave }) {
  const [form, setForm] = useState({ question: '', answer: '' });

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.question.trim() || !form.answer.trim()) return;
    await onSave(form.question, form.answer);
    setForm({ question: '', answer: '' });
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Cevap Kasası</h2>
        <div className="card overflow-hidden p-0">
          <table className="min-w-full divide-y divide-slate-800 text-sm">
            <thead className="bg-slate-900/60 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Soru Anahtarı</th>
                <th className="px-4 py-3 text-left font-semibold">Yanıt</th>
                <th className="px-4 py-3 text-left font-semibold">Güncellendi</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-400">
                    Kayıt yok.
                  </td>
                </tr>
              ) : (
                entries.map((entry) => (
                  <tr key={entry.questionKey} className="text-sm text-slate-200">
                    <td className="px-4 py-3 font-mono text-xs text-slate-400">{entry.questionKey}</td>
                    <td className="px-4 py-3 whitespace-pre-wrap text-sm">{entry.answer}</td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {new Date(entry.updatedAt ?? Date.now()).toLocaleString('tr-TR')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        className="secondary-btn"
                        onClick={() => onDelete(entry.questionKey)}
                      >
                        Sil
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
      <aside className="space-y-4">
        <form onSubmit={handleSubmit} className="card space-y-3">
          <h3 className="text-lg font-semibold">Yeni Yanıt Kaydet</h3>
          <label className="text-sm font-medium text-slate-300">
            Soru
            <textarea
              className="mt-1 h-24 w-full rounded-lg border border-slate-700 bg-slate-950/70 text-sm text-slate-100 focus:border-brand-500 focus:ring-brand-500"
              value={form.question}
              onChange={(event) => setForm((prev) => ({ ...prev, question: event.target.value }))}
              required
            />
          </label>
          <label className="text-sm font-medium text-slate-300">
            Yanıt
            <textarea
              className="mt-1 h-24 w-full rounded-lg border border-slate-700 bg-slate-950/70 text-sm text-slate-100 focus:border-brand-500 focus:ring-brand-500"
              value={form.answer}
              onChange={(event) => setForm((prev) => ({ ...prev, answer: event.target.value }))}
              required
            />
          </label>
          <button type="submit" className="primary-btn">
            Kasaya Kaydet
          </button>
        </form>
      </aside>
    </div>
  );
}

function SettingsView({ sessionDetails, rateLimits, onTestSession }) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <section className="card space-y-3">
        <h3 className="text-lg font-semibold">LLM Oturum Durumu</h3>
        <p className="text-sm text-slate-300">{sessionDetails.details}</p>
        <button type="button" className="primary-btn" onClick={onTestSession}>
          Oturumu Test Et
        </button>
      </section>
      <section className="card space-y-3">
        <h3 className="text-lg font-semibold">Rate Limit & Günlük Kota</h3>
        <p className="text-sm text-slate-300">Global dakika limiti: {rateLimits.globalPerMin}</p>
        <p className="text-sm text-slate-300">Sağlayıcı başına dakika limiti: {rateLimits.perProviderPerMin}</p>
        <p className="text-sm text-slate-300">Günlük kota: {rateLimits.dailyCap}</p>
      </section>
    </div>
  );
}

function LLMWizardModal({ isOpen, form, onChange, onClose, onSubmit }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur">
      <div className="w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/50">
        <header className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-white">LLM Hesap Bağlama Sihirbazı</h2>
          <button type="button" className="secondary-btn" onClick={onClose}>
            Kapat
          </button>
        </header>
        <form onSubmit={onSubmit} className="space-y-4">
          <label className="text-sm font-medium text-slate-300">
            Sağlayıcı
            <select
              className="mt-1 w-full rounded-lg border-slate-700 bg-slate-950/70 text-sm text-slate-100 focus:border-brand-500 focus:ring-brand-500"
              value={form.provider}
              onChange={(event) => onChange({ provider: event.target.value })}
            >
              <option value="chatgpt">ChatGPT</option>
              <option value="gemini">Gemini</option>
              <option value="claude">Claude</option>
            </select>
          </label>
          <label className="text-sm font-medium text-slate-300">
            Profil Dizini
            <input
              className="mt-1 w-full rounded-lg border-slate-700 bg-slate-950/70 text-sm text-slate-100 focus:border-brand-500 focus:ring-brand-500"
              type="text"
              value={form.profilePath}
              onChange={(event) => onChange({ profilePath: event.target.value })}
              placeholder="~/Library/Application Support/JobApplier/chatgpt"
              required
            />
          </label>
          <p className="text-xs text-slate-400">
            Giriş yaptıktan sonra oturumun saklandığı klasörü girin. Çerezler SQLCipher ile şifrelenir.
          </p>
          <button type="submit" className="primary-btn w-full">
            Oturumu Kaydet
          </button>
        </form>
      </div>
    </div>
  );
}

function App() {
  const [activeTab, setActiveTab] = useState('onboarding');
  const [profile, setProfile] = useState(null);
  const [profileForm, setProfileForm] = useState(createProfileForm(null));
  const [jobs, setJobs] = useState([]);
  const [jobFilters, setJobFilters] = useState({
    location: '',
    roles: '',
    keywords: '',
    remote: 'any',
    language: ''
  });
  const [resumeOutput, setResumeOutput] = useState('');
  const [coverLetterOutput, setCoverLetterOutput] = useState('');
  const [formQuestion, setFormQuestion] = useState('');
  const [formAnswer, setFormAnswer] = useState('');
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [pipeline, setPipeline] = useState([]);
  const [vaultEntries, setVaultEntries] = useState([]);
  const [settings, setSettings] = useState(null);
  const [sessionDetails, setSessionDetails] = useState(buildSessionStatus(null));
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardForm, setWizardForm] = useState({ provider: 'chatgpt', profilePath: '' });
  const [toast, setToast] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      try {
        const [profileData, settingsData, pipelineData, vaultData] = await Promise.all([
          window.appBridge.getProfile(),
          window.appBridge.getSettings(),
          window.appBridge.listApplications(),
          window.appBridge.getVaultEntries()
        ]);
        if (cancelled) return;
        setProfile(profileData);
        setProfileForm(createProfileForm(profileData));
        setSettings(settingsData);
        setSessionDetails(buildSessionStatus(settingsData));
        setPipeline(pipelineData ?? []);
        setVaultEntries(Object.values(vaultData ?? {}).sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')));
        const provider = settingsData?.targetLLM ?? 'chatgpt';
        const profilePath = settingsData?.sessions?.[provider]?.profilePath ?? '';
        setWizardForm({ provider, profilePath });
        if (!settingsData?.sessions?.[provider]?.profilePath) {
          setWizardOpen(true);
        }
      } catch (error) {
        console.error('Bootstrap failed', error);
      }
    }
    bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const groupedPipeline = useMemo(() => groupByStatus(pipeline), [pipeline]);

  const updateProfileForm = (patch) => {
    setProfileForm((prev) => ({ ...prev, ...patch }));
  };

  const updateJobFilters = (patch) => {
    setJobFilters((prev) => ({ ...prev, ...patch }));
  };

  const refreshPipeline = async () => {
    const next = await window.appBridge.listApplications();
    setPipeline(next ?? []);
  };

  const refreshVault = async () => {
    const next = await window.appBridge.getVaultEntries();
    setVaultEntries(
      Object.values(next ?? {}).sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
    );
  };

  const refreshSettings = async () => {
    const next = await window.appBridge.getSettings();
    setSettings(next);
    setSessionDetails(buildSessionStatus(next));
    const provider = next?.targetLLM ?? 'chatgpt';
    setWizardForm((prev) => ({ ...prev, provider, profilePath: next?.sessions?.[provider]?.profilePath ?? '' }));
    if (!next?.sessions?.[provider]?.profilePath) {
      setWizardOpen(true);
    }
    return next;
  };

  const handleOnboardingSubmit = async (event) => {
    event.preventDefault();
    try {
      const patch = {
        name: profileForm.name,
        email: profileForm.email,
        roles: parseCommaList(profileForm.roles),
        locations: parseCommaList(profileForm.locations),
        remotePreference: profileForm.remotePreference,
        salaryRange: {
          currency: 'TRY',
          min: Number(profileForm.salaryMin) || 0,
          max: profile?.salaryRange?.max ?? 0
        },
        noticePeriod: profileForm.noticePeriod,
        languages: parseLanguages(profileForm.languages),
        relocation: Boolean(profileForm.relocation),
        dailyCap: Number(profileForm.dailyCap) || 10
      };
      const updated = await window.appBridge.updateProfile(patch);
      setProfile(updated);
      setToast('Profil güncellendi.');
    } catch (error) {
      console.error('Profil güncelleme hatası', error);
      setToast('Profil güncellenemedi.');
    }
  };

  const handleSearchJobs = async (event) => {
    event.preventDefault();
    setIsSearching(true);
    try {
      const filters = {
        location: jobFilters.location || undefined,
        roles: parseCommaList(jobFilters.roles),
        keywords: jobFilters.keywords || undefined,
        remote: jobFilters.remote ?? 'any',
        languages: jobFilters.language ? [jobFilters.language] : undefined,
        salaryMin: profile?.salaryRange?.min ?? undefined
      };
      const results = await window.appBridge.discoverJobs(filters);
      setJobs(results ?? []);
    } catch (error) {
      console.error('İlan tarama hatası', error);
      setToast('İlanlar taranırken bir sorun oluştu.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleBuildResume = async (job) => {
    try {
      setResumeOutput('LLM çağrısı yapılıyor...');
      const result = await window.appBridge.buildResume({
        job,
        resume: profile?.resumeText ?? 'Varsayılan CV içeriği'
      });
      setResumeOutput(typeof result === 'string' ? result : JSON.stringify(result, null, 2));
    } catch (error) {
      console.error('CV uyarlama hatası', error);
      setResumeOutput('CV uyarlanamadı.');
    }
  };

  const handleBuildCoverLetter = async (job) => {
    try {
      setCoverLetterOutput('LLM çağrısı yapılıyor...');
      const cover = await window.appBridge.buildCoverLetter({
        job,
        achievements: profile?.highlights ?? ['Ölçülebilir büyüme', 'LLM entegrasyonu'],
        tone: profile?.coverTone ?? 'analitik',
        language: job.language
      });
      setCoverLetterOutput(typeof cover === 'string' ? cover : JSON.stringify(cover, null, 2));
    } catch (error) {
      console.error('Cover letter oluşturma hatası', error);
      setCoverLetterOutput('Cover letter oluşturulamadı.');
    }
  };

  const handleSelectForForm = (job) => {
    setSelectedJobId(job.id);
    setToast(`${job.title} form soruları için seçildi.`);
  };

  const handleApply = async (job) => {
    try {
      await window.appBridge.applyToJob(job.id, { notes: `Kaynak: ${job.source}` });
      await refreshPipeline();
      setToast(`${job.title} pipeline'a eklendi.`);
    } catch (error) {
      console.error('Pipeline ekleme hatası', error);
      setToast('Pipeline güncellenemedi.');
    }
  };

  const handleAnswerQuestion = async () => {
    if (!formQuestion.trim()) {
      setFormAnswer('Önce bir soru yazın.');
      return;
    }
    try {
      const response = await window.appBridge.answerQuestion({
        question: formQuestion,
        vaultEntry: null
      });
      setFormAnswer(JSON.stringify(response, null, 2));
      await refreshVault();
    } catch (error) {
      console.error('Form sorusu yanıtı alınamadı', error);
      setFormAnswer('Yanıt alınamadı.');
    }
  };

  const handleSaveVaultEntry = async (question, answer) => {
    const questionKey = buildQuestionKey(question);
    await window.appBridge.saveVaultEntry({ questionKey, answer, lang: 'tr' });
    await refreshVault();
  };

  const handleDeleteVaultEntry = async (questionKey) => {
    await window.appBridge.deleteVaultEntry(questionKey);
    await refreshVault();
  };

  const handleStatusChange = async (applicationId, status) => {
    await window.appBridge.updateApplicationStatus(applicationId, status);
    await refreshPipeline();
  };

  const handleWizardSubmit = async (event) => {
    event.preventDefault();
    if (!wizardForm.provider || !wizardForm.profilePath) return;
    await window.appBridge.bindSession(wizardForm.provider, {
      profilePath: wizardForm.profilePath
    });
    const updated = await refreshSettings();
    if (updated?.sessions?.[updated?.targetLLM ?? '']?.profilePath) {
      setWizardOpen(false);
      setToast('LLM oturumu kaydedildi.');
    } else {
      setToast('Oturum doğrulanamadı, lütfen profil dizinini kontrol edin.');
    }
  };

  const handleTestSession = async () => {
    try {
      setSessionDetails((prev) => ({ ...prev, details: 'Oturum test ediliyor...' }));
      const result = await window.appBridge.testSession();
      if (result?.ok) {
        setSessionDetails({
          ready: true,
          label: `${result.provider.toUpperCase()} oturumu hazır`,
          details: `Bağlantı başarılı: ${result.provider.toUpperCase()}`
        });
      } else {
        setSessionDetails((prev) => ({
          ...prev,
          ready: false,
          details: 'Oturum doğrulanamadı. Lütfen yeniden deneyin.'
        }));
      }
    } catch (error) {
      console.error('Test session error', error);
      setSessionDetails((prev) => ({
        ...prev,
        ready: false,
        details: 'Test sırasında bir hata oluştu.'
      }));
    }
  };

  const handleWizardClose = () => {
    if (sessionDetails.ready) {
      setWizardOpen(false);
    } else {
      setToast('Oturum bağlanmadan sihirbaz kapanamaz.');
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-col gap-4 border-b border-slate-800 bg-slate-950/90 px-8 py-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">AI Destekli İş Başvuru Asistanı</h1>
          <p className="text-sm text-slate-400">macOS için Playwright + LLM otomasyon demosu</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button className="secondary-btn" type="button" onClick={() => setWizardOpen(true)}>
            LLM Hesap Bağla
          </button>
          <span className={`status-pill ${sessionDetails.ready ? 'status-pill-ready' : ''}`}>
            {sessionDetails.label}
          </span>
        </div>
      </header>
      <nav className="flex flex-wrap gap-2 border-b border-slate-800 bg-slate-950/80 px-8 py-3">
        {[
          { id: 'onboarding', label: 'Onboarding' },
          { id: 'jobs', label: 'İlanlar' },
          { id: 'applications', label: 'Başvurular' },
          { id: 'vault', label: 'Cevap Kasası' },
          { id: 'settings', label: 'Ayarlar' }
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`tab-button ${activeTab === tab.id ? 'tab-button-active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <main className="flex-1 space-y-8 px-8 py-6">
        {activeTab === 'onboarding' && (
          <OnboardingView form={profileForm} onChange={updateProfileForm} onSubmit={handleOnboardingSubmit} />
        )}
        {activeTab === 'jobs' && (
          <JobsView
            filters={jobFilters}
            onChangeFilters={updateJobFilters}
            onSearch={handleSearchJobs}
            jobs={jobs}
            onBuildResume={handleBuildResume}
            onBuildCoverLetter={handleBuildCoverLetter}
            onSelectForForm={handleSelectForForm}
            onApply={handleApply}
            resumeOutput={resumeOutput}
            coverLetterOutput={coverLetterOutput}
            formQuestion={formQuestion}
            setFormQuestion={setFormQuestion}
            onAnswerQuestion={handleAnswerQuestion}
            formAnswer={formAnswer}
            selectedJobId={selectedJobId}
            isSearching={isSearching}
          />
        )}
        {activeTab === 'applications' && (
          <PipelineView grouped={groupedPipeline} onChangeStatus={handleStatusChange} />
        )}
        {activeTab === 'vault' && (
          <VaultView entries={vaultEntries} onDelete={handleDeleteVaultEntry} onSave={handleSaveVaultEntry} />
        )}
        {activeTab === 'settings' && (
          <SettingsView
            sessionDetails={sessionDetails}
            rateLimits={{
              globalPerMin: settings?.rateLimits?.globalPerMin ?? 4,
              perProviderPerMin: settings?.rateLimits?.perProviderPerMin ?? 2,
              dailyCap: settings?.dailyCap ?? 10
            }}
            onTestSession={handleTestSession}
          />
        )}
      </main>
      <footer className="border-t border-slate-800 px-8 py-4 text-xs text-slate-500">
        Demo: CAPTCHA ve 2FA durumlarında manuel müdahale gereklidir. Headful pencereyi kapatmayın.
      </footer>
      {toast && (
        <div className="fixed bottom-6 right-6 rounded-xl border border-brand-500 bg-brand-500/10 px-4 py-3 text-sm text-brand-50 shadow-lg shadow-brand-500/40">
          {toast}
        </div>
      )}
      <LLMWizardModal
        isOpen={wizardOpen}
        form={wizardForm}
        onChange={(patch) => setWizardForm((prev) => ({ ...prev, ...patch }))}
        onClose={handleWizardClose}
        onSubmit={handleWizardSubmit}
      />
    </div>
  );
}

const container = document.getElementById('root');
const root = createRoot(container);
root.render(<App />);
