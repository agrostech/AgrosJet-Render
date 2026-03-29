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
- Phase 1: Token generation + frontend interceptor
- Phase 2: Critical endpoints (system_settings, admins, backup) 
- Phase 3: Admin-only routers (34 files, ~268 endpoints)
- Phase 4: Shared routers (orders, couriers, companies, restaurants, etc.)
- Fixed CourierDashboard overwriting localStorage without token

### System Admin Role Fix (2026-03-29)
- Fixed auth.py role override: systemadmin → superadmin bug
- Priority chain: systemadmin > superadmin > admin["role"]

### Courier Reports Fix (2026-03-29)
- Performansım: default tab, first position, Bugün/Bu Hafta selector
- İhlallerim: entity_id param fix, added violation types
- UTC/Turkey timezone fix using getTurkeyNow()

### Other Fixes (2026-03-29)
- Restaurant phone enrichment in orders/v2/list
- Scroll reset on page navigation
- CompanySwitcher logo display (logo_dark > logo_light > logo_url)
- Raporlar sub-tab permissions in admin panel
- Default company selection for multi-company admins
- Google Places autocomplete on restaurant address form
- MongoDB backup test button in System panel

## Pending Issues
None active.

## Upcoming Tasks
- ~~bcrypt password hashing migration~~ ✅ DONE (2026-03-29)
- ~~File upload size limits~~ ✅ DONE (2026-03-29)
- ~~General rate limiting~~ ✅ DONE (2026-03-29)
- Yemeksepeti Chrome extension (P2)
- "Stop Count" kapasite mantığı (P2)
- Caller ID entegrasyonu (P2)

## Security - Password Hashing (2026-03-29)
### Implementation
- Migrated from SHA-256 (hashlib) to bcrypt
- `hash_password()` now uses `bcrypt.hashpw()` with `bcrypt.gensalt()`
- `verify_password()` supports dual-hash: bcrypt ($2b$) and legacy SHA-256 (64 hex chars)
- Auto-upgrade: On successful SHA-256 login, hash is replaced with bcrypt in DB
- All 36 user accounts (4 admins, 22 couriers, 10 restaurant users) upgraded to bcrypt

### Affected Files
- `utils/helpers.py` - Core hash_password() and verify_password()
- `routers/auth.py` - Admin/Courier login + auto-upgrade
- `routers/restaurant_users.py` - Restaurant login + auto-upgrade
- `routers/profile.py` - Password change with auto-upgrade
- `routers/admins.py` - New admin creation
- `services/courier_service.py` - Courier password update
- `server.py` - System admin seeder

## Security - File Upload Limits (2026-03-29)
### Limits
| Tür | Limit | Dosyalar |
|-----|-------|----------|
| Logo | 5MB | companies.py |
| Fatura/Belge | 10MB | invoices.py, issued_invoices.py, restaurant_invoices.py, restaurant_panel_invoices.py, business_invoices.py, documents.py |
| Chat dosyası | 10MB | chat.py |
| Akademi görsel | 10MB | academy.py |
| Akademi video | 100MB | academy.py |
| Excel | 5MB | bulk_hakedis.py, daily_reports.py |
| DB Yedek | 500MB | backup.py |

### Implementation
- Tüm upload endpoint'lerinde `await file.read()` sonrası `len(content)` kontrolü
- Aşıldığında HTTP 413 (Payload Too Large) döner

## Security - Router Auth Fix (2026-03-29)
### Issue
Güvenlik güncellemesinde (Phase 4) 5 router `require_admin` ile korunmuş ancak kurye panelinden erişim gereken endpoint'ler vardı. Kuryeler `role: "courier"` ile geldiğinden 401 alıyorlardı.

### Fix
5 router'ın seviye bağımlılığı `require_admin` → `require_auth` olarak değiştirildi:
- `motorcycles.py` — Kurye motosiklet yönetimi
- `zimmet.py` — Kurye zimmet görüntüleme
- `academy.py` — Kurye eğitim erişimi
- `documents.py` — Kurye belge yükleme
- `invoices.py` — Kurye fatura görüntüleme

### Result
Hem admin hem kurye token'ları bu endpoint'lere erişebilir. Token olmadan 401 korunur.
### Global Middleware
- Custom `GlobalRateLimitMiddleware` in `server.py`
- **200 istek/dakika/IP** tüm endpoint'lere uygulanır
- In-memory tracking, 5 dakikada bir stale IP temizliği
- Aşıldığında HTTP 429 döner

### Endpoint-spesifik (slowapi)
- Login: 5/dakika
- E-posta doğrulama: 10/dakika
- Şifre sıfırlama: 3/dakika

### Muaf Path'ler (Webhook/3.parti)
- `/api/getir/`, `/api/migros/`, `/api/sepettakip/`, `/api/adisyo/`, `/api/webhooks/`, `/api/external/`

## Key Files
- `/app/backend/utils/jwt_utils.py` - JWT token creation, validation, FastAPI dependencies
- `/app/backend/routers/auth.py` - Login endpoints + token generation
- `/app/frontend/src/utils/axiosConfig.js` - Axios interceptor for auth headers
- `/app/frontend/src/pages/CourierDashboard.jsx` - Token preservation in localStorage

## Credentials
- System Admin: `onurertas` / `Delivery32..`
- Company Admin: `admin` / `123456`
- Courier: `05550003201` / `123456`
