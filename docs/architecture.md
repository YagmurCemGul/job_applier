# AI Destekli Otomatik İş Başvuru Uygulaması Mimari Dokümanı

> **Varsayımlar:** Kullanıcı ilk kurulumda tüm izinleri verir, gerekli hesap girişlerini manuel yapar ve Playwright oturum açma adımlarını onaylar. CAPTCHA'lar ve 2FA kullanıcı tarafından çözülür. LinkedIn/Indeed/Hiring.cafe oturum açma ve başvuru süreçleri Playwright ile web otomasyonu kapsamında yürütülür. LLM erişimi API yerine sağlayıcıların web arayüzleri (ChatGPT/Gemini/Claude) üzerinden, kullanıcı aboneliğiyle ve tarayıcı otomasyonu aracılığıyla sağlanır.

## 1. Üst Seviye Mimari

```
+---------------------+        +------------------------+
|  Electron Main      |        |  LLM Web Automation    |
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
- **Secure Data Layer**: SQLCipher ile şifreli veri saklama, Answer Vault için şifreli anahtar-değer deposu, macOS Keychain üzerinden oturum/cookie şifreleme anahtarları.
- **LLM Web Automation**: Seçilen sağlayıcının sohbet arayüzünü Playwright ile kontrol eder, prompt'u DOM üzerinden gönderir, yanıtı ayrıştırır, oturum yenilemeyi ve hata yakalamayı yönetir.

## 2. Veri Akışları

1. **Onboarding**
   - Kullanıcı, hedef pozisyon aileleri, lokasyon, maaş bandı vb. bilgileri girer.
   - LLM Hesap Bağlama Sihirbazı tetiklenir: kullanıcı seçtiği sağlayıcının (ChatGPT/Gemini/Claude) web arayüzüne headful Playwright penceresiyle giriş yapar, 2FA/CAPTCHA çözer, "Oturumu Kaydet" ile profil dizini + şifreli cookie deposu oluşturulur.
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
| LLM | **Playwright tabanlı Web LLM Sürücüleri** | ChatGPT, Gemini veya Claude'un sohbet arayüzünü otomatikleştirir; prompt gönderimi DOM üzerinden yapılır. |
| Config | **Electron Store (şifreli)** | Küçük ölçekli ayarlar için; macOS Keychain ile cookie şifreleme anahtarları ve kullanıcı onay bayrakları tutulur. |
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

### 4.2 LLM Web UI Otomasyon Katmanı
- `BaseWebLLMDriver`: Playwright context'i ile çalışır; `openSession(profile)` oturumu headful modda açar, cookie geçerliliğini kontrol eder.
- Sağlayıcı sürücüleri: `ChatGPTWebDriver`, `GeminiWebDriver`, `ClaudeWebDriver`.
  - **sendPrompt({ role, purpose, inputs, constraints })**: Prompt'u sohbet kutusuna yapıştırır, gerekli kısayolları (örn. shift+enter) simüle eder.
  - **awaitCompletion({ timeout, stallHeuristics })**: DOM'da yazma animasyonu, "Stop generating" düğmesi, spinner gibi sinyalleri gözlemler.
  - **readResponse()**: Yanıt bloklarını DOM'dan çıkarır; kod blokları ve listeler dahil metni normalize eder.
  - **attachFile(path)**: CV veya ilan metni dosyalarını sürükle-bırak alanına Playwright `setInputFiles` ile bırakır.
  - **handleErrors()**: Oturum süresi dolması, beklenmeyen yönlendirme, Cloudflare koruma, karakter sınırı gibi durumları algılar; gerekirse kullanıcıya uyarı mesajı döner.
  - **splitAndChain()**: Uzun içerikleri parçalayarak ardışık prompt zinciri oluşturur, yanıtları birleştirir.
- Çıktı tipleri: `CoverLetter`, `ResumeDiff`, `Answers` (form yanıtları), `MissingQuestions` (kullanıcıdan tekrar sorulacak alanlar).
- Koruyucu önlemler: Token/karakter tahmini, yanıt durması halinde küçük tetikleyici hareketler (scroll/focus blur), debug modunda ekran görüntüsü + HTML snapshot kaydı.

### 4.3 Data Layer
- Şifreli SQLite tablo şeması:
  - `user_profile`
  - `jobs`
  - `applications`
  - `documents`
  - `answer_vault`
  - `settings` (LLM hedefi, tarayıcı profilleri, hız limitleri, onay bayrakları)
- SQLCipher açılışı için kullanıcı anahtarından türetilen `key` (`PBKDF2` veya `scrypt`).
- AnswerVault için hassas alanlar (maaş, çalışma izni) AES-256 ile ek şifreleme.
- macOS Keychain sadece oturum/cookie şifreleme anahtarlarını ve profil dizini referanslarını tutar; parola saklanmaz.

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
- **Oturum Saklama**: LLM sağlayıcı cookie'leri SQLCipher içinde şifreli saklanır, anahtar macOS Keychain'den alınır. Parola saklama yok; kullanıcı gerektiğinde yeniden giriş yapar.
- **Veri İhracı & Temizleme**: JSON/CSV dışa aktarma; kullanıcı onayı sonrası `~/Documents/JobApplierExports` dizinine şifreli olarak yazılır. "Tüm oturumları sıfırla" butonu profil dizinlerini temizler.
- **Log Masking**: Otomasyon loglarında PII maskeleme, LLM oturum snapshot'ları sadece debug modda tutulur.
- **ToS Uyum**: Kullanıcıya otomasyonun sağlayıcı ToS ve hız limitlerine uyduğuna dair bilgilendirme + onay metni gösterilir; throttle + robots.txt kontrolü + manuel captcha modalı zorunlu.

## 6. Hata ve Kenar Durumları
- Zorunlu yeniden giriş: 401/redirect algılanırsa akış durdurulur, “Giriş gerekli” modalı açılır ve headful pencere yeniden odaklanır.
- CAPTCHA algısı → modal + adım kaydı; 5 dakikada çözülmezse zaman aşımı.
- Cloudflare/koruma sayfaları: Kullanıcıya uyarı gösterilir, rastgele bekleme aralığı sonrası tekrar deneme seçeneği sunulur.
- Karakter sınırı: LLM yanıtı reddederse `splitAndChain()` ile içerik parçalara bölünür, kalan prompt kuyruğa alınır.
- UI değişikliği: Birincil seçici başarısızsa sürücü CSS/XPath heuristics rotasyonuna geçer; yine başarısız olursa “Sürücü Güncelle” bildirimi.
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

