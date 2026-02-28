# Fleet Order System - PRD

## Original Problem Statement
Multi-panel (Admin, Restaurant, Courier) delivery management application with integrations for third-party platforms (Adisyo, Getir, Trendyol, etc.)

## Completed Features (as of 2026-02-28)

### Session Completed
- [x] RestoranlarPage loading icon fixed - now uses consistent `PageLoading` component
- [x] Push notification simplified - only shows restaurant name in body

### Previously Completed
- [x] Persistent Integration Logging System
- [x] Restaurant Groups CRUD feature
- [x] Admin Panel Mobile UI Overhaul
- [x] Restaurant Panel Mobile UI Overhaul
- [x] Courier Panel Mobile UI Overhaul
- [x] Deprecated features removed (Entegrasyon Testleri, Gelen İstek Logları)
- [x] Rate limiting for auth endpoints

## Backlog

### P1 - High Priority
- [ ] `restaurant_fee` calculation in integrations (Getir, Trendyol, etc.)
- [ ] Refactor scheduled jobs in `jobs.py`

### P2 - Medium Priority
- [ ] API request monitor/logger in admin panel
- [ ] orders.py refactoring

### P3 - Future
- [ ] Native Courier App
- [ ] Chat System re-enable
- [ ] Google Maps Integration
- [ ] Dark Mode theme

## Key Files
- `/app/frontend/src/pages/admin/RestoranlarPage.jsx` - Restaurant management page
- `/app/backend/services/push_notification_service.py` - Push notifications
- `/app/frontend/src/components/ui/loading-spinner.jsx` - Loading components

## Test Credentials
- Admin: `superadmin` / `123456`
- Courier: `5555555555` / `123456`
