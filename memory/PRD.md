# AgrosJet Delivery Management Platform - PRD

## Original Problem Statement
Multi-tenant delivery management platform for restaurants, couriers, and administrators. Supports order management, courier tracking, integration with platforms (Trendyol, Migros, Getir, Yemeksepeti, Adisyo), and real-time operations.

## Core Architecture
- **Backend**: FastAPI + MongoDB
- **Frontend**: React + Shadcn UI
- **Storage**: Cloudflare R2
- **Notifications**: Expo / Firebase Push

## What's Been Implemented

### Completed Features
- Courier login company_id resolution via junction table (DONE)
- R2 logo direct byte streaming (replaces presigned URLs) (DONE)
- Migros webhook auto-approve routing fix (DONE)
- Getir integration production URL + POS activation fix (DONE)
- Admin permissions sub-tab visibility fix (DONE)
- Courier Collection (Kurye Hesap Al) feature with business-day filtering (DONE)
- Admin toggle for courier_collection_enabled per restaurant (DONE)
- Courier orders page "Siparisleri Yenile" refresh button with animation (DONE)
- Refresh button 5-second rate limit (DONE)

## Pending Issues (Prioritized)
### P1
- Tiered Pricing calculation: `get_courier_active_package_count` should only count `assigned` + `confirmed` (exclude `on_the_way`, `preparing`)
- VatanSMS Integration

### P2
- "Neden AgrosJet?" static text update on RegisterPage + CourierKVKKPage
- Webhook setup ping failure for agrosjet.net (HTML response handling)
- Native Courier App improvements (Internal Map / Proximity Engine)
- Yemeksepeti Chrome extension
- "Stop Count" capacity logic
- Caller ID integration

## Key API Endpoints
- POST /api/auth/courier/login
- GET /api/companies/logo/{filename}
- GET /api/restaurant-collections/courier-balances
- POST /api/restaurant-collections/collect
- PUT /api/restaurants/collection-settings/{restaurant_id}
- GET /api/orders/v2/list

## Test Credentials
- System Admin: onurertas / Delivery32..
- Company Admin: admin / 123456
- Courier: 05553331122 / 123456
- Restaurant: restoran1 / 123456
