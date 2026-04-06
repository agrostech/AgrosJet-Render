# AgrosJet - Product Requirements Document

## Original Problem Statement
Multi-panel delivery management system (Admin, Restaurant, Courier) with integrations for Migros, Getir, Trendyol, Adisyo, Yemeksepeti. The system handles order routing, courier management, invoicing, and real-time delivery tracking.

## Core Architecture
- **Frontend**: React (CRA) with Tailwind CSS + Shadcn/UI
- **Backend**: FastAPI + MongoDB
- **Storage**: Cloudflare R2 (logos, invoices, DB backups)
- **Push Notifications**: Expo / Firebase
- **Integrations**: Migros (PROD), Getir, Trendyol, Adisyo

## Security - JWT Auth System (2026-03-29)
- JWT tokens on all 3 login endpoints, axios interceptor, localStorage
- 531 protected, 68 webhook-auth, ~5 open endpoints

## What's Been Implemented

### Recent Fixes (2026-04-07)
- **Migros Webhook Auto-Approve Fix**: `is_test` artik DB'den okunuyor (hardcoded False degildi), test ortaminda restoranin kendi `secret_key`'i kullaniliyor. Onceki hata: test api_key production URL'e gonderiliyordu → "Api key not found"

### Previous Fixes (2026-04-06)
- **OrderDetailModal Beyaz Ekran Fix**: `paymentLabel` ReferenceError
- **Restoran Urunler Yetki Fix**: `products.py` router `require_admin` → `require_auth`
- **Performans Raporu UTC Fix**: `$hour` timezone "+03:00"
- **Sepettakip DTMF ve Hazirlık Suresi Fix**
- **Migros/Getir Global Secret Key Refactoring**
- **Restoran Integration Stores/Reports 403 Fix**
- **KDV dahil kar/zarar raporu**
- **Kurye Mutabakat collection_settings filtresi**
- **Degistirilen Odemeler UI**

### Previous Work
- Kademeli ucretlendirme fix (tiered pricing courier_fee korunuyor)
- Fesih tarih secimi modali (retroactive termination)
- Calisma saatleri standardizasyonu (06:00)
- Muhasebe bulk balance API (%97 azalma)
- Mobile responsive fixes
- JWT Auth + Permission system
- R2 logo streaming

## Pending Issues
- (P1) Admin Permissions UI Bug - Alt izinler alt sekmeleri gizlemiyor
- (P1) Tiered Pricing Calculation - Sadece assigned+confirmed sayilmali, on_the_way haric
- (P1) "Neden AgrosJet?" statik metin guncellemesi - 6x ertelendi
- (P2) Webhook setup agrosjet.net ping hatasi

## Upcoming Tasks
- (P1) Migros "Reject" Fonksiyonelliği
- (P1) VatanSMS Entegrasyonu
- (P2) Native Courier App - Harita/Proximity Engine
- (P2) Yemeksepeti Chrome Extension
- (P2) "Stop Count" kapasite mantigi
- (P2) Caller ID entegrasyonu

## Credentials
- System Admin: `onurertas` / `Delivery32..`
- Company Admin: `admin` / `123456`
- Courier: `05550003201` / `123456`
- Restaurant: `restoran1` / `123456`
