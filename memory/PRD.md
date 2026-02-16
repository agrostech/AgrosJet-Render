# ShiftJet PRD - Product Requirements Document

## Original Problem Statement
ShiftJet, an Adisyo-integrated order management system for courier and restaurant operations.

## System Overview
A comprehensive delivery management platform with three main panels:
1. **Admin Panel** - Full system management
2. **Courier Panel** - Courier operations and tracking
3. **Restaurant Panel** - Restaurant-specific order management

---

## What's Been Implemented

### February 2026 Updates

#### Google Places Autocomplete - Adres Geocoding (P0 - COMPLETED)
- **API Key Entegrasyonu**: `AIzaSyDGDqxbHb9Oh6jtDXohRlFisr8JqkR7Vz4`
- **Özellikler**:
  - Adres yazılırken Google Places önerileri
  - Öneri seçildiğinde koordinatlar (lat/lng) otomatik alınıyor
  - "Konum alındı" yeşil göstergesi
  - "Haritada Gör" linki (Google Maps'te açılıyor)
- **Teknik Detaylar**:
  - Google Maps script `index.html`'e eklendi
  - Native HTML input kullanıldı (shadcn Input ref sorunu çözüldü)
  - Input ID: `delivery-address-autocomplete`
  - CSS z-index: 99999 (modal üstünde görünmesi için)
- **Test Durumu**: %100 başarılı (iteration_29.json)

#### Manuel Telefon Siparişi Özelliği (P0 - COMPLETED)
- **Yeni Sipariş Butonu**: Restoran Anasayfasında sağ üstte görünür
- **NewOrderModal Component**: Ayrı dosyada oluşturuldu (`/app/frontend/src/components/restoran/NewOrderModal.jsx`)
- **Özellikler**:
  - Müşteri Adı, Telefon, Teslimat Adresi girişi
  - Ürün seçimi (kategorilere göre gruplanmış)
  - Sepet yönetimi (ekle, çıkar, miktar artır/azalt)
  - Ödeme yöntemi seçimi (Nakit/Kart/Online)
  - Sipariş notu
  - **Programlı Teslimat**: Checkbox ile aktifleşir, tarih ve saat seçimi
  - 30 dakikalık hazırlık tamponu otomatik uygulanır
  - **Google Places Autocomplete** ile adres ve koordinat yakalama
- **Backend Endpoint**: `POST /api/orders/manual`
- **Sipariş Durumları**:
  - Normal sipariş: `preparing` durumunda başlar
  - Programlı sipariş: `scheduled` durumunda başlar
- **UI Güncellemeleri**:
  - "Programlı" sekmesi eklendi (5 sekme: Bekleyen, Programlı, Yolda, Teslim, İptal)
  - Telefon siparişleri "Tel" badge'i ile işaretlenir
  - Programlı siparişlerde teslimat zamanı görüntülenir

### December 2025 Updates

#### Web Scraping - Ürünler Modülü (COMPLETED)
- **TGO Yemek'ten Menü İçe Aktarma**:
  - Restaurant panel > Ürünler sayfası
  - TGO Yemek URL'si girerek otomatik menü çekme
  - BeautifulSoup ile web scraping (74 ürün, 13 kategori test edildi)
- **Tam CRUD İşlemleri**:
  - **Kategoriler:** Ekle, Düzenle, Sil (içindeki ürünlerle birlikte)
  - **Ürünler:** Ekle, Düzenle, Sil

#### Courier Blocking Feature (COMPLETED)
- Backend API endpoints for blocking/unblocking couriers from restaurants
- Frontend modal in Admin Panel > Restoranlar > "Engellenenler" button
- Blocked couriers are filtered out from order assignment dropdowns

#### Courier Payment Methods Feature (COMPLETED)
- Admin Panel > Kuryeler > "Ödeme" button
- Each courier can have specific payment methods enabled/disabled

#### Restaurant Panel (COMPLETED)
- **Login System**: Added "Restoran" tab to login page
- **Restaurant User Management**: Admin Panel > Restoranlar > "Kullanıcılar" button
- **Dashboard Features**: Stats cards, Order tabs, Status updates

---

## Technical Architecture

### Backend (FastAPI)
- `/app/backend/routers/orders.py` - Order management + manual order creation endpoint
- `/app/backend/routers/products.py` - Product scraping and management
- `/app/backend/routers/restaurant_users.py` - Restaurant user auth and CRUD

### Frontend (React)
- `/app/frontend/src/components/restoran/NewOrderModal.jsx` - **NEW** Manual order modal
- `/app/frontend/src/pages/restoran/RestaurantAnasayfa.jsx` - Dashboard with "Yeni Sipariş" button
- `/app/frontend/src/pages/restoran/RestaurantUrunler.jsx` - Product management

### Key API Endpoints
- `POST /api/orders/manual` - **NEW** Create manual order (phone orders)
- `POST /api/restaurant-users/login` - Restaurant user login
- `GET /api/products/restaurant/{id}` - Get products for modal
- `PUT /api/orders/{id}/status` - Update order status (now supports scheduled)

---

## Prioritized Backlog

### P0 (Critical) - COMPLETED
- [x] Courier blocking feature
- [x] Restaurant panel MVP
- [x] Web scraping - Ürünler modülü
- [x] Manuel telefon siparişi oluşturma
- [x] Google Places Autocomplete - Adres geocoding

### P1 (High)
- [ ] Adisyo Webhook implementation
- [ ] Adisyo payment method mapping bug (BLOCKED - API access issue)
- [ ] Background task reliability (notifications/location)
- [ ] Mobile sidebar courier list bug
- [ ] Restaurant panel - Muhasebe module
- [ ] Restaurant panel - Raporlar module

### P2 (Medium)
- [ ] Restaurant panel - Entegrasyonlar module
- [ ] Refactor order history pages
- [ ] Dark mode implementation

### P3 (Low)
- [ ] Motosikletim feature enhancements
- [ ] Chat system re-enablement

---

## Test Credentials
- **Restaurant User**: testrestaurant / password123
- **Restaurant ID**: rest_c9c5cb06
- **Super Admin**: onurertas / 123456
- **Courier**: 05527370032 / 123456

---

## Database Collections
- `orders` - Now supports source="manual", status="scheduled", is_scheduled, scheduled_time fields
- `products` - Product items with category_id, name, description, price
- `product_categories` - Product categories for each restaurant
- `restaurant_users` - Restaurant panel user accounts

---

## Recent Test Reports
- `/app/test_reports/iteration_29.json` - Google Places Autocomplete testi (100% passed)
- `/app/test_reports/iteration_28.json` - Manuel Sipariş testi (100% passed)
