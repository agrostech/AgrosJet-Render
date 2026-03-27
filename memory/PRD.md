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

### Courier App - Smart Route (PDP)
- Merged "Assigned" and "On the Way" tabs into unified "Siparişlerim" view
- List/Route toggle between manual card view and Smart Route view
- PDP algorithm: nearest-neighbor with group constraints (deliveries after pickups)
- Auto-adds new incoming orders to active route
- Ghost order cleanup: cancelled/unassigned orders auto-removed from route
- Route cards redesigned to match ActiveOrderCard styling (2024-03-27)
- "Aldım" button renamed to "Tümünü Yola Çıkar" with cyan color
- Total courier earnings displayed in route summary header
- Delivery cards show "Önce restorandan al" when pickup not yet done

### Maps Integration
- Web-to-native map links use device GPS (no origin/saddr params)
- OPEN_ROUTE and OPEN_NAVIGATION message types for native app

### Push Notifications
- Couriers notified when unassigned from an order
- Android FCM keys pending (user handling via new native build)

### Phone Number Formatting
- Trendyol: strips parentheses for correct `0212...` format
- Migros: incoming `5xx` formatted to `05xx`

### Login Page
- AgrosVet-inspired minimalist design with dynamic tab imagery

### Database & Storage
- Base64 fallback eliminated - strict R2 enforcement
- Automated MongoDB backup (15-min keep 5, 12-hour keep 4) with size anomaly detection
- Migros API on PROD with hardcoded keys

### Admin Features
- "Doğum Tarihi" on Applications page
- Logo fetching standardized to R2

## Pending Issues
1. ~~P0: Route card design matching~~ DONE (2024-03-27)
2. P1: "Neden AgrosJet?" text on Register/KVKK pages - courier-focused copy needed
3. P2: Dark blue screen flash on WebView resume - CSS body background fix

## Upcoming Tasks
- P1: Migros "Reject" Functionality
- P1: VatanSMS Integration
- P2: Native Courier App (internal map/proximity engine)
- P2: Migros 30-Second Rule

## Future/Backlog
- Yemeksepeti Chrome extension
- "Stop Count" capacity logic
- Technical security requirements
- `restaurant_fee` calculation
- Scheduled job refactoring
- Caller ID integration
- CourierSiparisPage.jsx refactoring (~2000 lines → component breakdown)

## Key Files
- `/app/frontend/src/pages/courier/CourierSiparisPage.jsx` - Main courier order/route page
- `/app/backend/routers/orders.py` - Order endpoints
- `/app/backend/services/migros_service.py` - Migros integration
- `/app/backend/services/backup_service.py` - DB backup service
- `/app/backend/services/r2_storage.py` - Cloudflare R2 utilities

## Credentials
- System Admin: `onurertas` / `Delivery32..`
- Company Admin: `admin` / `123456`
- Courier: `05553331122` or `05550003201` / `123456`
