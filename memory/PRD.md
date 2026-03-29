# AgrosJet - Product Requirements Document

## Original Problem Statement
Multi-panel delivery management system (Admin, Restaurant, Courier) with integrations for Migros, Getir, Trendyol, Adisyo, Yemeksepeti. The system handles order routing, courier management, invoicing, and real-time delivery tracking.

## Core Architecture
- **Frontend**: React (CRA) with Tailwind CSS + Shadcn/UI
- **Backend**: FastAPI + MongoDB
- **Storage**: Cloudflare R2 (logos, invoices, DB backups)
- **Push Notifications**: Expo / Firebase
- **Integrations**: Migros (PROD), Getir, Trendyol, Adisyo

## What's Been Implemented

### Courier Login company_id Fix (2026-03-29)
- Backend `get_courier_by_id` resolves company_id from company_couriers junction table
- Login endpoint returns top-level company_id in response
- CourierDashboard.jsx `/kurye/:id` path has fallback to /companies endpoint
- CourierLoginPage.jsx uses data.company_id || data.companies?.[0]?.id
- add_courier_to_company now also sets company_id on courier document

### Logo Serve Fix (2026-03-29)
- Replaced presigned URL RedirectResponse with direct byte streaming via Response()
- R2 file downloaded and served with proper content-type headers
- Eliminates presigned URL expiration causing logos to disappear
- Cache-Control: public, max-age=86400 set (may be overridden by infra)

### Permission System (2026-03-28)
- Sub-tab level permissions for admin panel
- 21 permission keys total: 9 main tabs + 10 muhasebe sub-tabs + 2 siparis sub-tabs
- Main tab toggle auto-enables/disables all sub-tabs
- Superadmin/Systemadmin always gets all permissions = True

### Courier App - Smart Route (PDP) (2026-03-27)
- Merged Assigned/On-the-way into unified "Siparişlerim" with List/Route toggle
- PDP algorithm with nearest-neighbor + group constraints
- Route cards redesigned to match ActiveOrderCard styling
- "Tümünü Yola Çıkar" button (cyan), total earnings in route header
- "Gördüm" check: Rota tab blocked if assigned (unseen) orders exist

### Database & Storage
- Base64 fallback eliminated, strict R2 enforcement
- Automated MongoDB backup (15-min/12-hour) with size anomaly detection
- Migros API on PROD

## Pending Issues
1. P1: "Neden AgrosJet?" text on Register/KVKK pages (carried over x3)
2. P2: Webhook setup ping fails for agrosjet.net

## Upcoming Tasks
- P1: Migros "Reject" Functionality
- P1: VatanSMS Integration
- P2: Native Courier App improvements
- P2: Migros 30-Second Rule

## Future/Backlog
- Yemeksepeti Chrome extension
- "Stop Count" capacity logic
- Technical security requirements
- restaurant_fee calculation
- Scheduled job refactoring
- Caller ID integration
- CourierSiparisPage.jsx refactoring (~2000 lines)

## Permission Keys Reference
### Main tabs:
vardiya, muhasebe, zimmet, kuryeler, market, akademi, sistem, raporlar, basvurular

### Muhasebe sub-tabs:
muhasebe_kuryeler, muhasebe_isletmeler, muhasebe_cariler, muhasebe_kurye_mutabakat, muhasebe_restoran_mutabakat, muhasebe_yonetici_mutabakat, muhasebe_haftalik_hakedis, muhasebe_kurye_faturalari, muhasebe_isletme_faturalari, muhasebe_hareketler

### Sipariş sub-tabs:
siparis_gecmis, siparis_iptal

## Key Files
- `/app/backend/routers/auth.py` - Login + permission system
- `/app/backend/routers/couriers.py` - Courier endpoints (company_id fix)
- `/app/backend/routers/companies.py` - Logo serve (direct stream fix)
- `/app/backend/services/courier_service.py` - add_courier_to_company (company_id write)
- `/app/frontend/src/pages/CourierDashboard.jsx` - company_id fallback
- `/app/frontend/src/pages/CourierLoginPage.jsx` - company_id priority
- `/app/frontend/src/pages/admin/YoneticilerPage.jsx` - Admin permission UI
- `/app/frontend/src/pages/courier/CourierSiparisPage.jsx` - Courier route view

## Credentials
- System Admin: `onurertas` / `Delivery32..`
- Company Admin: `admin` / `123456`
- Courier: `05550003201` / `123456`
