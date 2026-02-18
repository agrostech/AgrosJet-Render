# ShiftJet - Kurye ve Restoran Yönetim Sistemi

## Problem Statement
ShiftJet, restoranlar ve kurye şirketleri için kapsamlı bir sipariş ve teslimat yönetim sistemidir.

## Completed Features

### Core Features
- Admin Panel (Sipariş yönetimi, kurye atama, restoran yönetimi)
- Restoran Panel (Sipariş görüntüleme, durum güncelleme, manuel sipariş)
- Kurye Uygulaması (Sipariş kabul, konum takibi, teslimat)
- Google Places entegrasyonu (adres autocomplete)
- Web scraping (tgoyemek.com ürün import)

### Restaurant Panel
- Hazırlık süresi seçimi
- Gerçek zamanlı güncelleme (2 saniyelik polling)
- Kurye telefonu ve TVS gösterimi
- Sipariş detay modalı ve harita takibi
- Restoran muhasebe sayfası
- Restaurant permissions sistemi

### Ürün Bazlı Hazırlık Süreleri
- Admin panelde "Hazırlık" butonu
- Standart hazırlık süresi ayarlama
- Ürün bazlı ekstra süreler
- Hesaplama: Standart + max(Ürün Süreleri)

### Platform Entegrasyonları
- ✅ **Adisyo POS** - Sipariş çekme ve senkronizasyon (tek mağaza)
- ✅ **Trendyol Yemek** - Tam entegrasyon (Şubat 2025)
  - Sipariş çekme ve otomatik senkronizasyon (30 sn)
  - Sipariş kabul, hazır, yola çıktı, teslim durumları
  - Restoran açık/kapalı durumu yönetimi
  - Model 1 (restoran kuryesi) ve Model 2 (Trendyol kuryesi) desteği
  - **Çoklu mağaza desteği** (Şubat 2025)
- ✅ **Getir Yemek** - Tam entegrasyon (Şubat 2025)
  - Token bazlı auth (1 saat geçerli, otomatik yenileme)
  - Sipariş çekme ve otomatik senkronizasyon (30 sn)
  - verify, prepare, handover, deliver, cancel akışı
  - Restoran açık/kapalı durumu (15/30/45 dk kapatma)
  - Getir kuryesi ve restoran kuryesi desteği
  - **Çoklu mağaza desteği** (Şubat 2025)
- ✅ **Yemeksepeti** - Tam entegrasyon (Şubat 2025)
  - OAuth 2.0 token yönetimi (2 saat geçerli)
  - Webhook tabanlı sipariş alma (anlık bildirim)
  - READY_FOR_PICKUP, DISPATCHED, CANCELLED durumları
  - Platform ve Vendor teslimat desteği
  - **Çoklu mağaza desteği** (Şubat 2025)
- 🔄 Migros Yemek - Placeholder (Yakında)

### Çoklu Mağaza Entegrasyonu (Şubat 2025)
- ✅ Her platform için birden fazla mağaza tanımlama
- ✅ Mağaza ekleme/düzenleme/silme modal'ları
- ✅ Platform-specific credential alanları
- ✅ Test ve senkronizasyon butonları (mağaza bazlı)
- ✅ Mağaza açık/kapalı toggle'ları (Anasayfada, bağlı mağazalar için)
- ✅ API: GET/POST/PUT/DELETE /api/integration-stores/{restaurant_id}

## API Endpoints

### Çoklu Mağaza Yönetimi (Yeni)
- `GET /api/integration-stores/{restaurant_id}` - Tüm mağazaları listele
- `GET /api/integration-stores/{restaurant_id}/summary` - Anasayfa için özet
- `POST /api/integration-stores/{restaurant_id}` - Yeni mağaza ekle
- `PUT /api/integration-stores/{restaurant_id}/{store_id}` - Mağaza güncelle
- `DELETE /api/integration-stores/{restaurant_id}/{store_id}` - Mağaza sil
- `POST /api/integration-stores/{restaurant_id}/{store_id}/test` - Bağlantı test
- `PUT /api/integration-stores/{restaurant_id}/{store_id}/status` - Açık/Kapalı
- `POST /api/integration-stores/{restaurant_id}/{store_id}/sync` - Senkronize

### Hazırlık Süreleri
- `PUT /api/restaurants/{id}/preparation-times` - Güncelle
- `GET /api/restaurants/{id}/preparation-times` - Getir

### Sipariş
- `GET /api/orders/restaurant/{restaurant_id}` - Restoran siparişleri
- `PUT /api/orders/{id}/status` - Durum güncelle
- `POST /api/orders/manual` - Manuel sipariş

### Platform Entegrasyonları (Eski format - backward compatible)
- `GET /api/restaurant-integrations/{id}/trendyol` - Ayarları getir
- `PUT /api/restaurant-integrations/{id}/trendyol` - Ayarları güncelle
- `POST /api/restaurant-integrations/{id}/trendyol/test` - Bağlantı testi
- `POST /api/restaurant-integrations/{id}/trendyol/sync` - Senkronize et
- `PUT /api/restaurant-integrations/{id}/trendyol/working-status` - Açık/kapalı

## DB Schema

### restaurants.integration_stores (Yeni)
```json
{
  "integration_stores": [
    {
      "id": "uuid",
      "platform": "trendyol",
      "name": "Kadıköy Şubesi",
      "enabled": true,
      "is_open": true,
      "connected": false,
      "credentials": {
        "api_key": "...",
        "api_secret": "...",
        "supplier_id": "...",
        "store_id": "..."
      },
      "last_sync": "...",
      "last_test": "...",
      "created_at": "...",
      "updated_at": "..."
    }
  ]
}
```

## Tech Stack
- Frontend: React, Tailwind CSS, Shadcn UI
- Backend: FastAPI, Python
- Database: MongoDB
- Maps: Google Maps Platform, Leaflet

## Known Issues
- Adisyo API entegrasyonu blocked (API 400 hatası)
- Background task reliability (kurye app)
- Mobile sidebar collapsible bug
- Historical accounting data inconsistency (entity_type migration needed)

## Backlog
- P1: Raporlar sayfası
- P1: Native kurye uygulaması
- P1: Adisyo webhook entegrasyonu
- P2: Chat sistemi
- P2: Dark mode
- P2: Historical data migration script
- P3: Motosikletim geliştirmeleri
- P3: Thermal printer entegrasyonu
