# ShiftJet - Kurye Yonetim Sistemi PRD

## Problem Statement
Courier delivery management system with ETA calculation, order management, native app integration, and push notifications.

## Completed Features
- ETA Calculation: "Collect-Then-Distribute" logic implemented
- Responsive Order Management UI (mobile card / desktop table)
- Header logo and company name updates
- Mobile tab and stats redesign
- Native location tracking and FCM token communication
- Courier detail modal: battery info + live polling (10s)
- Push notification channel updates (latest: `orders_v6`)
- Courier order card: compact design with detail modal, separator lines, large action buttons
- Courier permissions system: can_mark_not_ready toggle in admin panel + matrix view
- Active package check on status change (offline/break blocked if active orders, bypass if shift ended)
- Admin mobile order header redesign: compact search + colored filter pills
- Dark Mode: ThemeProvider with localStorage, CSS variables, sidebar toggle (Feb 2026)
- Critical Timezone Bug Fix: dateUtils.js utility, 15 components refactored (Mar 2026)
- Migros Integration Overhaul: subOptions parsing, sequential status updates, CancelOrder endpoint, credential reading fix (Mar 2026)
- Vardiya Sayfası Modal UI Sadeleştirme: İhlaller, Hareketler, Mola Ayarları modalları ve butonlarından renkler kaldırılıp tutarlı nötr tasarıma geçildi (Mar 2026)
- Kar/Zarar Raporu: Muhasebe > Raporlar > Kar/Zarar sekmesi, datetime filtreleme ile taşıma ücreti vs kurye hakediş karşılaştırması (Mar 2026)
- Ceza Sistemi: İhlal türlerine göre otomatik ceza uygulama, şirket bazlı ayarlar, bakiyeye yeşil işlem olarak ekleme (Mar 2026)

## Pending Verification
- Push Notification System: Awaiting native app test (orders_v6 channel)
- Migros Webhook Parsing: Awaiting live test order

## Known Issues
- Adisyo Webhook: `Restoran bulunamadi` error (P2 - config issue, not code bug)
- Migros Webhook URL: Incorrect production URL (requires Migros contact)
- Native Location Notification: Shows on every page change (native-side issue)
- **CRITICAL** Migros is_test boolean: Webhook handler does not convert is_test string to boolean - all live orders flagged as test
- **CRITICAL** Migros migros_status: Not saved as "Approved" after auto-approval
- Migros DB Cleanup: Existing orders have incorrect is_test string values

## Upcoming Tasks
- (P1) "Stop Count" based capacity logic
- (P1) Dark mode fine-tuning for sub-pages (couriers, accounting, shifts)
- (P2) Caller ID integration research

## Backlog
- (P0) Restaurant Courier System (postponed by user)
- (P1) restaurant_fee calculation
- (P1) Haftalik Hakedis / Restoran Mutabakat refactoring
- (P2) dispatch_decision function investigation
- (P2) Admin panel API request monitor
- (P2) Native Courier App development

## Architecture
- Backend: FastAPI + MongoDB
- Frontend: React + Tailwind CSS + Shadcn UI
- Dark Mode: Tailwind class strategy + CSS variables + ThemeProvider context
- Integrations: Adisyo, Getir Yemek, Trendyol Yemek, Yemeksepeti, Sepettakip, Migros Yemek
- Hosting: Railway
- Push: Firebase Cloud Messaging (FCM) - Channel: orders_v6
- APIs: Google Places, Google Geocoding

## Key Files
- /app/frontend/src/contexts/ThemeContext.jsx - Dark mode provider
- /app/frontend/src/index.css - CSS variables (light + dark)
- /app/frontend/src/pages/admin/SiparisYonetimiPage.jsx - Order management
- /app/frontend/src/pages/courier/CourierSiparisPage.jsx - Courier order cards
- /app/backend/routers/couriers.py - Permissions API + availability check
- /app/backend/services/firebase_service.py - FCM push (orders_v6)
- /app/frontend/src/utils/dateUtils.js - Timezone-safe date formatting utility
- /app/frontend/src/pages/VardiyaPage.jsx - Shift management page
- /app/frontend/src/components/vardiya/ - Shift modals (IhlalModal, StatusMovements, BreakSettings)
- /app/backend/routers/webhooks.py - Migros webhook handler (NEEDS is_test fix)
- /app/backend/routers/orders.py - Order status updates (NEEDS migros_status fix)
