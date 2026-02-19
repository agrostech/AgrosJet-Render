# ShiftJet - Restaurant Panel PRD

## Original Problem Statement
Kullanıcının amacı ShiftJet sistemi için "Restoran Paneli" oluşturmak ve geliştirmektir. İlk kapsam ürün yönetimi, UI iyileştirmeleri ve manuel sipariş girişini içermektedir.

## User Persona
- **Super Admin:** Tüm sistemi yöneten kullanıcı
- **Admin:** Restoran ve kurye yönetimi yapan kullanıcı
- **Restaurant User:** Restoran panelini kullanan işletme sahibi/çalışanı
- **Courier:** Sipariş teslimatı yapan kurye

## Core Requirements

### 1. Webhook Integrations (P1 - BLOCKED)
- Getir, Migros, SepetTakip için webhook tabanlı entegrasyonlar
- Durum: API anahtarları bekleniyor

### 2. Restaurant-Specific Collection Settings (COMPLETED)
- Her restoran için nakit, kredi kartı ve yemek kartı ödemelerinin kim tarafından tahsil edileceğini belirleme

### 3. Restaurant Delivery Feature (COMPLETED)
- Restoranların siparişi kendi teslimatı olarak işaretlemesi
- Toggle fonksiyonu ile geri alma özelliği

### 4. Manual Order Modal (COMPLETED)
- 3 adımlı wizard: Ürün Seçimi → Müşteri Bilgisi → Ödeme Seçimi
- Manuel tutar girişi
- Zorunlu telefon numarası
- Yemek kartı tipi seçimi (Sodexo, Ticket, vb.)

### 5. Admin Order Management Enhancements (COMPLETED)
- Client-side arama çubuğu (ad, adres, telefon, restoran)
- Çoklu durum filtreleri
- Sipariş limiti 50'den 200'e artırıldı
- Durum renkleri düzeltildi

### 6. Meal Card Specificity (COMPLETED)
- Tüm panellerde (Admin, Restoran, Kurye) spesifik yemek kartı tipi gösterimi

### 7. Scheduled Order Logic (COMPLETED)
- Hazırlık süresi teslimat zamanından 30 dakika önce başlıyor
- Geri sayım hem Admin hem Restoran panelinde görünür

## Architecture

### Backend Structure
```
/app/backend/
├── routers/
│   ├── orders.py              # Sipariş CRUD, restaurant delivery, multi-status filter
│   ├── manual_orders.py       # Manuel sipariş oluşturma
│   ├── integration_stores.py  # Platform entegrasyonları
│   └── webhooks/              # Webhook endpoints
└── services/
    └── adisyo_service.py      # Adisyo entegrasyonu
```

### Frontend Structure
```
/app/frontend/src/
├── components/
│   ├── admin/
│   │   └── NewOrderModal.jsx  # 3-step wizard
│   └── PaymentBadge.jsx       # Ödeme tipi gösterimi
├── pages/
│   ├── admin/
│   │   └── SiparisYonetimiPage.jsx  # Arama, filtre, sipariş yönetimi
│   ├── restoran/
│   │   └── RestaurantAnasayfa.jsx   # Restaurant delivery toggle
│   └── kurye/
└── utils/
    └── getPaymentMethod.js    # Payment method helper
```

### Database Schema (MongoDB)
**orders collection:**
- `is_restaurant_delivery`: Boolean - Restoranın kendi teslimatı mı?
- `payment_method_detail`: String - Spesifik ödeme tipi (Sodexo, Ticket, vb.)

## What's Been Implemented (December 2025)

### Session 1-5
- Restaurant Delivery feature (tam implementasyon + toggle)
- Manual Order Modal (3-step wizard refactor)
- Admin sipariş sayfası iyileştirmeleri (arama, filtre)
- Yemek kartı spesifikliği tüm panellerde
- Scheduled order logic düzeltmesi
- JSX syntax hataları düzeltildi

## Pending Issues

### P0 - Critical
- [ ] Admin arama/filtre doğrulaması (USER VERIFICATION PENDING)

### P1 - High Priority
- [ ] Background task reliability (kurye uygulaması)
- [ ] Mobile sidebar courier list collapsible bug
- [ ] Webhook entegrasyonları (BLOCKED - API keys)

### P2 - Medium Priority
- [ ] Historical accounting data migration
- [ ] Mobile file upload issue

## Future Tasks (Backlog)

### P1
- Native Courier App geliştirme
- Chat sistemi yeniden etkinleştirme
- Adisyo Webhooks (polling → webhook)
- Yemeksepeti entegrasyonu

### P2
- Thermal printer integration
- Order history page refactor
- Dark mode

### P3
- Motosikletim feature enhancements

## 3rd Party Integrations
- Adisyo (polling)
- Trendyol Yemek (polling)
- Getir Yemek (webhook - hardcoded key)
- Yemeksepeti (pending credentials)
- Migros Yemek (pending encryption keys)
- SepetTakip (pending API keys)
- Google Maps Platform
- react-leaflet, leaflet

## Test Credentials
- **Super Admin:** username: `onurertas`, password: `125594`
- **Admin:** username: `testadmin`, password: `123456`
- **Courier:** phone: `05527370032`, password: `123456`
- **Restaurant:** username: `testrestaurant`, password: `password`

## Notes
- User preferred language: Turkish
- User handles testing ("Testleri sen yapma ben yaparım")
- Client-side filtering implemented with useMemo for performance
