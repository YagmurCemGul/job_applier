# Test Planı ve Başarı Ölçütleri

## 1. Test Yaklaşımı
- **Modüler Unit Testler**: Veri modelleri, skor hesaplamaları, prompt composer fonksiyonları Node test runner ile doğrulanır.
- **Servis Entegrasyon Testleri**: Orchestrator'ın LLM, Answer Vault ve otomasyon katmanını orkestre etmesi mocking ile test edilir.
- **Playwright E2E**: Scraper sürücüleri ve form doldurma akışları için gerçek tarayıcı testleri (headless + slowMo) çalıştırılır.
- **Güvenlik Testleri**: Şifreli veritabanı açılışı, anahtar rotasyonu, PII maskeleme.
- **Performans Testleri**: Günlük başvuru limiti senaryosu, 50 ilanlık batch eşleştirme.

## 2. Test Senaryoları

| ID | Senaryo | Adımlar | Beklenen |
|----|---------|--------|----------|
| UT-01 | UserProfile kaydı | `saveUserProfile()` | Veri tabanına şifreli kaydedilir. |
| UT-02 | Answer Vault yazma | `upsertAnswer()` | Tekil questionKey, tarih güncellenir. |
| UT-03 | Prompt composer | `composeTailorResumePrompt()` | Şablonda gerekli alanlar doldurulur. |
| ST-01 | İş tarama | LinkedIn sürücüsü mock HTML | Normalize `JobPosting` döner. |
| ST-02 | Eşleşme skoru | `MatchingEngine.match()` | Eşik üzeri/altı doğru ayrılır. |
| ST-03 | Başvuru akışı | `ApplicationService.apply()` | CAPTCHA modalı tetikler, pause/resume. |
| E2E-01 | Başvuru tam akışı | Onboarding → tarama → başvuru | Pipeline "Başvuruldu" güncellenir, loglar kaydedilir. |
| SEC-01 | Keychain erişimi | Sahte anahtar | Yetkisiz erişim reddi loglanır. |
| PERF-01 | Günlük limit | 12 başvuru denemesi | İlk 10 işlenir, kalanlar ertelenir. |

## 3. Test Ortamı
- macOS 13+ (Apple Silicon uyumlu).
- Node.js 18 LTS, npm 9+
- Playwright Chromium + WebKit (LinkedIn/Indeed uyumu için WebKit fallback).
- SQLCipher yüklü (`brew install sqlcipher`).

## 4. Otomasyon Pipeline'ı
- `npm run test` → Unit test (Node `--test`).
- `npm run test:e2e` → Playwright test (gelecekte).
- `npm run lint` → Script (şimdilik placeholder, ileride ESLint + Prettier).
- CI: GitHub Actions (macOS runner) + gece planlı smoke test.

## 5. Başarı Ölçütleri
- Test coverage (unit + service) ≥ %70.
- Playwright e2e senaryolarında başarı ≥ %80.
- Ortalama başvuru süresi (tarama + uygulama) ≤ 3 dk.
- Manuel müdahale gerektiren başvuru oranı ≤ %20.
- Kritik hata (otomasyon crash) sıklığı ≤ haftada 1.

