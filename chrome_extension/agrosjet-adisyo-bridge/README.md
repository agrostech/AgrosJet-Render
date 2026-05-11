# AgrosJet · Adisyo Köprüsü (Chrome Eklentisi) v1.2

Adisyo'nun entegrasyon vermediği restoranlar için Chrome eklentisi.
**Sadece restoran panel kullanıcı adı + şifre** ile çalışır.

## 🚀 Kurulum (30 saniye)

1. **İndir**: https://api.agrosjet.app/api/adisyo-scrape/extension/download
2. **Zip'i çıkart**: `agrosjet-adisyo-bridge` klasörü oluşur.
3. Chrome → `chrome://extensions` → **Geliştirici modu**'nu aç.
4. **Paketlenmemiş öğe yükle** → çıkardığın klasörü seç.

## ⚡ Kullanım

1. Chrome'un sağ üstünde **AgrosJet** ikonuna tıkla (puzzle ikonundan pinleyebilirsin).
2. **Restoran kullanıcı adı + şifre** gir → Giriş Yap.
3. ✅ Tamam! Bağlantı aktif kartını gör.
4. `app.adisyo.com` panelini aç — sipariş listesi açıkken yeni siparişler otomatik AgrosJet'e gider.
5. Yeni sipariş geldiğinde ikon üzerinde yeşil sayaç görünür.

**Token 30 gün geçerlidir** — bir kere giriş yap, ay boyunca uğraşma.

## 🔐 Güvenlik

- Eklenti **restoran kullanıcısı (`restaurant` rolü)** ile login olur. Token sadece o restorana ait.
- Backend tarafında: bir restoran user'ı **başka restoranın** siparişlerini POST edemez (403).
- Token chrome.storage.sync ile şifreli olarak Chrome hesabınızla senkronlanır.

## 🔌 Çalışma Prensibi

- Backend URL **hardcoded**: `https://api.agrosjet.app`
- Eklenti `app.adisyo.com` panelinde `GetOrdersForList` XHR/fetch çağrılarını intercept eder.
- Her sipariş `adisyo_order_id` üzerinden idempotent upsert — duplicate olmaz.
- Mevcut Adisyo webhook entegrasyonundan **tamamen bağımsız** çalışır.

## ⚠️ Sınırlamalar

- **Items (ürün listesi)** çekilmez — her sipariş tek satır "Adisyo Siparişi" + toplam tutar.
- Adisyo paneli (`app.adisyo.com`) sekmesi açıkken çalışır; kapatınca durur.
- `delivered` veya `cancelled` statüsündeki geçmiş siparişler tekrar oluşturulmaz.

## 🔗 İlgili Backend Endpoint'leri

- `POST /api/restaurant-users/login` — Eklenti login için kullanır
- `POST /api/adisyo-scrape/orders` — Sipariş aktarma endpoint'i
- `GET /api/adisyo-scrape/extension/download` — Bu zip dosyası
