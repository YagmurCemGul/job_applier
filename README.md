# AI Destekli Otomatik İş Başvuru MVP'si

Bu depo, macOS üzerinde çalışacak AI destekli otomatik iş başvuru uygulamasının mimarisini, UI prototipini ve çalışır durumda minimal bir Electron örneğini içerir.

## İçerik
- `docs/` klasöründe mimari tasarım, UI hiyerarşisi ve test planı
- `prompts/templates.json` içinde LLM prompt şablonları
- `src/` altında Electron tabanlı masaüstü uygulama, Playwright sürücü iskeletleri ve LLM sağlayıcı soyutlaması
- `tests/` dizininde Node test runner ile çalıştırılabilir örnek testler

## Teknoloji Seçimleri
- **Electron + Vanilla JS UI**: macOS paketleme ve hızlı prototip imkânı
- **Playwright**: LinkedIn/Indeed/Hiring.cafe otomasyonu için temel sürücüler (stub)
- **LLM Provider Layer**: ChatGPT/Gemini/Claude için genişletilebilir tasarım, şu an `mock` sağlayıcı örneği var
- **Electron Store + SQLCipher planı**: Answer Vault ve ayarlar için yerel şifreli saklama

## Kurulum
1. Node.js 18+ sürümünü yükleyin (macOS için [nvm](https://github.com/nvm-sh/nvm) önerilir).
2. Depoyu klonlayın ve dizine girin.
3. Bağımlılıkları yükleyin:
   ```bash
   npm install
   ```
4. Elektron örneğini başlatın:
   ```bash
   npm start
   ```
   > Not: Playwright sürücüleri demo modundadır; gerçek tarama için Playwright `install` komutlarını çalıştırmanız gerekir.

## Testler
```bash
npm test
```
Node test runner ile veri modeli ve prompt derleyici testleri çalışır.

## Dağıtım
- macOS için paketleme aşamasında `electron-builder` veya `electron-packager` tercih edilebilir.
- SQLCipher kurulumu: `brew install sqlcipher` sonrası Node tarafında `better-sqlite3` + `PRAGMA key` ile entegrasyon planlanmıştır.

## Örnek Akış
1. `İlanları Tara` butonu LinkedIn/Indeed/Hiring.cafe stub sürücülerinden örnek ilanlar getirir.
2. Her ilan kartından `CV Uyarlama` veya `Cover Letter` üretimi tetiklenir.
3. Form soruları için Answer Vault tabanlı LLM yanıtı örneği alınır.

Detaylı süreç ve kenar durumları için `docs/architecture.md` dosyasına bakın.
