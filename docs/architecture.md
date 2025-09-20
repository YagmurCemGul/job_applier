# AI Destekli Otomatik İş Başvuru Uygulaması Mimari Dokümanı

> **Varsayımlar:** Kullanıcı ilk kurulumda tüm izinleri verir, gerekli hesap girişlerini manuel yapar ve Playwright oturum açma adımlarını onaylar. CAPTCHA'lar kullanıcı tarafından çözülür. LinkedIn/Indeed/Hiring.cafe oturum açma ve başvuru süreçleri, Playwright ile web otomasyonu kapsamında mümkün olduğu ölçüde desteklenir.

## 1. Üst Seviye Mimari

```
+---------------------+        +------------------------+
|  Electron Main      |        |  LLM Provider Adapter  |
|  (macOS Desktop)    |        |  (ChatGPT/Gemini/Claude)
+----------+----------+        +-----------+------------+
           |                               |
           | IPC                            |
           v                               v
+------------------------+      +--------------------------+
| React UI (Renderer)    |<---->|  Orchestrator Service    |
| - Onboarding           |      |  - Flow Engine           |
| - Pipeline             |      |  - Job Matching          |
| - Answer Vault         |      |  - Prompt Composer       |
+-----------+------------+      +--------------------------+
            |                                   |
            v                                   v
  +---------------------+           +--------------------------+
  | Secure Data Layer   |<-------->| Automation Layer         |
  | - SQLCipher (SQLite)|          | - Playwright Drivers     |
  | - Electron Store    |          | - Anti-bot Controls      |
  +---------------------+          +--------------------------+
```

### Modül Sorumlulukları

- **Electron Main**: Uygulama yaşam döngüsü, menü, bildirimler, macOS Keychain entegrasyonu.
- **Renderer (React)**: UI ekranları, state yönetimi, kullanıcı etkileşimi, bildirimler ve modal akışlar.
- **Orchestrator Service**: Başvuru sürecinin uçtan uca kontrolü. Scraper çıktıları ile LLM üretimlerini birleştirir, Answer Vault ve veri tabanı ile etkileşir.
- **Automation Layer**: Playwright tabanlı site sürücüleri, oturum ve hız yönetimi, hata ve retry politikaları.
- **Secure Data Layer**: SQLCipher ile şifreli veri saklama, Answer Vault için şifreli anahtar-değer deposu, macOS Keychain üzerinden API anahtar yönetimi.
- **LLM Provider Adapter**: Seçilen tek model için generative işlevleri soyut bir arayüz altında toplar.

## 2. Veri Akışları

1. **Onboarding**
   - Kullanıcı, hedef pozisyon aileleri, lokasyon, maaş bandı vb. bilgileri girer.
   - Yanıtlar Answer Vault ve Settings tablolarına kaydedilir. Eksik bilgiler için `askForMissing()` promptu devreye girer.
2. **İlan Toplama**
   - Orchestrator, tanımlı filtrelere göre site sürücülerini (LinkedIn/Indeed/Hiring.cafe) tetikler.
   - Her sürücü, hız limitleri ve rastgele beklemelerle sayfaları gezer, ilan verilerini normalize edilmiş `JobPosting` modeline dönüştürür.
3. **İlan-Eşleşme**
   - JobPosting verileri, profil/skill matrisine göre kural tabanlı eşleşme (keyword skor) ve LLM açıklamalı skor ile değerlendirilir.
   - Eşik üstü ilanlar aday listesine eklenir, UI pipeline'da “Bulundu” sütununa düşer.
4. **CV & Cover Letter Üretimi**
   - `tailorResume()` ve `generateCoverLetter()` fonksiyonları, prompt şablonları + Answer Vault verileri + kullanıcı ön ayarları ile LLM çağrısı yapar.
   - Oluşan dosyalar `ResumeVariant` ve `CoverLetter` kayıtlarına bağlanır. PDF/DOCX üretimi için yerel dönüştürücü (ör. `soffice --convert-to` veya macOS `qlmanage` scripti) tetiklenir.
5. **Form Doldurma & Gönderim**
   - Orchestrator, `applyToJob()` metoduyla Playwright form doldurma scriptini çalıştırır.
   - Formda soru sorulduğunda Answer Vault'tan yanıt aranır, yoksa `answerFormQuestion()` promptu kullanılır. `needsUserApproval` true ise UI modalı açılır.
   - CAPTCHA algılanırsa UI modalı ile uyarı verilir; çözüm sonrası akış kaldığı yerden devam eder.
6. **Takip & Bildirimler**
   - Başvuru durumu otomatik olarak “Başvuruldu” sütununa geçer. Ek notlar, loglar ve ekran görüntüsü yolları Application kaydına eklenir.
   - Kullanıcı durum güncellemesi yaptığında (ör. HR görüşmesi), veriler pipeline state'ine yansır, hatırlatıcı planlanır.

## 3. Teknoloji Seçimleri

| Katman | Teknoloji | Gerekçe |
|--------|-----------|---------|
| UI     | **Electron + React + Tailwind** | macOS'ta tek paketle dağıtım; web tabanlı UI geliştirme verimliliği; Tailwind ile hızlı prototipleme. |
| Otomasyon | **Playwright** | Çoklu tarayıcı desteği, insan benzeri etkileşim API'leri, güvenilir bekleme mekanizmaları. |
| Veri | **SQLCipher (SQLite)** | Yerel şifreli veritabanı, offline çalışabilme, basit dağıtım. Node.js için `better-sqlite3` ile bağlanıp `PRAGMA key` kullanımı. |
| LLM | **Provider Abstraction Layer** | ChatGPT, Gemini veya Claude için tek arayüz. HTTP client `fetch` ve streaming desteği. |
| Config | **Electron Store (şifreli)** | Küçük ölçekli ayarlar için; macOS Keychain ile API anahtar depolama. |
| Test | **Playwright Test + Node Test Runner** | Scraper senaryoları için tarayıcı temelli; modüller için hızlı unit test. |

## 4. Modül Detayları

### 4.1 Automation Layer
- **BaseScraper**: Oturum yönetimi, ortak bekleme/scroll davranışları, `humanLikeActions()` yardımcıları.
- **Site Sürücüleri**: LinkedIn, Indeed, Hiring.cafe. Her biri:
  - Login flow (manuel giriş + cookie kaydetme).
  - İlan listeleme, detay çekme, başvuru linki çıkarımı.
  - Hız limiti (örn. dakikada 20 istek), retry (exponential backoff), hata loglama.
  - robots.txt ve ToS kontrollerini config'ten okuma.
- **Apply Flow**: Form alanlarını DOM seçicileriyle doldurma, dosya upload, onay butonları.

### 4.2 LLM Provider Layer
- `LLMProvider` arayüzü: `generateCoverLetter()`, `tailorResume()`, `answerFormQuestion()`, `askForMissing()`, `summarizeJob()`.
- `OpenAIProvider`, `AnthropicProvider`, `GeminiProvider` sınıfları. Rate limit, streaming, hata handle.

### 4.3 Data Layer
- Şifreli SQLite tablo şeması:
  - `user_profile`
  - `jobs`
  - `applications`
  - `documents`
  - `answer_vault`
  - `settings`
- SQLCipher açılışı için kullanıcı anahtarından türetilen `key` (`PBKDF2` veya `scrypt`).
- AnswerVault için hassas alanlar (maaş, çalışma izni) AES-256 ile ek şifreleme.

### 4.4 Orchestrator Service
- `JobDiscoveryService`: arama filtreleri, scheduler (cron benzeri, macOS launchd entegrasyonu opsiyonel).
- `MatchingEngine`: anahtar kelime skor, LLM açıklaması, eşiğe göre pipeline.
- `DocumentService`: CV varyantı oluşturma, revizyon diff'i kaydetme.
- `ApplicationService`: Başvuruyu tetikleme, log/ekran görüntüsü.
- `NotificationService`: macOS native notifications (electron `Notification`).

### 4.5 UI Katmanı
- Onboarding wizard (progressive form, 3 adım).
- Dashboard: Pipeline kanban (Bulundu, Başvuruldu, HR Görüşmesi, Teknik, Teklif, Reddedildi).
- Job Details paneli: ilan metni, uyum skoru, generate/resume buttons.
- Answer Vault ekranı: soru-yanıt listesi, edit.
- Ayarlar: LLM seçimi, hız limitleri, captcha bildirim modu, siyah/beyaz liste.
- Log Center: Akış logları, ekran görüntüsü thumb, hata filtreleme.

## 5. Güvenlik ve Gizlilik
- **PII Şifreleme**: SQLCipher `PRAGMA cipher_page_size = 4096; PRAGMA kdf_iter = 64000`. Kişisel veriler AES-GCM ile ayrıca sarılır.
- **API Anahtarları**: macOS Keychain (electron `keytar` modülü) üzerinden saklanır.
- **Veri İhracı**: JSON/CSV dışa aktarma; kullanıcı onayı, dosyalar `~/Documents/JobApplierExports` dizinine şifreli olarak yazılır.
- **Log Masking**: Otomasyon loglarında PII maskeleme.
- **ToS Uyum**: Filtre ayarlarında robots.txt denetimi, throttle, manuel captcha.

## 6. Hata ve Kenar Durumları
- Giriş başarısız → 3 deneme, sonra kullanıcıya bildirim + manuel müdahale.
- CAPTCHA algısı → modal + adım kaydı; 5 dakikada çözülmezse zaman aşımı.
- LLM yanıtı tutarsız/boş → otomatik yeniden deneme (maks. 2), sonra kullanıcıya prompt tweak önerisi.
- Dosya yükleme hatası → pipeline “Eksik” durumuna al, UI’da tekrar dene butonu.
- İnternet kesilmesi → scheduler duraklatma, tekrar bağlanınca kaldığı yerden.

## 7. Zamanlama ve Pipeline Yönetimi
- Günlük başvuru limiti ve takvim: Scheduler, kullanıcı tanımlı saat aralığında (örn. 09:00-20:00) çalışır.
- Batch mod: Gece tarama, gündüz başvuru.
- Manuel mod: Kullanıcı ilan seçip "Şimdi Başvur" der.

## 8. Örnek Dosya Yapısı

```
job_applier/
├── docs/
│   ├── architecture.md
│   ├── test_plan.md
│   └── ui_prototype.md
├── prompts/
│   └── templates.json
├── src/
│   ├── automation/
│   │   ├── baseScraper.js
│   │   ├── linkedinScraper.js
│   │   ├── indeedScraper.js
│   │   └── hiringCafeScraper.js
│   ├── data/
│   │   ├── models.js
│   │   └── vault.js
│   ├── llm/
│   │   ├── providerFactory.js
│   │   └── promptComposer.js
│   ├── pipeline/
│   │   └── orchestrator.js
│   ├── main.js
│   ├── preload.js
│   └── ui/
│       ├── app.js
│       ├── index.html
│       └── styles.css
├── tests/
│   └── data-models.test.js
├── package.json
└── README.md
```

## 9. Ölçümler & Başarı Kriterleri
- Başvuru tamamlama oranı ≥ %80 (manuel müdahale gerekmeyen).
- CAPTCHA'larda kullanıcı müdahalesi < %20.
- CV/CL üretim süresi < 60 saniye.
- Günlük başvuru limiti uyması (%100).
- Hata loglarına göre otomasyon retry sonrası başarı ≥ %70.

