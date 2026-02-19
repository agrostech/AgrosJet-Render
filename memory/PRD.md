# ShiftJet / AgrosJet - Restaurant Panel PRD

## Original Problem Statement
Kullanıcının amacı ShiftJet sistemi için "Restoran Paneli" oluşturmak ve geliştirmektir. İlk kapsam ürün yönetimi, UI iyileştirmeleri ve manuel sipariş girişini içermektedir.

## Production URL
**https://agrosjet.app**

## User Personas
- **Super Admin:** Tüm sistemi yöneten kullanıcı
- **Admin:** Restoran ve kurye yönetimi yapan kullanıcı
- **Restaurant User:** Restoran panelini kullanan işletme sahibi/çalışanı
- **Courier:** Sipariş teslimatı yapan kurye

## Core Features

### 1. SepetTakip Kurye Entegrasyonu (P0 - BEKLEMEDE)
**Durum:** Endpoint'ler hazır, Base URL tanımı bekleniyor

**Kimlik Bilgileri:**
- Kurye Firması Key: `agrosjet`
- API Key: `4dd744ca-001e-44be-b17c-0178b0d3f704`
- Restaurant ID: `934`
- Base URL: `https://agrosjet.app/api/sepettakip`

**Endpoint'ler:**
- `POST /api/sepettakip/check-credentials` - Restoran doğrulama
- `POST /api/sepettakip/create-package` - Sipariş oluşturma
- `POST /api/sepettakip/cancel-package` - Sipariş iptali
- `GET /api/sepettakip/logs` - Debug logları
- `GET /api/sepettakip/health` - Sağlık kontrolü

**Webhook (Biz → SepetTakip):**
- `PATCH https://test-api.sepettakip.com/courier-company/package`
- Status: assigned, picked_up, delivered, canceled

**Bekleyen:** SepetTakip'in Base URL tanımlaması

### 2. Restaurant Delivery Feature (COMPLETED)
- Restoranların siparişi kendi teslimatı olarak işaretlemesi
- Toggle fonksiyonu ile geri alma özelliği

### 3. Manual Order Modal (COMPLETED)
- 3 adımlı wizard: Ürün Seçimi → Müşteri Bilgisi → Ödeme Seçimi
- Manuel tutar girişi
- Zorunlu telefon numarası
- Yemek kartı tipi seçimi (Sodexo, Ticket, vb.)

### 4. Admin Order Management (COMPLETED)
- Client-side arama çubuğu
- Çoklu durum filtreleri (%30 şeffaflık)
- Sipariş limiti 200
- Teslim/İptal onay modalı (müşteri ismiyle)

### 5. Meal Card Support (COMPLETED)
- `meal_card` ve `online_meal_card` ödeme yöntemleri
- Kurye izinlerinde yemek kartı seçeneği
- Tüm panellerde spesifik yemek kartı tipi gösterimi

### 6. Restaurant Settings Page (COMPLETED - NEW)
- Otomatik yazdırma ayarları
- 58mm ve 80mm termal yazıcı desteği
- Test yazdırma özelliği
- Yazdırma sesi açma/kapama

### 7. Auto Print Feature (COMPLETED - NEW)
- Yeni sipariş geldiğinde otomatik fiş yazdırma
- Her siparişte manuel yazdır butonu
- localStorage'da ayar saklama

## Architecture

### Backend Structure
```
/app/backend/
├── routers/
│   ├── orders.py              # Sipariş CRUD, SepetTakip bildirimleri
│   ├── sepettakip.py          # SepetTakip entegrasyonu (YENİ)
│   ├── manual_orders.py       # Manuel sipariş
│   ├── restaurant_integrations.py  # Entegrasyon ayarları
│   └── couriers.py            # Kurye yönetimi, ödeme izinleri
└── services/
    └── adisyo_service.py
```

### Frontend Structure
```
/app/frontend/src/
├── pages/
│   └── restoran/
│       ├── RestaurantAyarlar.jsx    # YENİ - Ayarlar sayfası
│       ├── RestaurantEntegrasyonlar.jsx  # SepetTakip UI
│       └── RestaurantAnasayfa.jsx   # Otomatik yazdırma
├── utils/
│   └── printUtils.js               # YENİ - Yazdırma fonksiyonları
└── components/
```

### Database Schema
**orders collection:**
- `sepettakip_order_id`: String - SepetTakip sipariş ID
- `is_restaurant_delivery`: Boolean
- `payment_method_detail`: String (Sodexo, Ticket, vb.)

**restaurants collection:**
- `sepettakip_restaurant_id`: String - SepetTakip restoran ID
- `sepettakip_credentials`: Object - username, password, enabled

**sepettakip_logs collection:**
- Debug logları için

## What's Been Implemented (February 2026)

### Session - Latest
- [x] JSX syntax hatası düzeltildi
- [x] Filtre butonları şeffaflığı ayarlandı
- [x] Yemek kartı kurye dropdown sorunu çözüldü
- [x] Teslim/İptal onay modalı eklendi (müşteri ismiyle)
- [x] Restoran Ayarlar sekmesi eklendi
- [x] Otomatik yazdırma özelliği (58mm/80mm)
- [x] SepetTakip entegrasyonu (endpoint'ler hazır)
- [x] SepetTakip debug loglama sistemi
- [x] Kurye atama/durum değişikliğinde SepetTakip bildirimi

## Pending Issues

### P0 - Critical
- [ ] SepetTakip Base URL tanımı (ONLARIN TARAFI)

### P1 - High Priority
- [ ] Background task reliability (kurye uygulaması)
- [ ] Diğer webhook entegrasyonları (Migros, Getir)

### P2 - Medium Priority
- [ ] Mobile sidebar courier list bug
- [ ] Historical accounting data migration

## Future Tasks

### P1
- Native Courier App geliştirme
- Chat sistemi yeniden etkinleştirme
- Adisyo Webhooks (polling → webhook)
- Yemeksepeti entegrasyonu

### P2
- Dark mode
- Order history refactor

## 3rd Party Integrations
- **SepetTakip** (BEKLEMEDE - Base URL tanımı lazım)
- Adisyo (polling)
- Trendyol Yemek (polling)
- Getir Yemek (webhook - placeholder)
- Google Maps Platform

## Test Credentials
- **Super Admin:** username: `onurertas`, password: `125594`
- **Admin:** username: `testadmin`, password: `123456`
- **Courier:** phone: `05527370032`, password: `123456`
- **Restaurant:** username: `testrestaurant`, password: `password`

## SepetTakip Checklist (Beklemede)
1. [x] check-credentials endpoint
2. [x] create-package endpoint
3. [x] cancel-package endpoint
4. [x] Debug loglama
5. [ ] Base URL tanımı (SepetTakip tarafı)
6. [ ] Test siparişleri
7. [ ] assigned/picked_up/delivered testleri
8. [ ] Canlı ortam onayı

## Notes
- User preferred language: Turkish
- Production URL: https://agrosjet.app
- SepetTakip test API: https://test-api.sepettakip.com
