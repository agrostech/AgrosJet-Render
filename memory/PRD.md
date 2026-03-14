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
- Vardiya Sayfası Modal UI Sadeleştirme (Mar 2026)
- Kar/Zarar Raporu: Muhasebe > Raporlar > Kar/Zarar (Mar 2026)
- Ceza Sistemi: İhlal türlerine göre otomatik ceza (Mar 2026)
- **Ciro Raporu: Muhasebe > Raporlar > Ciro sekmesi, restoran bazlı tahsilat dağılımı (Mar 2026)**
- **Ortak Rapor Tarih Filtresi: ReportDateFilter componenti - Dün/Bugün/Bu Hafta/Geçen Hafta/Tarih Aralığı presetleri, şirket açılış/kapanış saatlerine göre hesaplama, default "Bugün" ile otomatik rapor (Mar 2026)**

## Pending Verification
- Push Notification System: Awaiting native app test (orders_v6 channel)
- Migros Webhook Parsing: Awaiting live test order
- Ciro Raporu: Awaiting user test with production data
- Rapor Tarih Filtresi: Awaiting user test

## Known Issues
- Adisyo Webhook: `Restoran bulunamadi` error (P2 - config issue, not code bug)
- Migros Webhook URL: Incorrect production URL (requires Migros contact)
- Native Location Notification: Shows on every page change (native-side issue)
- **CRITICAL** Migros is_test boolean: Webhook handler does not convert is_test string to boolean
- **CRITICAL** Migros migros_status: Not saved as "Approved" after auto-approval
- Migros DB Cleanup: Existing orders have incorrect is_test string values

## Upcoming Tasks
- **(P0) Fix Migros is_test + migros_status bugs + DB migration**
- (P1) "Stop Count" based capacity logic
- (P2) Caller ID integration research

## Backlog
- (P0) Restaurant Courier System (postponed by user)
- (P1) restaurant_fee calculation
- (P1) Haftalik Hakedis / Restoran Mutabakat refactoring
- (P1) Restaurant-Based Revenue Report
- (P1) Cancellation Analysis Report
- (P2) dispatch_decision function investigation
- (P2) Admin panel API request monitor
- (P2) Native Courier App development

## Architecture
- Backend: FastAPI + MongoDB
- Frontend: React + Tailwind CSS + Shadcn UI
- Integrations: Adisyo, Getir Yemek, Trendyol Yemek, Yemeksepeti, Sepettakip, Migros Yemek
- Hosting: Railway
- Push: Firebase Cloud Messaging (FCM) - Channel: orders_v6

## Key Files
- /app/frontend/src/components/admin/reports/ReportDateFilter.jsx - Shared date filter with presets
- /app/frontend/src/components/admin/reports/CiroRaporu.jsx - Turnover report
- /app/frontend/src/components/admin/reports/KarZararRaporu.jsx - Profit/Loss report
- /app/frontend/src/components/admin/reports/PerformansRaporu.jsx - Performance report
- /app/frontend/src/components/admin/reports/KuryeRaporlari.jsx - Courier reports
- /app/frontend/src/components/admin/reports/RestoranRaporlari.jsx - Restaurant reports
- /app/frontend/src/pages/muhasebe/RaporlarTab.jsx - Reports tab container (5 sub-tabs)
- /app/backend/routers/reports.py - All report API endpoints
- /app/backend/routers/webhooks.py - Migros webhook handler (NEEDS is_test fix)
