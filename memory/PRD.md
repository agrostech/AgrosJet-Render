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

### Recent Fixes (2026-04-06)
- **OrderDetailModal Beyaz Ekran Fix**: `paymentLabel` ReferenceError → hesaplama OrderDetails bileşenine taşındı
- **Restoran Ürünler Yetki Fix**: `products.py` router `require_admin` → `require_auth` (restoran kullanıcıları ürün CRUD yapabiliyor)
- **Performans Raporu UTC Fix**: `$hour` operatörüne `timezone: "+03:00"` eklendi, saatlik dağılım grafiği doğru Türkiye saatini gösteriyor

### Previous Work
- Kademeli ücretlendirme fix (tiered pricing courier_fee korunuyor)
- Fesih tarih seçimi modalı (retroactive termination)
- Çalışma saatleri standardizasyonu (06:00)
- Muhasebe bulk balance API (%97 azalma)
- Mobile responsive fixes
- JWT Auth + Permission system
- R2 logo streaming

## Pending Issues
- (P1) "Neden AgrosJet?" statik metin güncellemesi - 5x ertelendi
- (P2) Webhook setup agrosjet.net ping hatası

## Upcoming Tasks
- (P1) Migros "Reject" Fonksiyonelliği
- (P1) VatanSMS Entegrasyonu
- (P2) Native Courier App - Harita/Proximity Engine
- (P2) Yemeksepeti Chrome Extension
- (P2) "Stop Count" kapasite mantığı
- (P2) Caller ID entegrasyonu

## Credentials
- System Admin: `onurertas` / `Delivery32..`
- Company Admin: `admin` / `123456`
- Courier: `05550003201` / `123456`
- Restaurant: `restoran1` / `123456`
