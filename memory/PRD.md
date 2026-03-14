# AgrosJet Delivery Management System - PRD

## Original Problem Statement
Full-stack delivery management application with mobile responsiveness, admin panel features, and various integrations (Adisyo, Getir, Trendyol, Yemeksepeti, Migros, etc.).

## Core Architecture
- **Frontend:** React (Vite) + Tailwind CSS + Shadcn UI
- **Backend:** FastAPI + MongoDB
- **Integrations:** Firebase FCM, Leaflet Maps, Recharts, jsPDF

## What's Been Implemented

### Session - March 14, 2026
- **PDF Logo Fix:** Changed `companyLogo` prop in `AdminDashboard.jsx` to use `company?.logo_light` instead of `company?.logo_dark` for PDF exports from `/admin/muhasebe` page. PDFs have white backgrounds so light-background logo is correct.

### Previous Sessions (Completed)
- Mobile responsiveness: Reports, Restaurants, Couriers, System pages
- Shift Management: Redesigned from modals to tab-based UI
- Company Impersonation: Super-admin can log into company panels via iframe
- Firebase Logs: Fixed missing notification logs
- Order Cards: Compact redesign
- System Dashboard: Collapsible sidebar, impersonation feature
- Courier/Credit UI improvements

## Known Issues
- **Migros Webhook Logic (P0 - User deferred):** `is_test` parameter incorrectly parsed, `migros_status` not updated to "Approved", corrupt data in DB
- **Push Notification System:** User verification pending (orders_v6 channel)

## Backlog (Prioritized)
### P1
- Stop Count based capacity logic
- Restaurant-based revenue report
- Cancellation analysis report
- `restaurant_fee` calculation on order creation
- Refactor scheduled jobs (Haftalik Hakedis, Restoran Mutabakat)

### P2
- Caller ID integration
- Additional courier permissions
- `dispatch_decision` function review
- API request monitor in admin panel
- Native Courier App

### P0 (Large Feature - Future)
- Restaurant Courier System

## Credentials
- System Admin: `AgrosJetSystem` / `Delivery32..`
- Company Admin: `admin` / `123456`
