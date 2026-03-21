# AgrosJet Delivery Management System - PRD

## Original Problem Statement
Full-stack delivery management application for managing couriers, restaurants, and orders across multiple food delivery platforms (Adisyo, Getir, Trendyol, Yemeksepeti, Migros, Sepettakip).

## Core Architecture
- **Frontend**: React (CRA) + Shadcn/UI + Tailwind CSS
- **Backend**: FastAPI + MongoDB (Motor async driver)
- **Platforms**: Adisyo, Getir Yemek, Trendyol Yemek, Yemeksepeti, Sepettakip, Migros Yemek

## Credentials
- System Admin: `AgrosJetSystem` or `onurertas` / `Delivery32..`
- Company Admin: `admin` / `123456`
- Test Restaurant: "Lezzet Duragi"
- Company with Logo: `AgrosJet Isparta`

## What's Been Implemented

### Başvurular (Applications) Feature (March 21, 2026)
- **New Tab**: "Başvurular" added to admin panel sidebar (after Restoranlar)
- **AgrosJet API Integration**: Full external API integration with agrosjet.com
  - Backend service: `backend/services/agrosjet_service.py`
  - Backend router: `backend/routers/applications.py`
  - Webhook endpoint: `POST /api/webhook/applications`
- **2 Application Types**: Kurye, Restoran tabs (Şirket sekmesi kaldırıldı)
- **Table Layout**: Desktop uses Table component (matching KuryelerPage CourierTable design)
- **Mobile Cards**: Compact card layout for mobile (matching CourierCards design)
- **Tab Design**: Matches Muhasebe sub-tab design (border-b-2, primary colors, scrollable)
- **Status Dropdown**: Colored dropdown with Yeni/Beklemede/Olumlu/Olumsuz options + note dialog
- **Province Filter**: Filters applications by company's city (set by system admin)
- **Permission-based**: `basvurular` permission added to admin permission system
- **System Settings**: AgrosJet settings card in System Admin > Ayarlar (API key, Base URL, connection test)
- **AgrosJet Config**: Stored in `system_settings` collection (type: "agrosjet")

### Migros Fixes (March 17-20, 2026)
- **Price Calculation**: Fixed double multiplication using `unitPrice`
- **Status Updates**: Fixed `is_test` boolean parsing
- **API 301 Redirect**: Updated to `test-gourmet.migrosone.com`
- **Restaurant Open/Close**: Implemented Migros store status endpoints
- **Order Cancellation**: Dynamic reasons from Migros API

### Previous Session Work
- Bulk Invoice to Merged PDF, PDF Cover Pages, Report PDF Export
- Superadmin Reset Fix, Courier Break Bug Fix
- Mobile UI Tab Standardization

## Key Files - Başvurular Feature
- `frontend/src/pages/admin/BasvurularPage.jsx` - Main page (table + dropdown + tabs)
- `frontend/src/pages/AdminDashboard.jsx` - Navigation + route (passes companyCity)
- `frontend/src/pages/admin/YoneticilerPage.jsx` - Permission definitions
- `frontend/src/pages/SystemDashboard.jsx` - AgrosJet settings card
- `backend/services/agrosjet_service.py` - AgrosJet API service
- `backend/routers/applications.py` - Application + webhook endpoints
- `backend/routers/system_settings.py` - AgrosJet settings CRUD
- `backend/routers/auth.py` - Updated permission keys + company city

## Pending / Upcoming Tasks

### P0 - High Priority
- Verify all Migros fixes with live test order
- VatanSMS Integration (API analyzed, implementation pending)

### P1
- Migros "Reject" functionality
- Migros 30-second cancellation rule
- Chrome Extension for Yemeksepeti orders
- "Stop Count" Based Capacity Logic
- `restaurant_fee` calculation

### P2+ Backlog
- Restaurant Courier System
- Yemeksepeti security requirements
- Haftalik Hakedis / Restoran Mutabakat job refactoring
- Restaurant-Based Revenue Report + Cancellation Analysis Report
- Caller ID integration, API request monitor
- Native Courier App, dispatch_decision review

## Key API Documentation
- Migros API: test URL `test-gourmet.migrosone.com`, production `gourmet.migrosonline.com`
- AgrosJet External API: Base URL configurable, auth via X-API-Key header
  - `GET /api/external/applications/{type}` - List applications
  - `PATCH /api/external/applications/{type}/{id}/status` - Update status
  - `GET /api/external/statuses/{type}` - Status definitions
  - `POST /api/webhook/applications` - Webhook receiver
