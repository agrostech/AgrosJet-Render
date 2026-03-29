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
- CORS restriction (allow only agrosjet.net + preview URLs)
- bcrypt password hashing migration
- Role-based access control (endpoint-level)
- File upload size limits
- General rate limiting

## Key Files
- `/app/backend/utils/jwt_utils.py` - JWT token creation, validation, FastAPI dependencies
- `/app/backend/routers/auth.py` - Login endpoints + token generation
- `/app/frontend/src/utils/axiosConfig.js` - Axios interceptor for auth headers
- `/app/frontend/src/pages/CourierDashboard.jsx` - Token preservation in localStorage

## Credentials
- System Admin: `onurertas` / `Delivery32..`
- Company Admin: `admin` / `123456`
- Courier: `05550003201` / `123456`
