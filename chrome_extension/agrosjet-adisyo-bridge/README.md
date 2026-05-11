# AgrosJet · Adisyo Köprüsü (Chrome Eklentisi) v1.1

Adisyo'nun entegrasyon vermediği restoranlar için (örn. Terra Pizza) köprü
görevi gören Chrome eklentisi. **Sadece kullanıcı adı + şifre** ile çalışır —
token kopyalama veya UUID girme yok.

## 🚀 Kurulum (60 saniye)

1. **İndir**: https://api.agrosjet.com/api/adisyo-scrape/extension/download
2. **Zip'i çıkart**: `agrosjet-adisyo-bridge` klasörü oluşacak.
3. Chrome adres çubuğuna `chrome://extensions` yaz, **Geliştirici modu**'nu aç.
4. **Paketlenmemiş öğe yükle** → çıkardığın klasörü seç.

## ⚡ Kullanım

1. Chrome'un sağ üstünde **AgrosJet** ikonuna tıkla (gözükmüyorsa puzzle ikonundan pinle).
2. AgrosJet hesabınla **giriş yap** (admin kullanıcı adı + şifre).
3. **Restoran seç** dropdown'dan ilgili restoranı seç → **Kaydet**.
4. `app.adisyo.com` panelini aç — sipariş listesi yenilendikçe siparişler otomatik AgrosJet'e gider.
5. Yeni sipariş geldiğinde ikon üzerinde yeşil sayaç görünür.

**Token 30 gün geçerlidir** — bir kere giriş yap, ay boyunca tekrar uğraşma.

## 🔌 Çalışma Prensibi

- Backend URL **hardcoded**: `https://api.agrosjet.com`
- Eklenti `app.adisyo.com` panelinde `GetOrdersForList` XHR/fetch çağrılarını intercept eder.
- Her sipariş `adisyo_order_id` üzerinden idempotent upsert edilir — duplicate olmaz.
- Mevcut Adisyo webhook entegrasyonundan **tamamen bağımsız** çalışır.

## ⚠️ Sınırlamalar

- **Items (ürün listesi)** çekilmez — her sipariş tek satır "Adisyo Siparişi" + toplam tutar.
- Adisyo paneli (`app.adisyo.com`) sekmesi açıkken çalışır; kapatınca durur.
- `delivered` veya `cancelled` statüsündeki geçmiş siparişler tekrar oluşturulmaz.

## 🔗 İlgili Backend

- `POST /api/adisyo-scrape/orders` — Eklenti buraya POST'lar
- `GET /api/auth/admin/login` — Eklenti login için bunu kullanır (remember_me=true)
- `GET /api/restaurants/{company_id}` — Restoran dropdown
- `GET /api/adisyo-scrape/extension/download` — Bu zip dosyası
