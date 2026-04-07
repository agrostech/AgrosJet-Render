# AgrosJet Delivery Management Platform - PRD

## Original Problem Statement
Multi-tenant delivery management platform for restaurants, couriers, and administrators. Supports order management, courier tracking, integration with platforms (Trendyol, Migros, Getir, Yemeksepeti, Adisyo), and real-time operations.

## Core Architecture
- **Backend**: FastAPI + MongoDB
- **Frontend**: React + Shadcn UI
- **Storage**: Cloudflare R2
- **Notifications**: Expo / Firebase Push
- **SMS**: VatanSMS API

## What's Been Implemented

### Completed Features
- Courier login company_id resolution via junction table
- R2 logo direct byte streaming (replaces presigned URLs)
- Migros webhook auto-approve routing fix
- Getir integration production URL + POS activation fix
- Admin permissions sub-tab visibility fix
- Courier Collection (Kurye Hesap Al) feature with business-day filtering
- Admin toggle for courier_collection_enabled per restaurant
- Courier orders page "Siparisleri Yenile" refresh button with 5s countdown rate limit
- Courier İhlaller (violations) page minimal redesign
- AgrosAI Rota tab name simplified
- Courier Ödeme Raporu: Şirket/Restoran tabs (collector param), verildi/verilmedi status, business-day default date
- Online/Yemek kartı collection status hidden (not applicable for restaurant collection)
- Restaurant delivery fee fix: uses pricing settings instead of courier_fee
- KDV fix: uses restaurant kdv_rate instead of hardcoded 10%
- POS commission: only shown when card collection is by company (not restaurant)
- Admin permissions auto-refresh on page load (GET /api/admins/{id}/permissions)
- Admin toggle-status auth fix (require_admin instead of require_super_or_system)
- PDF company logo fix (uses companyLogo prop directly, no auth-required fetch)
- Auto-processing schedules: dynamic closing_time + 1 hour (fatura, mütabakat, hakediş)
- VatanSMS integration: sms_service.py + system settings UI + test SMS

## Pending Issues (Prioritized)
### P1
- Tiered Pricing calculation: `get_courier_active_package_count` should only count `assigned` + `confirmed`

### P2
- "Neden AgrosJet?" static text update on RegisterPage + CourierKVKKPage
- Webhook setup ping failure for agrosjet.net (HTML response handling)

## Upcoming/Future
- Nilvera e-Fatura entegrasyonu (analiz tamamlandı, tevkifat destekli)
- Native Courier App improvements (Map / Proximity Engine)
- Yemeksepeti Chrome extension
- "Stop Count" capacity logic
- Caller ID integration

## Key API Endpoints
- POST /api/auth/courier/login
- GET /api/companies/logo/{filename}
- GET /api/restaurant-collections/courier-balances
- POST /api/restaurant-collections/collect
- PUT /api/restaurants/collection-settings/{restaurant_id}
- GET /api/reports/courier/payments (collector=company|restaurant)
- GET /api/reports/courier/business-day (company_id)
- GET /api/admins/{admin_id}/permissions
- POST /api/admins/{admin_id}/toggle-status
- GET/POST/PUT /api/system-settings/vatansms
- POST /api/system-settings/vatansms/test

## Test Credentials
- System Admin: onurertas / Delivery32..
- Company Admin: admin / 123456
- Courier: 05550003201 / 123456
- Restaurant: restoran1 / 123456

## 3rd Party Integrations
- Trendyol, Migros, Getir, Yemeksepeti, Sepetapp, Adisyo (Order Integrations)
- Cloudflare R2 (Storage)
- Expo / Firebase (Push Notifications)
- VatanSMS (SMS - API ayarları sistem panelinden girilir)
- Nilvera (e-Fatura - henüz entegre edilmedi, analiz tamamlandı)
