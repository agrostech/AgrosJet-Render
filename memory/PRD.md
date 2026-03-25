# AgrosJet Delivery Management System - PRD

## Original Problem Statement
Delivery management system for courier companies. Multi-platform order aggregation (Getir, Trendyol, Migros, Yemeksepeti, Adisyo), courier management, shift system, financial tracking, restaurant panel.

## User Language
Turkish (All communication in Turkish)

## Core Architecture
- **Backend:** FastAPI + MongoDB (Motor async driver)
- **Frontend:** React + Shadcn/UI + TailwindCSS
- **Push Notifications:** Dual system - Expo Push API (iOS/new Android) + Firebase FCM (old Android)
- **External APIs:** AgrosJet, Getir, Trendyol, Migros, Adisyo, Yemeksepeti

## What's Been Implemented

### Session & Push Notification System (Latest - March 2026)
- **Login clears old fcm_token:** Prevents notifications going to old device during login transition
- **Auto-logout notifies native:** `notifyLogout()` called during forced logout so native stops location tracking
- **push_session_id in localStorage:** Persists across app restarts (was sessionStorage before - lost on restart)
- **POST /courier/fcm-token session validation:** Alternate endpoint now validates session_id
- **Dual push system:** ExponentPushToken → Expo API, FCM token → Firebase

### Application (Başvurular) System
- Removed "Şirket" tab
- Clickable phone numbers with tel: links
- Sidebar badge showing new application count from AgrosJet API
- Webhook notifications filtered by city and application type
- Mark-as-read on page visit

### Courier Multi-Device Management
- push_session_id based session tracking
- Auto-logout for stale sessions via 10s polling
- Token clearing only on explicit logout from active session

## Pending Issues

### P0 - Critical
1. **Migros Cancellation Reasons:** ✅ FIXED (Feb 2026) — Dropdown was showing empty labels because code parsed `name`/`label` fields from Migros V2 API response, but the correct field is `description`. Fixed in `orders.py` line 1583.

### P0 - Awaiting User Decision
2. **Courier Route Creation Fallback:** "Create Route" defaults to restaurant location when courier GPS unavailable. Solutions proposed, user decision pending.

### P1
3. **VatanSMS Integration** 
4. **Migros "Reject" Functionality**
5. **Migros 30-Second Cancellation Rule**

## Future/Backlog
- Chrome Extension (Yemeksepeti)
- Stop Count capacity logic
- restaurant_fee calculation
- Scheduled job refactoring
- New reports
- Restaurant Courier System
- Caller ID integration
- More courier permissions
- API request monitor
- Native Courier App

## Key DB Schema
- **couriers:** `fcm_token`, `push_session_id`, `current_location`, `fcm_platform`, `fcm_token_updated_at`
- **notifications:** `basvuru` type for application alerts
- **company_couriers:** courier-company relations with `is_active` flag

## Credentials (Test)
- Admin: `onurertas` / `Delivery32..`
- Company Admin: `admin` / `123456`
- Courier: `05553331122` / `123456`
