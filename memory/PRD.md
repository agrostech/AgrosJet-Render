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
- ✅ **Adisyo POS** - Sipariş çekme ve senkronizasyon
- ✅ **Trendyol Yemek** - Tam entegrasyon (Şubat 2025)
  - Sipariş çekme ve otomatik senkronizasyon (30 sn)
  - Sipariş kabul, hazır, yola çıktı, teslim durumları
  - Restoran açık/kapalı durumu yönetimi
  - Model 1 (restoran kuryesi) ve Model 2 (Trendyol kuryesi) desteği
- ✅ **Getir Yemek** - Tam entegrasyon (Şubat 2025)
  - Token bazlı auth (1 saat geçerli, otomatik yenileme)
  - Sipariş çekme ve otomatik senkronizasyon (30 sn)
  - verify, prepare, handover, deliver, cancel akışı
  - Restoran açık/kapalı durumu (15/30/45 dk kapatma)
  - Getir kuryesi ve restoran kuryesi desteği
- 🔄 Yemeksepeti - Placeholder
- 🔄 Migros Yemek - Placeholder

## API Endpoints

### Hazırlık Süreleri
- `PUT /api/restaurants/{id}/preparation-times` - Güncelle
- `GET /api/restaurants/{id}/preparation-times` - Getir

### Sipariş
- `GET /api/orders/restaurant/{restaurant_id}` - Restoran siparişleri
- `PUT /api/orders/{id}/status` - Durum güncelle
- `POST /api/orders/manual` - Manuel sipariş

### Trendyol Entegrasyonu
- `GET /api/restaurant-integrations/{id}/trendyol` - Ayarları getir
- `PUT /api/restaurant-integrations/{id}/trendyol` - Ayarları güncelle
- `POST /api/restaurant-integrations/{id}/trendyol/test` - Bağlantı testi
- `POST /api/restaurant-integrations/{id}/trendyol/sync` - Senkronize et
- `PUT /api/restaurant-integrations/{id}/trendyol/working-status` - Açık/kapalı
- `POST /api/restaurant-integrations/{id}/trendyol/orders/{orderId}/accept` - Kabul
- `POST /api/restaurant-integrations/{id}/trendyol/orders/{orderId}/ready` - Hazır
- `POST /api/restaurant-integrations/{id}/trendyol/orders/{orderId}/shipped` - Yola çıktı
- `POST /api/restaurant-integrations/{id}/trendyol/orders/{orderId}/delivered` - Teslim
- `POST /api/restaurant-integrations/{id}/trendyol/orders/{orderId}/cancel` - İptal

## Tech Stack
- Frontend: React, Tailwind CSS, Shadcn UI
- Backend: FastAPI, Python
- Database: MongoDB
- Maps: Google Maps Platform, Leaflet

## Known Issues
- Adisyo API entegrasyonu blocked (API 400 hatası)
- Background task reliability (kurye app)
- Mobile sidebar collapsible bug

## Backlog
- P0: Sipariş durumu değişikliklerinde Trendyol'a otomatik bildirim
- P1: Diğer platform entegrasyonları (Yemeksepeti, Getir, Migros)
- P1: Raporlar sayfası
- P1: Native kurye uygulaması
- P2: Chat sistemi
- P2: Dark mode
- P3: Motosikletim geliştirmeleri
