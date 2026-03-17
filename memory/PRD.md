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

### Migros Fixes (March 17, 2026)
- **is_test Bug Fix**: Fixed inconsistent `is_test` parsing across `orders.py`, `webhooks.py`, `integration_stores.py`. String values now handled consistently (non-false-like strings treated as True). DB data corrected from garbage string to boolean `true`.
- **Price Double-Counting Fix**: Migros `price` field is line total (already multiplied by quantity). Code now uses `unitPrice` for unit price. Fixed in `webhooks.py` and `migros_service.py`. Existing 4 orders' prices corrected in DB.
- **migros_status Tracking**: Auto-approve now sets `migros_status = "Approved"` in DB. All existing orders' migros_status corrected.
- **301 Redirect Fix**: Added `follow_redirects=True` to httpx client in `migros_service.py`.
- **Error Logging Improvement**: Migros API errors now extract `errorMessage.errorDetail` field instead of showing `None`. Applied in both `migros_service.py` and `orders.py`.
- **Restaurant Open/Close**: Implemented `Store/AddStoreOffDate` and `Store/RemoveStoreOffDate` API calls. Backend handler added for Migros in `integration_stores.py`. Frontend dialog added for close duration selection (1h, 4h, next work hour). Dashboard toggle defaults to NEXT_WORK_HOUR.

### Previous Session Work
- Bulk Invoice to Merged PDF (PyPDF2)
- PDF Cover Pages, Page Numbers, Turkish char support (reportlab)
- Report PDF Export for all 5 tabs (jspdf + jspdf-autotable)
- PDF Logo Fix (rendering order) + Aspect Ratio Fix
- Superadmin Reset Fix
- Courier Break Bug Fix
- Mobile UI Tab Standardization
- Railway Deployment Fix

## Pending Issues
- **Migros `cancelReasonId`**: Hardcoded to 1, should be fetched from API
- **Migros 30-second cancel rule**: Not implemented yet
- **Push Notification** (`orders_v6` channel): User verification pending
- **Migros Production Webhook URL**: Blocked (user must contact Migros)

## Upcoming Tasks (P1)
- Implement Migros Status Update Flow (draw.io analysis complete)
- Chrome Extension for Yemeksepeti orders
- "Stop Count" Based Capacity Logic
- Caller ID integration

## Backlog (P2+)
- Restaurant Courier System
- Yemeksepeti security requirements (DLP, Data Lifecycle, Masking)
- `restaurant_fee` calculation
- Haftalik Hakedis / Restoran Mutabakat job refactoring
- Restaurant-Based Revenue Report
- Cancellation Analysis Report
- API request monitor in admin panel
- Native Courier App

## Key API Documentation Reference
- Migros API: `/Order/v2/UpdateOrderStatus`, `/Order/v2/CancelOrder`, `/Store/AddStoreOffDate`, `/Store/RemoveStoreOffDate`, `/Store/GetStoreViewStatus`, `/Mapping/v2/GetCancelReasons`
- Migros price field: `price` = line total (qty * unit), `unitPrice` = per unit (both in kurus)
- Migros cancel: Only approved (not prepared) orders, 30s delay after creation
