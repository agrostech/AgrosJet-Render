# AgrosJet · Adisyo Köprüsü (Chrome Eklentisi)

Bu eklenti, **Adisyo panelinizde** (app.adisyo.com) görünen siparişleri otomatik
olarak **AgrosJet'e** aktarır. Adisyo entegrasyon verilerini paylaşamayan
restoranlar için (örn. Terra Pizza) bir köprü görevi görür.

## ⚙️ Çalışma Prensibi

1. Adisyo panelinde tarayıcı her sipariş listesini yenilediğinde `GetOrdersForList`
   adında bir XHR/fetch çağrısı yapar.
2. Eklenti bu çağrının response'unu yakalar (sayfanın kendi yenileme ritmiyle).
3. Yakalanan siparişler **AgrosJet backend'ine** (`/api/adisyo-scrape/orders`)
   POST edilir. Backend mevcut webhook entegrasyonundan **bağımsızdır**, yani
   webhook ile gelen siparişlere zarar vermez.
4. Backend `adisyo_order_id` üzerinden idempotent upsert yapar; aynı sipariş
   tekrar gelirse yeni kayıt açılmaz, durumu güncellenir (kurye atanmışsa
   ezilmez).

## 📦 Kurulum

1. Bu klasörü bilgisayara indirin (`/app/chrome_extension/agrosjet-adisyo-bridge/`).
2. Chrome'da `chrome://extensions` aç.
3. Sağ üstten **Geliştirici modu**'nu açın.
4. **Paketlenmemiş öğe yükle** (Load unpacked) → bu klasörü seçin.
5. Eklenti listenizde "AgrosJet · Adisyo Köprüsü" görünmeli.

## 🔑 Ayarlar (eklenti popup'ı)

Eklenti ikonuna tıklayın ve şu üç değeri girin:

| Alan | Açıklama | Örnek |
|---|---|---|
| Backend URL | AgrosJet API kök adresi (preview veya prod) | `https://logo-deployment-test-1.preview.emergentagent.com` |
| Restaurant ID | AgrosJet'teki restoran UUID'si (Terra Pizza için) | `7b14b5ec-2ef3-4f69-9197-53b09264589e` |
| Bearer Token | Admin veya restoran kullanıcısının JWT'si | `eyJhbGciOi...` |

> **Token nasıl alınır?** AgrosJet admin paneline giriş yapın → tarayıcının
> DevTools → Application → Local Storage → `user` anahtarındaki `token` değerini
> kopyalayın. Beni Hatırla işaretliyse 30 gün geçerli.

**Kaydet** → **Bağlantıyı Test Et** ile health check yapın. "✓ Bağlantı OK"
mesajı görüyorsanız hazırsınız.

## 🟢 Kullanım

1. Adisyo paneline normal şekilde giriş yapın (https://app.adisyo.com).
2. Sipariş listesini açın — eklenti hiçbir şey yapmıyormuş gibi görünür ama arka
   planda her listing yenilemesinde siparişler AgrosJet'e gider.
3. Eklenti ikonunda 2-3 saniye yeşil bir sayaç (yeni eklenenler) görürsünüz.
4. AgrosJet panelinde Sipariş Yönetimi sayfasında `Adisyo Siparişi` notu ile
   yeni siparişler belirir.

## 🧪 Test Etmek İçin

```bash
# 1) Health check (popup üzerinden test edebilirsin)

# 2) Manuel POST testi (curl)
curl -X POST "$BACKEND_URL/api/adisyo-scrape/orders" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "restaurant_id": "<UUID>",
    "orders": [{
      "id": 411395562,
      "orderNumber": 308,
      "status": 2,
      "totalAmount": 390.00,
      "paymentType": 29,
      "paymentTypeName": "YS Online",
      "externalAppId": 21,
      "insertDate": "2026-05-10T22:20:03.157",
      "restaurantCustomer": {
        "name": "Yusuf",
        "phone": "5054304865",
        "address": "Konak Burdur",
        "note": "ön kapı",
        "town": "Burdur"
      },
      "paramObject": { "coordinate": "37,71871|30,28532" }
    }]
  }'
```

## ⚠️ Sınırlamalar

- **Items (ürün listesi)** çekilmez — her sipariş tek satır "Adisyo Siparişi"
  + toplam tutar olarak görünür. Kullanıcı talebine göre minimal tutuldu.
- **Sayfa yenilenme ritmiyle çalışır** — Adisyo panelinde sipariş listesi
  açık olduğu sürece aktif. Sekme kapatılırsa siparişler çekilmez.
- **Status `delivered` veya `cancelled`** geçmiş siparişler tekrar oluşturulmaz.

## 🔗 İlgili Backend Dosyaları

- `/app/backend/routers/adisyo_scrape.py` — endpoint + payload normalizer
- Endpoint: `POST /api/adisyo-scrape/orders`
- Health: `GET /api/adisyo-scrape/health`
- Restoran info: `GET /api/adisyo-scrape/restaurant/{id}/info`

Mevcut Adisyo webhook entegrasyonu (`adisyo_webhook.py`) **etkilenmez**.
