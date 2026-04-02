# AgrosJet - Product Requirements Document

## Original Problem Statement
Multi-panel delivery management system (Admin, Restaurant, Courier) with integrations for Migros, Getir, Trendyol, Adisyo, Yemeksepeti. The system handles order routing, courier management, invoicing, and real-time delivery tracking.

## Core Architecture
- **Frontend**: React (CRA) with Tailwind CSS + Shadcn/UI
- **Backend**: FastAPI + MongoDB
- **Storage**: Cloudflare R2 (logos, invoices, DB backups)
- **Push Notifications**: Expo / Firebase
- **Integrations**: Migros (PROD), Getir, Trendyol, Adisyo

## Security - JWT Auth System (2026-03-29)
### Implementation
- JWT tokens generated on all 3 login endpoints (admin, courier, restaurant)
- Frontend axios interceptor sends `Authorization: Bearer <token>` on every request
- Token stored in localStorage alongside user session data

### Protection Levels
| Level | Dependency | Used For |
|-------|-----------|----------|
| `require_system_admin` | systemadmin only | System settings, DB viewer |
| `require_super_or_system` | superadmin + systemadmin | Admin CRUD, backup, company assignment |
| `require_admin` | admin + superadmin + systemadmin | All admin panel operations |
| `require_auth` | Any valid token | Shared endpoints (orders, couriers, restaurants) |

### Coverage
- **531 endpoints protected** (JWT required)
- **68 endpoints open** (webhooks with own API key auth)
- **~5 endpoints intentionally open** (login, logo serve, impersonate verify)

## What's Been Implemented

### JWT Auth Middleware (2026-03-29)
- Phase 1-4: Full JWT coverage across all routers

### System Admin Role Fix (2026-03-29)
- Fixed auth.py role override: systemadmin > superadmin > admin["role"]

### Courier Reports Fix (2026-03-29)
- Performansim, Ihlallerim tabs, UTC/Turkey timezone fix

### Permission System Fix (2026-04-01)
- Extended valid_keys: raporlar, basvurular, siparis_gecmis, siparis_iptal + muhasebe/raporlar sub-permissions
- 5sn polling removed -> Event-driven: PermissionCheckMiddleware + X-Permissions-Updated header + Axios interceptor

### R2 Logo Direct Streaming (2026-03-31)
- Presigned URL redirects replaced with direct byte streaming to fix disappearing logos

### Mobile Responsive Fixes
- CourierCards button overflow fix (2026-03-31)
- Vardiyalar tab mobile rewrite (2026-03-31)
- Muhasebe tabs mobile card views (2026-04-01) - See below

### Load Test System (2026-03-30)
- Built-in load tester in System Admin panel, dynamic port resolution for Railway

### Native App JWT Bypass (2026-03-29)
- courier_native.py for background location updates without JWT

### Polling Optimization (2026-03-29)
- 4 requests -> 1 combined /poll endpoint per courier (75% reduction)

### Admin Panel Fixes
- Kurye Liste/Matrix sync fix, Turkish character fixes, AgrosAI Rota branding
- PDF export using logo_light, Dummy orders for Test Firma

## Muhasebe Mobile UI Refactoring (2026-04-01)
### Files Modified
1. **GunlukMutabakatTab.jsx** - CRITICAL BUG FIX: Mobile card view had wrong variable/function references (filteredCouriers, savingCouriers.has(), handleShowOrders, wrong data field names). Completely rewritten with correct references (couriers, savingCourierId, fetchCourierOrders, order_data.cash_total etc.)
2. **RestoranMutabakatTab.jsx** - Mobile card view verified OK (correct data references)
3. **YoneticiMutabakatTab.jsx** - Mobile card view verified OK (correct data references)
4. **KesilenFaturalarTab.jsx** - Mobile card view verified OK (correct data references)
5. **HaftalikHakedisTab.jsx** - Uses HakedisTable component
6. **HakedisTable.jsx** (component) - NEW mobile card view added with checkbox, courier stats, amounts grid, footer totals

### Pattern Used
- Desktop: `hidden md:block` with full data tables
- Mobile: `md:hidden` with card-based layouts using grid columns
- Consistent styling: 10px text, colored backgrounds, rounded cards

## Muhasebe Bakiye Performans Optimizasyonu (2026-04-02)
### Sorun
Kuryeler, Restoranlar ve Cariler sekmelerinde bakiye geçmişi kartındaki toplam bakiye ve entity bakiyeleri geç yükleniyordu.
### Kök Neden
N+1 API sorunu: Her entity için ayrı `GET /transactions/{type}/{id}?limit=1` çağrısı yapılıyordu. 30 entity = 30 API çağrısı, her biri 3-4 DB query = ~120 DB query.
### Çözüm
- Yeni `GET /api/companies/{id}/entity-balances?type=courier|restaurant|vendor` endpoint'i eklendi
- Backend: `calculate_entity_balances_map()` fonksiyonu tek MongoDB aggregation ile TÜM entity bakiyelerini döndürür
- Frontend: `useAccountingTab.js` - `fetchBulkBalances()` fonksiyonu ile liste ve bakiyeler paralel çekilir
- İşlem sonrası tek entity güncelleme `fetchEntityBalance()` ile eski yöntemle devam eder (doğru davranış)
### Etki
- API çağrıları: N+1 → 2 (liste + bakiye) = %97 azalma
- DB sorguları: ~120 → ~2 = %98 azalma
### Dosyalar
- `services/accounting_service.py` — `calculate_entity_balances_map()` (YENİ)
- `routers/accounting.py` — `GET /entity-balances` endpoint'i (YENİ)
- `hooks/useAccountingTab.js` — `fetchBulkBalances()`, `fetchEntities()`, `fetchArchivedEntities()` güncellendi

## Pending Issues
- (P1) "Neden AgrosJet?" statik metin guncellemesi (Kurye kayit sayfalari) - 4x ertelendi
- (P2) Webhook setup agrosjet.net ping hatasi

## Upcoming Tasks
- (P1) Migros "Reject" Fonksiyonelliği
- (P1) VatanSMS Entegrasyonu
- (P2) Native Courier App - Harita/Proximity Engine
- (P2) Yemeksepeti Chrome Extension
- (P2) "Stop Count" kapasite mantigi
- (P2) Caller ID entegrasyonu

## Key Files
- `/app/backend/utils/jwt_utils.py` - JWT token creation, validation
- `/app/backend/routers/auth.py` - Login endpoints + token generation
- `/app/backend/server.py` - PermissionCheckMiddleware
- `/app/backend/utils/permission_cache.py` - In-memory permission tracking
- `/app/frontend/src/utils/axiosConfig.js` - Axios interceptor for auth headers
- `/app/frontend/src/pages/muhasebe/*` - Accounting tabs (mobile responsive)
- `/app/frontend/src/components/muhasebe/HakedisTable.jsx` - Hakedis table with mobile view

## Credentials
- System Admin: `onurertas` / `Delivery32..`
- Company Admin: `admin` / `123456`
- Courier: `05550003201` / `123456`
