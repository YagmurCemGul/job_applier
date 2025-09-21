const jobListEl = document.getElementById('job-list');
const scanJobsBtn = document.getElementById('scan-jobs');
const resumeOutputEl = document.getElementById('resume-output');
const coverLetterOutputEl = document.getElementById('cover-letter-output');
const formQuestionEl = document.getElementById('form-question');
const formAnswerEl = document.getElementById('form-answer');
const answerFormBtn = document.getElementById('answer-form');

let currentJobs = [];
let selectedJob;

scanJobsBtn.addEventListener('click', async () => {
  scanJobsBtn.disabled = true;
  scanJobsBtn.textContent = 'Taranıyor...';
  const filters = { location: 'Remote', roles: ['Product', 'Software'] };
  const results = await window.appBridge.discoverJobs(filters);
  currentJobs = results;
  renderJobs();
  scanJobsBtn.disabled = false;
  scanJobsBtn.textContent = 'İlanları Tara';
});

answerFormBtn.addEventListener('click', async () => {
  if (!selectedJob) {
    formAnswerEl.textContent = 'Önce bir ilan seçin.';
    return;
  }
  const question = formQuestionEl.value.trim();
  if (!question) {
    formAnswerEl.textContent = 'Bir soru yazın.';
    return;
  }
  const response = await window.appBridge.answerQuestion({ question, vaultEntry: null });
  formAnswerEl.textContent = JSON.stringify(response, null, 2);
});

function renderJobs() {
  jobListEl.innerHTML = '';
  currentJobs.forEach(({ job, match }) => {
    const li = document.createElement('li');
    li.className = 'job-card';
    li.innerHTML = `
      <h3>${job.title}</h3>
      <small>${job.company} · ${job.location}</small>
      <p>Uyum Skoru: ${match.score}%</p>
      <div class="actions">
        <button data-action="resume">CV Uyarlama</button>
        <button data-action="cover">Cover Letter</button>
        <button data-action="select">Form İçin Seç</button>
      </div>
    `;

    li.querySelector('[data-action="resume"]').addEventListener('click', async () => {
      const result = await window.appBridge.buildResume({ job, resume: 'Varsayılan CV içeriği' });
      resumeOutputEl.textContent = JSON.stringify(result, null, 2);
    });

    li.querySelector('[data-action="cover"]').addEventListener('click', async () => {
      const cover = await window.appBridge.buildCoverLetter({
        job,
        achievements: ['Gelir %20 artışı', '3 ürün lansmanı'],
        tone: 'analitik',
        language: 'tr'
      });
      coverLetterOutputEl.textContent = cover;
    });

    li.querySelector('[data-action="select"]').addEventListener('click', () => {
      selectedJob = job;
      formAnswerEl.textContent = `${job.title} seçildi.`;
    });

    jobListEl.appendChild(li);
  });
}
