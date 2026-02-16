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
- **Placeholder Pages**: Muhasebe, Raporlar, Entegrasyonlar, Ürünler (to be developed)

---

## Technical Architecture

### Backend (FastAPI)
- `/app/backend/routers/restaurant_users.py` - Restaurant user auth and CRUD
- `/app/backend/routers/restaurants.py` - Restaurant management + courier blocking
- `/app/backend/routers/orders.py` - Order management + restaurant-specific endpoints
- `/app/backend/routers/couriers.py` - Courier management + payment methods

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

---

## Prioritized Backlog

### P0 (Critical)
- [x] Courier blocking feature
- [x] Restaurant panel MVP
- [ ] Adisyo Webhook implementation

### P1 (High)
- [ ] Adisyo payment method mapping bug
- [ ] Background task reliability (notifications/location)
- [ ] Mobile sidebar courier list bug
- [ ] Restaurant panel - Muhasebe module
- [ ] Restaurant panel - Raporlar module

### P2 (Medium)
- [ ] Restaurant panel - Entegrasyonlar module
- [ ] Restaurant panel - Ürünler module
- [ ] Refactor order history pages
- [ ] Dark mode implementation

### P3 (Low)
- [ ] Motosikletim feature enhancements
- [ ] Chat system re-enablement

---

## Test Credentials
- **Super Admin**: onurertas / 123456
- **Courier**: 05527370032 / 123456
- **Restaurant (Dipsoss Döner)**: dipsoss / 123456

---

## Database Collections
- `restaurant_users` - Restaurant panel user accounts
- `restaurants.blocked_couriers` - Array of blocked courier IDs
- `couriers.allowed_payment_methods` - Array of payment methods ["cash", "card", "online"]
