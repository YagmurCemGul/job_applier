# UI Prototipi ve Component Hiyerarşisi

> **Varsayım:** MVP aşamasında React + Tailwind kullanılıyor, durum yönetimi için Zustand tercih ediliyor.

## 1. Ekranlar

1. **Onboarding Sihirbazı**
   - Adım 1: Profil Temel Bilgiler (isim, iletişim, roller).
   - Adım 2: Tercihler (lokasyon, maaş, çalışma modeli, vize).
   - Adım 3: CV yükleme, günlük limit ve "Hedef LLM (Web)" seçimi.
   - Adım 4: LLM Hesap Bağlama mini sihirbazı tetiklenir.
2. **Dashboard**
   - Sol tarafta filtre paneli (rol, lokasyon, kaynak site, skor aralığı).
   - Sağda Kanban pipeline (Bulundu → Başvuruldu → HR Görüşmesi → Teknik → Teklif → Reddedildi).
3. **Job Detayı Drawer**
   - İlan metni, gereksinim listesi, skor breakdown.
   - Aksiyon butonları: "CV'yi Uyarlayın", "Cover Letter Oluştur", "Başvuruyu Başlat".
4. **Answer Vault**
   - Soru-anahtar listesi, kategori filtreleri (Maaş, Vize, Çalışma Modeli, Diğer).
   - Inline edit ve versiyon geçmişi.
5. **Ayarlar**
   - Hedef LLM (Web) seçimi, hız limitleri, captcha modal davranışı, siyah/beyaz listeler, veri ihracı, oturum sıfırlama.
6. **Log & Diagnostik**
   - Son başvurular listesi, durum, hata mesajı, ekran görüntüsü önizleme.
7. **LLM Hesap Bağlama Sihirbazı**
   - Sağlayıcı seçimi (ChatGPT/Gemini/Claude).
   - "Oturumu başlat" butonu headful pencerede giriş sayfasını açar.
   - Kullanıcı giriş/2FA/CAPTCHA'yı tamamladıktan sonra "Oturumu kaydet" ile profil dizini ve şifreli cookie deposu oluşturulur.
   - "Test mesajı" prompt'u çalıştırarak DOM'dan yanıt okunabildiği doğrulanır.

## 2. Component Hiyerarşisi

```
<AppShell>
  <SideNav />
  <HeaderBar />
  <ContentArea>
    <Route path="/onboarding">
      <OnboardingWizard>
        <StepProfile />
        <StepPreferences />
        <StepUploads />
        <StepLLMSelection />
      </OnboardingWizard>
    </Route>
    <Route path="/dashboard">
      <DashboardLayout>
        <FilterPanel />
        <KanbanBoard>
          <Column status="found">
            <JobCard />
          </Column>
          ...
        </KanbanBoard>
      </DashboardLayout>
      <JobDrawer />
    </Route>
    <Route path="/vault">
      <AnswerVaultPage>
        <VaultList />
        <VaultDetail />
      </AnswerVaultPage>
    </Route>
    <Route path="/settings">
      <SettingsPage>
        <ModelSelector />
        <RateLimitForm />
        <ListManager type="blacklist" />
        <SessionManager />
        <ExportSection />
      </SettingsPage>
    </Route>
    <Route path="/logs">
      <LogPage>
        <LogTable />
        <ScreenshotModal />
      </LogPage>
    </Route>
  </ContentArea>
  <ToastHub />
  <CaptchaModal />
  <PromptTuningSheet />
  <LLMBindingWizard />
</AppShell>
```

## 3. State Yönetimi

### Global Store (Zustand)
- `userProfile`
- `settings`
- `llmSessions`
- `answerVault`
- `jobs` (liste + filtre)
- `applications`
- `ui` (modallar, toasts, yükleme durumları)
- `prompts` (kullanıcı override'ları)

### Derived State / Selectors
- `selectJobsByStatus(status)`
- `selectJobById(id)`
- `selectVaultEntry(key)`
- `selectDailyProgress()`

### Async Actions
- `fetchJobs()` → Orchestrator IPC çağrısı.
- `startApplication(jobId)` → otomasyon tetikleme.
- `saveVaultEntry()` → AnswerVault service.
- `updateSettings()` → Keychain + Store güncelleme.
- `linkLLMSession(provider)` → headful Playwright penceresi açar, cookie profilini şifreli kaydeder.
- `testLLMSession(provider)` → test prompt'u gönderir, DOM yanıtını doğrular.

## 4. Veri Modelleri UI'da

```
type PipelineColumn = {
  id: string;
  title: string;
  status: ApplicationStatus;
  limit?: number;
};

type JobCardVM = {
  id: string;
  title: string;
  company: string;
  location: string;
  matchScore: number;
  updatedAt: string;
  hasNewEvents: boolean;
};

type VaultEntryVM = {
  questionKey: string;
  answer: string;
  category: string;
  updatedAt: string;
  needsReview: boolean;
};
```

## 5. UX Notları
- İnsan benzeri otomasyon durumları UI'da “devam ediyor” spinner + iptal butonu ile gösterilir.
- CAPTCHA uyarısı, modal + adım açıklaması + "Çözdüm" butonu.
- İlk açılışta onboarding zorunlu, tamamlanmadan dashboard açılmaz.
- Pipeline kartları drag&drop (React Beautiful DnD veya alternatif), manuel durum değişikliğini destekler.
- Log sayfası filtreleri (kaynak, tarih, durum) ve CSV indirme.
- LLM Hesap Bağlama Sihirbazı tamamlanmadan LLM tabanlı butonlar (CV uyarlama, cover letter) devreye girmez.
- LLM headful penceresi uzun yanıtlar sırasında kapatılmamalı; kullanıcıya "arka plana alabilirsiniz" uyarısı gösterilir.

