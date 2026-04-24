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
- Courier Ihlaller (violations) page minimal redesign
- AgrosAI Rota tab name simplified
- Courier Odeme Raporu: Sirket/Restoran tabs (collector param), verildi/verilmedi status, business-day default date
- Online/Yemek karti collection status hidden (not applicable for restaurant collection)
- Restaurant delivery fee fix: uses pricing settings instead of courier_fee
- KDV fix: uses restaurant kdv_rate instead of hardcoded 10%
- POS commission: only shown when card collection is by company (not restaurant)
- Admin permissions auto-refresh on page load (GET /api/admins/{id}/permissions)
- Admin toggle-status auth fix (require_admin instead of require_super_or_system)
- PDF company logo fix (uses companyLogo prop directly, no auth-required fetch)
- Auto-processing schedules: dynamic closing_time + 1 hour (fatura, mutabakat, hakedis)
- VatanSMS integration: sms_service.py + system settings UI + test SMS
- **Courier Document Upload & Registration Revamp (P0)** - COMPLETED 2026-04-08:
  - Courier login allows login without company assignment (for onboarding flow)
  - TC Kimlik No field added to courier registration form
  - Scroll-enforced contract view with dynamic company variables
  - E-signature canvas (react-signature-canvas) for contract signing
  - PDF generation (reportlab) with embedded e-signature
  - Contract PDF uploaded to Cloudflare R2
  - Routing guard: forces couriers to /evraklar if contract/fesih not accepted
  - Admin panel: contract status (Onayli/Bekliyor) + PDF view button in courier detail modal
  - Document upload step (Step 3) after contract + fesih acceptance
  - Contract settings management via Admin API (/api/contracts/settings/{company_id})
  - **Fesih Şartları (Termination Conditions)** step added as Step 2:
    - 5 descriptive articles with dynamic company variables
    - Explicit checkbox confirmation required
    - Variables: fesih_tazminat, fesih_bildirim_suresi, fesih_bildirim_telefon, yetkili_mahkeme
    - POST /api/contracts/fesih-accept/{courier_id} endpoint
  - **Admin Document Management** - COMPLETED 2026-04-08:
    - Courier "Süreci tamamladınız" success screen when all 7 docs uploaded + contract + fesih accepted
    - Admin Panel Evraklar tab: Contract/Fesih status display with Sıfırla (Reset) buttons
    - Admin Panel: "Tek PDF" merged download button (combines images+PDFs into single PDF using reportlab+pypdf)
    - Admin Panel: "ZIP" download button for all docs
    - Admin Panel: "Evrakları Sıfırla" button (deletes uploaded docs except contract)
    - Backend endpoints: POST /api/contracts/reset-contract/{id}, reset-fesih/{id}, reset-documents/{id}
    - Backend endpoint: GET /api/documents/courier/{id}/download-merged-pdf
  - **Document Process Control System** - COMPLETED 2026-04-09:
    - Admin toggle (document_process_completed) per courier in CourierDetailModal
    - Restricted mode: When toggle OFF, courier sees only Evraklar + Logout, no bottom bar, no status dropdown
    - Full mode: When toggle ON, courier has full app access
    - Default: false when courier added to company
    - Removed old startup migration that auto-approved existing couriers
    - Backend endpoint: PUT /api/couriers/{id}/document-process

## Completed - Login Page Split (2026-04-09)
- Split unified LoginPage into LoginSelectorPage (/login), AdminLoginPage (/admin-login), RestaurantLoginPage (/restoran-login)
- Old LoginPage.jsx deleted, App.js routing updated
- All logout flows redirect to /login (selector page)
- Courier login (/courier-login) unchanged

## Completed - Adisyo Webhook Delivered-Without-Courier Fix (2026-04-24)
- **Bug**: Adisyo `order.updated` webhook with `statusId=5` (Teslim Edildi) could set order to "delivered" even when no courier was assigned (`courier_id` is null). This happened when order was in "preparing" status.
- **Fix**: Added `courier_id` check in both `adisyo_webhook.py` (process_order_event) and `adisyo_service.py` (sync function). If `delivered` comes from Adisyo but no courier is assigned, the update is blocked and logged. `cancelled` status is still allowed without courier assignment.
- **Fix 2**: Webhook handler and sync function now write `status_history` entries with `actor_type: "adisyo_webhook"` / `"adisyo_sync"` and `actor_name: "Adisyo"`. Previously no history was recorded, making it impossible to distinguish Adisyo-triggered changes from courier actions.
- **Files changed**: `/app/backend/routers/adisyo_webhook.py`, `/app/backend/services/adisyo_service.py`

## Completed - Paket Havuzu (Order Pool) System (2026-04-24)
- **New Feature**: Couriers can see unassigned orders in a pool and claim them.
- **Backend**: New router `/api/pool/` with settings CRUD, pool orders listing (filtered by status, prep time threshold, courier distance), and claim endpoint (assigns + auto-confirms to `confirmed`).
- **System Settings**: "Paket Havuzu" collapsible card added below auto-dispatch. Settings: enabled toggle, show_pending/show_ready checkboxes, pending_threshold_minutes, max_courier_distance.
- **Courier Permissions**: `pool_access` toggle added to permissions modal in KuryelerPage.
- **Courier Panel**: 2-tab (Liste/Rota) → 3-tab (Havuz/Siparişlerim/Rota). Pool tab shows available orders with "Üzerime Al" button, package limit enforcement, distance display.
- **Files**: `/app/backend/routers/pool.py` (new), `server.py`, `SistemPage.jsx`, `KuryelerPage.jsx`, `CourierSiparisPage.jsx`, `couriers.py`

## Pending Issues (Prioritized)
### P2
- "Neden AgrosJet?" static text update on RegisterPage + CourierKVKKPage
- Webhook setup ping failure for agrosjet.net (HTML response handling)

## Upcoming/Future
- Nilvera e-Fatura entegrasyonu (analiz tamamlandi, tevkifat destekli)
- Native Courier App improvements (Map / Proximity Engine)
- Yemeksepeti Chrome extension
- "Stop Count" capacity logic
- Caller ID integration

## Key API Endpoints
- POST /api/auth/courier/login (returns contract_accepted, fesih_accepted, document_status)
- GET /api/companies/logo/{filename}
- GET /api/contracts/status/{courier_id} (returns accepted, fesih_accepted)
- GET /api/contracts/preview/{courier_id} (returns text, company_name, fesih data)
- POST /api/contracts/accept/{courier_id}
- POST /api/contracts/fesih-accept/{courier_id}
- GET /api/contracts/pdf/{courier_id}
- GET/POST /api/contracts/settings/{company_id}
- POST /api/contracts/reset-contract/{courier_id}
- POST /api/contracts/reset-fesih/{courier_id}
- POST /api/contracts/reset-documents/{courier_id}
- GET /api/documents/courier/{courier_id}/download-merged-pdf
- GET /api/restaurant-collections/courier-balances
- POST /api/restaurant-collections/collect
- PUT /api/restaurants/collection-settings/{restaurant_id}
- GET /api/reports/courier/payments (collector=company|restaurant)
- GET /api/reports/courier/business-day (company_id)
- GET /api/admins/{admin_id}/permissions
- POST /api/admins/{admin_id}/toggle-status
- GET/POST/PUT /api/system-settings/vatansms
- POST /api/system-settings/vatansms/test

## 3rd Party Integrations
- Trendyol, Migros, Getir, Yemeksepeti, Sepetapp, Adisyo (Order Integrations)
- Cloudflare R2 (Storage)
- Expo / Firebase (Push Notifications)
- VatanSMS (SMS - API ayarlari sistem panelinden girilir)
- Nilvera (e-Fatura - henuz entegre edilmedi, analiz tamamlandi)
