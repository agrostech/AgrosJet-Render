# AgrosJet Delivery Management System - PRD

## Original Problem Statement
Multi-platform delivery management system integrating with Migros, Getir, Trendyol, Adisyo, Yemeksepeti, and SepetTakip. Includes admin panel, restaurant panel, and courier panel.

## Architecture
- Backend: FastAPI + MongoDB
- Frontend: React + Shadcn/UI
- Services: migros_service, getir_service, trendyol_service, adisyo_service, yemeksepeti_service

## Payment System Standard
- `payment_type` / `payment_method`: Internal code (cash, card, online, meal_card, online_meal_card) — for reports
- `payment_method_detail`: Display name — for frontend (Migros: "Kapıda Ödeme - Sodexo", Adisyo: "Sodexo" etc.)
- `payment_method_name`: Getir-specific display name field

## Completed (March 2026)
- Migros cancel reasons: `description` field parsed instead of `name`/`label`
- Migros option prices: `unit_price` + `quantity` display (4x Tatlı Patates format)
- Migros total price: Fixed variable collision in webhooks.py
- Migros payment type: Added SODEXO/PAYE/MULTINET/TICKET/SETCARD/METROPOL to payment_type_map
- Migros payment display: `payment_method` = internal code, `payment_method_detail` = Migros description
- Frontend payment display: Admin + Restaurant panels show `payment_method_detail` when available
- Courier session management & auto-logout
- Platform-aware push notifications (Expo/FCM)
- Native-driven courier location tracking
- Emoji push notifications (cancel, unassign, auto-unassign)
- Courier bottom navigation bar
- Application notifications with sidebar badge

## P0 - Critical (Next)
1. Route creation pin removal — auto-use courier's current location
2. Courier session fixes verification with native app

## P1 - High
3. VatanSMS integration
4. Migros "Reject" functionality
5. Courier Rota Fallback verification

## P2 - Medium
6. Migros 30-second cancellation rule

## Future/Backlog
- Chrome extension for Yemeksepeti
- Stop Count capacity logic
- Technical security requirements
- restaurant_fee calculation
- Scheduled job refactoring
- New reports
- Restaurant Courier System
- Caller ID integration
- More courier permissions
- API request monitor
- Native Courier App

## Test Credentials
- System Admin: `onurertas` / `Delivery32..`
- Company Admin: `admin` / `123456`
- Courier: `05553331122` / `123456`
