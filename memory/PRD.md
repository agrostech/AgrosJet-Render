# ShiftJet - Restaurant Management System PRD

## Original Problem Statement
ShiftJet is a full-stack restaurant management system with courier tracking, order management, and multi-platform integrations (Getir, Trendyol, Adisyo, Yemeksepeti, Migros, SepetTakip).

**User Language:** Turkish

## Current Session Focus
Getir Yemek integration - fixing order status management and customer phone number bugs.

---

## What's Been Implemented

### 2026-02-20 - Getir Status Fix
- ✅ Fixed `delayed_prepare` function - was incorrectly setting status to 700 (on_the_way) instead of 500 (preparing)
- ✅ Fixed `sync_restaurant_getir_orders` - now only accepts cancellation status from Getir, other status changes are manual (via UI buttons)
- ✅ Customer phone number fix - uses `clientPhoneNumber` field and removes dashes

### Previous Sessions
- Getir Yemek integration (authentication, polling, webhooks, auto-verify, scheduled prepare)
- Trendyol Yemek integration
- Adisyo integration
- Restaurant management (CRUD, integrations)
- Courier management and tracking
- Order management with multi-platform support
- Financial reports and accounting

---

## Integration Status

| Platform | Status | Notes |
|----------|--------|-------|
| Getir Yemek | IN PROGRESS | Status fix done, needs testing |
| Trendyol Yemek | WORKING | Polling mode |
| Adisyo | USER VERIFICATION | URL config issue |
| SepetTakip | BLOCKED | Awaiting 3rd party |
| Yemeksepeti | PENDING | Awaiting credentials |
| Migros Yemek | PAUSED | Paused for Getir |

---

## Priority Backlog

### P0 - Critical
1. Test Getir status fix in production
2. Complete Getir test scenarios
3. Verify phone number fix works

### P1 - High Priority
1. Migros Yemek integration
2. SepetTakip webhook activation
3. Reports page functionality

### P2 - Medium Priority
1. Adisyo order sync issue
2. Background task reliability (courier app)
3. Mobile sidebar collapse bug

### P3 - Low Priority
1. Historical accounting data migration
2. Code refactoring (duplicate order list pages)
3. Dark mode theme

---

## Key Files Reference

### Getir Integration
- `/app/backend/services/getir_service.py` - Core Getir API logic
- `/app/backend/routers/getir.py` - Getir API endpoints
- `/app/backend/routers/orders.py` - Order status notifications (notify_platform_status_change)

### Database
- `orders` collection - `source: "getir"`, `getir_raw.status`, `customer_phone`
- `restaurant_integrations` - Getir credentials storage

---

## Test Credentials
- Super Admin: `onurertas` / `125594`
- Restaurant (Getir test): `bostonddisparta` / `123456`
- Getir Webhook API Key: `96d52Ht59VEM4ha5juvKfRlsl9mkGzrq0WPuL8fPhZw`
