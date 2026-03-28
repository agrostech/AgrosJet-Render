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

### Permission System (2026-03-28)
- Sub-tab level permissions for admin panel
- 21 permission keys total: 9 main tabs + 10 muhasebe sub-tabs + 2 siparis sub-tabs
- Main tab toggle auto-enables/disables all sub-tabs
- Superadmin/Systemadmin always gets all permissions = True
- Regular admins: sub-tab defaults to True (backward compatible), individually configurable
- YoneticilerPage: accordion-style sub-tab switches under main tabs
- MuhasebePage: filters tabs based on muhasebe_* permissions
- SiparisYonetimiPage: hides Teslim/İptal tabs based on siparis_gecmis/siparis_iptal
- AdminDashboard routes protected by permissions

### Courier App - Smart Route (PDP) (2026-03-27)
- Merged Assigned/On-the-way into unified "Siparişlerim" with List/Route toggle
- PDP algorithm with nearest-neighbor + group constraints
- Auto-adds new orders, ghost order cleanup for cancelled/unassigned
- Route cards redesigned to match ActiveOrderCard styling
- "Tümünü Yola Çıkar" button (cyan), total earnings in route header
- "Gördüm" check: Rota tab blocked if assigned (unseen) orders exist
- Delivery cards show "Önce restorandan al" when pickup not done

### Maps Integration
- Device GPS used (no origin/saddr params)

### Push Notifications
- Unassignment notifications to couriers

### Database & Storage
- Base64 fallback eliminated, strict R2 enforcement
- Automated MongoDB backup (15-min/12-hour) with size anomaly detection
- Migros API on PROD

## Pending Issues
1. P1: "Neden AgrosJet?" text on Register/KVKK pages
2. P2: Dark blue screen flash on WebView resume

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
- agrosjet.net landing page API integration (needs backend endpoints on landing side)

## Permission Keys Reference
### Main tabs:
vardiya, muhasebe, zimmet, kuryeler, market, akademi, sistem, raporlar, basvurular

### Muhasebe sub-tabs:
muhasebe_kuryeler, muhasebe_isletmeler, muhasebe_cariler, muhasebe_kurye_mutabakat, muhasebe_restoran_mutabakat, muhasebe_yonetici_mutabakat, muhasebe_haftalik_hakedis, muhasebe_kurye_faturalari, muhasebe_isletme_faturalari, muhasebe_hareketler

### Sipariş sub-tabs:
siparis_gecmis, siparis_iptal

## Key Files
- `/app/backend/routers/auth.py` - Login + permission system
- `/app/frontend/src/pages/admin/YoneticilerPage.jsx` - Admin permission UI
- `/app/frontend/src/pages/AdminDashboard.jsx` - Route guards
- `/app/frontend/src/pages/MuhasebePage.jsx` - Sub-tab filtering
- `/app/frontend/src/pages/admin/SiparisYonetimiPage.jsx` - Sipariş tab guards
- `/app/frontend/src/pages/courier/CourierSiparisPage.jsx` - Courier route view

## Credentials
- System Admin: `onurertas` / `Delivery32..`
- Live DB: `mongodb://mongo:cGKFydXXotSVyqRqYBqmaBGSOQdeIjEr@crossover.proxy.rlwy.net:13253`
