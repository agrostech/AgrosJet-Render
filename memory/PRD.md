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
- Courier order card redesigned: compact layout with detail modal (Feb 2026)

## Pending Verification
- Push Notification System: Awaiting native app test
- Migros Webhook Parsing: Awaiting live test order

## Known Issues
- Adisyo Webhook: `Restoran bulunamadi` error (P2)
- Migros Webhook URL: Incorrect production URL (requires Migros contact)
- Native Location Notification: Shows on every page change (native-side issue)

## Upcoming Tasks
- (P1) "Stop Count" based capacity logic
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
- Integrations: Adisyo, Getir Yemek, Trendyol Yemek, Yemeksepeti, Sepettakip, Migros Yemek
- Hosting: Railway
- Push: Firebase Cloud Messaging (FCM) - Channel: orders_5
- APIs: Google Places, Google Geocoding
