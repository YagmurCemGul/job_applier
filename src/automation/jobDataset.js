export const JOB_DATASET = [
  {
    id: 'linkedin-001',
    source: 'linkedin',
    url: 'https://www.linkedin.com/jobs/view/001',
    title: 'Kıdemli Ürün Yöneticisi',
    company: 'Anka Tech',
    location: 'İstanbul · Hibrit',
    remote: 'hybrid',
    description:
      'Ölçeklenebilir SaaS ürünlerinde LLM destekli deneyimler tasarlayacak, OKR takibi yapacak ve çapraz ekipleri yönetecek kıdemli ürün yöneticisi.',
    skills: ['Product Strategy', 'Roadmap', 'OKR', 'Stakeholder Management'],
    roles: ['product', 'pm'],
    language: 'tr',
    salaryHint: { currency: 'TRY', min: 900000, max: 1100000 },
    applyMethod: 'platform'
  },
  {
    id: 'linkedin-002',
    source: 'linkedin',
    url: 'https://www.linkedin.com/jobs/view/002',
    title: 'Senior Software Engineer (Node.js)',
    company: 'Stratus Systems',
    location: 'Remote · Avrupa',
    remote: 'remote',
    description:
      'Node.js, GraphQL ve AWS üzerinde çalışan dağıtık mikro servis mimarisinde deneyimli yazılım mühendisi arıyoruz.',
    skills: ['Node.js', 'GraphQL', 'AWS', 'Microservices'],
    roles: ['software', 'backend'],
    language: 'en',
    salaryHint: { currency: 'EUR', min: 85000, max: 105000 },
    applyMethod: 'platform'
  },
  {
    id: 'indeed-001',
    source: 'indeed',
    url: 'https://www.indeed.com/viewjob?jk=001',
    title: 'Product Marketing Manager',
    company: 'Nova Labs',
    location: 'Remote · Global',
    remote: 'remote',
    description:
      'Yeni ürün lansmanları için GTM stratejisi, içerik ve büyüme kampanyalarını yönetecek product marketing manager.',
    skills: ['Go-To-Market', 'Content Strategy', 'Analytics'],
    roles: ['marketing', 'product'],
    language: 'en',
    salaryHint: { currency: 'USD', min: 100000, max: 130000 },
    applyMethod: 'external'
  },
  {
    id: 'indeed-002',
    source: 'indeed',
    url: 'https://www.indeed.com/viewjob?jk=002',
    title: 'UX/UI Designer',
    company: 'Pixelcraft',
    location: 'İzmir · Ofis',
    remote: 'onsite',
    description:
      'Mobil ve web uygulamalarında kullanıcı deneyimini geliştirecek, araştırma ve görsel tasarım becerilerine sahip UX/UI designer.',
    skills: ['UX Research', 'Figma', 'Design Systems'],
    roles: ['design'],
    language: 'tr',
    salaryHint: { currency: 'TRY', min: 600000, max: 750000 },
    applyMethod: 'platform'
  },
  {
    id: 'hiringcafe-001',
    source: 'hiringcafe',
    url: 'https://hiring.cafe/job/001',
    title: 'AI Product Lead',
    company: 'Crescent AI',
    location: 'Remote · GMT+3',
    remote: 'remote',
    description:
      'LLM destekli iş akışları için yol haritası çıkaracak, prompt mühendisliği ve deney tasarımı bilen AI product lead.',
    skills: ['Prompt Engineering', 'Product Discovery', 'Analytics'],
    roles: ['product', 'ai'],
    language: 'en',
    salaryHint: { currency: 'USD', min: 120000, max: 150000 },
    applyMethod: 'external'
  },
  {
    id: 'hiringcafe-002',
    source: 'hiringcafe',
    url: 'https://hiring.cafe/job/002',
    title: 'Customer Success Specialist',
    company: 'Supportly',
    location: 'Ankara · Hibrit',
    remote: 'hybrid',
    description:
      'B2B SaaS müşterileri için onboarding ve destek süreçlerini yönetecek customer success specialist.',
    skills: ['Customer Success', 'CRM', 'Training'],
    roles: ['support', 'operations'],
    language: 'tr',
    salaryHint: { currency: 'TRY', min: 450000, max: 520000 },
    applyMethod: 'platform'
  }
];

/**
 * Basit filtreleme yardımcıları
 * @param {typeof JOB_DATASET[number]} job
 * @param {Record<string, any>} filters
 */
function matches(job, filters = {}) {
  if (!filters) return true;
  if (filters.remote && filters.remote !== 'any' && job.remote !== filters.remote) {
    return false;
  }
  if (filters.location) {
    const tokens = String(filters.location).split(',').map((t) => t.trim().toLowerCase());
    const locationText = job.location.toLowerCase();
    if (!tokens.some((token) => token && locationText.includes(token))) {
      return false;
    }
  }
  if (Array.isArray(filters.roles) && filters.roles.length > 0) {
    const normalizedRoles = filters.roles.map((r) => r.toLowerCase());
    const jobRoles = (job.roles ?? []).map((r) => r.toLowerCase());
    if (!normalizedRoles.some((role) => jobRoles.includes(role))) {
      return false;
    }
  }
  if (filters.keywords) {
    const keywordTokens = String(filters.keywords)
      .split(',')
      .map((token) => token.trim().toLowerCase())
      .filter(Boolean);
    if (keywordTokens.length > 0) {
      const haystack = `${job.title} ${job.description}`.toLowerCase();
      if (!keywordTokens.every((token) => haystack.includes(token))) {
        return false;
      }
    }
  }
  if (Array.isArray(filters.languages) && filters.languages.length > 0) {
    if (!filters.languages.includes(job.language)) {
      return false;
    }
  }
  if (filters.salaryMin) {
    const salaryMin = Number(filters.salaryMin);
    if (Number.isFinite(salaryMin) && job.salaryHint?.min && job.salaryHint.min < salaryMin) {
      return false;
    }
  }
  return true;
}

/**
 * Kaynaktan filtrelenmiş ilanları getir
 * @param {'linkedin'|'indeed'|'hiringcafe'} source
 * @param {Record<string, any>} [filters]
 */
export function loadJobsForSource(source, filters = {}) {
  return JOB_DATASET.filter((job) => job.source === source && matches(job, filters));
}

