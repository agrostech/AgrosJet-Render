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

### December 2025 Updates

#### Courier Blocking Feature (P0 - COMPLETED)
- Backend API endpoints for blocking/unblocking couriers from restaurants
- Frontend modal in Admin Panel > Restoranlar > "Engellenenler" button
- Blocked couriers are filtered out from order assignment dropdowns

#### Courier Payment Methods Feature (COMPLETED)
- Admin Panel > Kuryeler > "Ödeme" button
- Each courier can have specific payment methods enabled/disabled (cash, card, online)
- Couriers with disabled payment methods don't appear in assignment lists for those payment types

#### Restaurant Panel (NEW - COMPLETED)
- **Login System**: Added "Restoran" tab to login page
- **Restaurant User Management**: Admin Panel > Restoranlar > "Kullanıcılar" button
  - Create/delete restaurant users with username/password
  - Restaurant users can only see their restaurant's orders
- **Dashboard Features**:
  - Stats cards: Today's orders, Pending, On The Way, Delivered, Avg Prep Time, Avg Delivery Time
  - Order tabs: Bekleyen, Yolda, Teslim, İptal
  - Order status updates (only before courier assignment)
- **Placeholder Pages**: Muhasebe, Raporlar, Entegrasyonlar (to be developed)

#### Web Scraping - Ürünler Modülü (NEW - COMPLETED - Feb 2026)
- **TGO Yemek'ten Menü İçe Aktarma**:
  - Restaurant panel > Ürünler sayfası
  - TGO Yemek URL'si girerek otomatik menü çekme
  - BeautifulSoup ile web scraping (74 ürün, 13 kategori test edildi)
- **Tam CRUD İşlemleri**:
  - **Kategoriler:** Ekle, Düzenle, Sil (içindeki ürünlerle birlikte)
  - **Ürünler:** Ekle, Düzenle, Sil
  - Her satırda kalem (düzenle) ve çöp kutusu (sil) ikonları
  - Kategori yanında + butonu ile o kategoriye hızlı ürün ekleme
- **Backend**: `/app/backend/routers/products.py`
  - `POST /api/products/scrape` - URL'den menü çek
  - `POST /api/products/save` - Ürünleri kaydet
  - `GET /api/products/restaurant/{id}` - Kayıtlı ürünleri getir
  - `DELETE /api/products/restaurant/{id}` - Tüm ürünleri sil
  - `POST /api/products/categories` - Yeni kategori oluştur
  - `PUT /api/products/categories/{id}` - Kategori güncelle
  - `DELETE /api/products/categories/{id}` - Kategori sil
  - `POST /api/products/items` - Yeni ürün oluştur
  - `PUT /api/products/items/{id}` - Ürün güncelle
  - `DELETE /api/products/items/{id}` - Ürün sil
- **Frontend**: `/app/frontend/src/pages/restoran/RestaurantUrunler.jsx`
  - URL girişi + "Menü Çek" butonu
  - "Kategori Ekle" ve "Ürün Ekle" butonları
  - Düzenleme ve silme modalleri
  - Accordion ile kategorilere göre gruplandırılmış ürün listesi
- **Database Collections**: `products`, `product_categories`

---

## Technical Architecture

### Backend (FastAPI)
- `/app/backend/routers/restaurant_users.py` - Restaurant user auth and CRUD
- `/app/backend/routers/restaurants.py` - Restaurant management + courier blocking
- `/app/backend/routers/orders.py` - Order management + restaurant-specific endpoints
- `/app/backend/routers/couriers.py` - Courier management + payment methods
- `/app/backend/routers/products.py` - Product scraping and management (NEW)

### Frontend (React)
- `/app/frontend/src/pages/LoginPage.jsx` - 3-tab login (Kurye, Yönetici, Restoran)
- `/app/frontend/src/pages/restoran/` - Restaurant panel pages
- `/app/frontend/src/components/restoran/` - Restaurant-specific components
- `/app/frontend/src/pages/admin/RestoranlarPage.jsx` - User management modal

### Key API Endpoints
- `POST /api/restaurant-users/login` - Restaurant user login
- `GET /api/restaurant-users/restaurant/{id}` - List restaurant users
- `POST /api/restaurant-users` - Create restaurant user
- `GET /api/orders/restaurant/{id}` - Get orders for restaurant
- `PUT /api/orders/{id}/status` - Update order status (restaurant panel)
- `GET/PUT /api/couriers/{id}/payment-methods` - Manage courier payment methods
- `POST /api/products/scrape` - Scrape menu from TGO Yemek URL
- `POST /api/products/save` - Save scraped products to database
- `GET /api/products/restaurant/{id}` - Get saved products
- `DELETE /api/products/restaurant/{id}` - Delete all products

---

## Prioritized Backlog

### P0 (Critical)
- [x] Courier blocking feature
- [x] Restaurant panel MVP
- [x] Web scraping - Ürünler modülü
- [ ] Adisyo Webhook implementation

### P1 (High)
- [ ] Adisyo payment method mapping bug
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
- **Super Admin**: onurertas / 123456
- **Courier**: 05527370032 / 123456
- **Restaurant (Boston D&D)**: bostonddisparta / password

---

## Database Collections
- `restaurant_users` - Restaurant panel user accounts
- `restaurants.blocked_couriers` - Array of blocked courier IDs
- `couriers.allowed_payment_methods` - Array of payment methods ["cash", "card", "online"]
- `products` - Product items with category_id, name, description, price
- `product_categories` - Product categories for each restaurant
