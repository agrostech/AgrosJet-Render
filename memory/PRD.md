# AgrosJet - Automatic Dispatch System PRD

## Original Problem Statement
Sophisticated **Automatic Dispatch System** for a multi-panel application (Admin, Restaurant, Courier). The core is to automatically assign "ready" orders to the most suitable couriers based on complex business rules.

## User Language
Turkish

## Core Features Implemented

### Dispatch Logic
- Detour calculation based on total optimal route distance (TSP heuristic)
- Angle check with configurable skip distance for nearby packages
- Detour check with negative values for minimum savings threshold
- Proximity-based skips for both angle and detour checks
- Courier state validation (availability_status, allowed_payment_methods)
- Atomic order assignment to prevent race conditions
- Auto-cancellation of unconfirmed assignments with shift violation logging
- Excluded couriers list to prevent re-assignment after failed confirmation

### UI/Settings
- Flexible numeric inputs allowing 0 and negative values
- "Optimize Ayarları Yükle" button for preset configuration
- Disabled "Çalışma Saatleri" card (24-hour operation)
- Email notification toggles for all notification types

## Completed Work (March 2, 2026)
- [x] E-posta Bildirimleri UI - removed separate "Otomatik Atama Bildirimleri" category
- [x] All notification toggles now in same grid with consistent styling

## In Progress Tasks
1. **P1: Email Notification Backend** - Backend logic to actually send emails based on `notify_shift_violation` and `notify_auto_cancel` settings

## Upcoming Tasks
1. **P1: "Stop Count" Capacity Logic** - Count unique drop-off locations instead of raw package count
2. **P1: Restaurant Fee Calculation** - Implement `restaurant_fee` on order creation for all webhooks

## Future/Backlog Tasks
- Refactor scheduled jobs (Haftalık Hakediş, Restoran Mutabakat)
- Investigate/remove unused `dispatch_decision` function
- API request monitor in admin panel
- Refactor `/app/backend/routers/orders.py`
- Native Courier App development

## Key Files
- `/app/backend/services/auto_dispatch/dispatcher.py` - Core dispatch loop
- `/app/backend/services/auto_dispatch/courier_selection.py` - Eligibility logic
- `/app/backend/services/auto_dispatch/detour.py` - Route optimization
- `/app/frontend/src/pages/SistemPage.jsx` - Settings UI

## Database Schema (Key Fields)
- **companies.auto_dispatch_settings**: max_detour, auto_cancel_enabled, auto_cancel_timeout, send_violation_emails, send_cancellation_emails
- **orders**: excluded_couriers, status_history
- **couriers**: availability_status, allowed_payment_methods

## Test Credentials
- Admin: `superadmin` / `123456`
- Courier: `5555555555` / `123456`
