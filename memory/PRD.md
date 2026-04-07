# AgrosJet - Product Requirements Document

## Original Problem Statement
Multi-panel delivery management system (Admin, Restaurant, Courier) with integrations for Migros, Getir, Trendyol, Adisyo, Yemeksepeti. The system handles order routing, courier management, invoicing, and real-time delivery tracking.

## Core Architecture
- **Frontend**: React (CRA) with Tailwind CSS + Shadcn/UI
- **Backend**: FastAPI + MongoDB
- **Storage**: Cloudflare R2 (logos, invoices, DB backups)
- **Push Notifications**: Expo / Firebase
- **Integrations**: Migros, Getir, Trendyol, Adisyo

## What's Been Implemented

### Session 2026-04-07

#### Migros Webhook Auto-Approve Fix (P0)
- `is_test` artik DB'den okunuyor (hardcoded False degildi)
- Test ortaminda restoranin kendi `secret_key`'i kullaniliyor
- Production'da global `MIGROS_SECRET_KEY` kullaniliyor
- Files: `webhooks.py`, `integration_stores.py`

#### Getir Entegrasyon Fix (P0)
- `GETIR_BASE_URL` production URL'ine cekildi (`food-external-api-gateway.getirapi.com`)
- `test_getir_connection` fonksiyonunda POS aktivasyonu login'den ONCE yapiliyor (onceden login'den sonra yapiliyordu, login POS pasif oldugu icin reddediliyordu)
- Backend loglama eklendi (status, response body, URL)
- Frontend hata mesajlari duzeltildi (`res.data.success` kontrolu eklendi)
- Files: `getir_service.py`, `IntegrationStoresManager.jsx`

#### Admin Permissions UI Fix (P1)
- `MuhasebePage.jsx` ve `RaporlarTab.jsx`'de alt izin filtresi duzeltildi
- `!== false` → `=== true` (alt izin key'leri varsa)
- Legacy adminler icin geriye uyumluluk (sub-permission yoksa tum sekmeler gorunur)
- `server.py` middleware: `systemadmin` rolu de permission refresh'e eklendi
- Files: `MuhasebePage.jsx`, `RaporlarTab.jsx`, `server.py`

#### Kurye Hesap Al Ozelligi (Yeni)
- Restoran panelinde Muhasebe sayfasina "Kurye Hesap Al" modali eklendi
- Hafta secici + gun secici (tamamlanan gunler tik ile isaretlenir)
- Kurye bazinda nakit/kart bakiye gosterimi
- Kismi ve tam tahsilat destegi (bakiye sifirlanana kadar tekrar giris yapilabalir)
- Bakiye 0 olunca kurye "Alindi" olarak isaretlenir
- Sadece `collection_settings`'de restoran tahsilati olan siparisler gosterilir
- Sadece delivered/completed siparisler sayilir
- Backend: `restaurant_collections.py` (3 endpoint)
- Frontend: `CourierCollectionModal.jsx`
- DB: `restaurant_courier_collections` collection

### Previous Sessions
- OrderDetailModal beyaz ekran fix
- Restoran Products/Integration Stores/Reports 403 fix
- UTC timezone shift fix (performans raporlari)
- Sepettakip DTMF ve hazirlama suresi fix
- Migros/Getir global secret key refactoring
- KDV dahil kar/zarar raporu
- Kurye mutabakat collection_settings filtresi
- Degistirilen odemeler UI
- JWT Auth + Permission system
- R2 logo streaming

## Pending Issues
- (P1) Tiered Pricing Calculation - Sadece assigned+confirmed sayilmali, on_the_way haric
- (P2) "Neden AgrosJet?" statik metin guncellemesi
- (P2) Webhook setup agrosjet.net ping hatasi

## Upcoming Tasks
- (P1) VatanSMS Entegrasyonu
- (P1) Migros "Reject" Fonksiyoneligi
- (P2) Native Courier App - Harita/Proximity Engine
- (P2) Yemeksepeti Chrome Extension
- (P2) "Stop Count" kapasite mantigi
- (P2) Caller ID entegrasyonu

## Credentials
- System Admin: `onurertas` / `Delivery32..`
- Company Admin: `admin` / `123456`
- Courier: `05550003201` / `123456`
- Restaurant: `restoran1` / `123456`

## Key API Endpoints
- `POST /api/webhooks/migros`: Migros webhook (auto-approve with correct is_test/secret_key)
- `GET /api/restaurant-collections/{id}/courier-balances?date=YYYY-MM-DD`: Kurye bakiyeleri
- `POST /api/restaurant-collections/{id}/collect`: Tahsilat kaydi
- `GET /api/restaurant-collections/{id}/week-status?week_start=YYYY-MM-DD`: Haftalik durum
