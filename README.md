# AI Destekli Otomatik İş Başvuru MVP'si

Bu depo, macOS üzerinde çalışacak AI destekli otomatik iş başvuru uygulamasının mimarisini, UI prototipini ve çalışır durumda minimal bir Electron örneğini içerir. Son sürümde onboarding sihirbazı, statik iş ilanı veri seti, pipeline takibi ve Cevap Kasası yönetimi gibi temel fonksiyonlar mock LLM sağlayıcısı ile etkileşimli şekilde gösterilmektedir.

## İçerik
- `docs/` klasöründe mimari tasarım, UI hiyerarşisi ve test planı
- `prompts/templates.json` içinde LLM prompt şablonları
- `src/` altında Electron tabanlı masaüstü uygulama, Playwright sürücü iskeletleri ve LLM sağlayıcı soyutlaması
- `tests/` dizininde Node test runner ile çalıştırılabilir örnek testler

## Teknoloji Seçimleri
- **Electron + React/Tailwind UI**: macOS paketleme ve hızlı prototip; React bileşenleri ve Tailwind yardımcı sınıflarıyla onboarding, ilan tarama, pipeline, Answer Vault ve ayarlar ekranlarına ayrılmış çok sekmeli arayüz.
- **Playwright**: LinkedIn/Indeed/Hiring.cafe otomasyonu için temel sürücüler (stub)
- **LLM Web Automation Katmanı**: ChatGPT/Gemini/Claude sohbet arayüzlerini Playwright ile kontrol eden sürücü soyutlaması; `mock` sürücü, cover letter / CV uyarlama / form Q&A ve eksik bilgi akışlarını demo eder, oturum testi ve web profili bağlama sihirbazı UI’da sunulur.
- **In-memory Pipeline Store + Answer Vault**: Başvurular pipeline sütunlarına kaydedilir, cevaplar yerel kasada tutulur; gerçek ortamda SQLCipher ve macOS Keychain entegrasyonu planlanmıştır.
- **Electron Store + SQLCipher planı**: Answer Vault ve ayarlar için yerel şifreli saklama

## Kurulum
1. Node.js 18+ sürümünü yükleyin (macOS için [nvm](https://github.com/nvm-sh/nvm) önerilir).
2. Depoyu klonlayın ve dizine girin.
3. Bağımlılıkları yükleyin:
   ```bash
   npm install
   ```
4. Playwright tarayıcı ikililerini indirin (ilk kurulumda zorunlu):
   ```bash
   npx playwright install
   ```
5. Tailwind CSS ve React renderer paketini derleyin (Electron komutu bunu otomatik olarak çalıştırır ancak manuel derleme için kullanılabilir):
   ```bash
   npm run build
   ```
6. Elektron örneğini başlatın:
   ```bash
   npm start
   ```
   > Notlar:
   > - İlk açılışta onboarding formunu doldurun; UI, Answer Vault ve pipeline verilerini sizin girdilerinizle günceller.
   > - LLM Hesap Bağlama sihirbazı ilk açılışta otomatik gösterilir; gerçek bir ChatGPT/Gemini/Claude profili bağlayana kadar kapanmaz.
   > - Playwright sürücüleri demo modundadır; gerçek tarama için Playwright `install` komutlarını çalıştırmanız ve gerçek giriş profilleri sağlamanız gerekir.
   > - LLM oturum penceresi headful modda açıldığında uzun yanıtlar sırasında pencereyi kapatmayın (arka plana alınabilir).

## Testler
```bash
npm test
```
Node test runner ile veri modeli, statik iş ilanı filtrelemesi, pipeline store ve orchestrator davranışlarını kapsayan testler çalışır.

```bash
npm run test:e2e
```
Playwright tabanlı headful/kalıcı profil senaryolarını CI ortamında headless moda düşerek simüle eder; ChatGPT/Gemini/Claude web sürücülerinin oturum açma, yanıt üretimi, yeniden oturum açma ve CAPTCHA tespiti davranışlarını doğrular.

## Dağıtım
- macOS için paketleme aşamasında `electron-builder` veya `electron-packager` tercih edilebilir.
- SQLCipher kurulumu: `brew install sqlcipher` sonrası Node tarafında `better-sqlite3` + `PRAGMA key` ile entegrasyon planlanmıştır.

## Örnek Akış
1. Onboarding sekmesinde hedef roller, lokasyon, maaş eşiği ve günlük limit gibi alanları doldurun.
2. “İlanlar” sekmesinden filtreleri seçip `İlanları Tara` ile statik veri setinden eşleşen LinkedIn/Indeed/Hiring.cafe ilanlarını listeleyin.
3. Kart üzerindeki aksiyonlarla mock LLM’den ATS uyumlu CV diff, cover letter ve form yanıtı üretin; “Pipeline’a Ekle” ile başvuruyu pipeline görünümüne taşıyın.
4. Answer Vault sekmesinde otomatik kaydedilen veya manuel girdiğiniz cevapları yönetin, gerektiğinde silin.
5. Ayarlar sekmesinden hedef LLM oturumunu bağlayın ve “Oturumu Test Et” ile mock sağlayıcıyı doğrulayın.

Detaylı süreç ve kenar durumları için `docs/architecture.md` dosyasına bakın.
