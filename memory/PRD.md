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
### Implementation
- JWT tokens generated on all 3 login endpoints (admin, courier, restaurant)
- Frontend axios interceptor sends `Authorization: Bearer <token>` on every request
- Token stored in localStorage alongside user session data

### Protection Levels
| Level | Dependency | Used For |
|-------|-----------|----------|
| `require_system_admin` | systemadmin only | System settings, DB viewer |
| `require_super_or_system` | superadmin + systemadmin | Admin CRUD, backup, company assignment |
| `require_admin` | admin + superadmin + systemadmin | All admin panel operations |
| `require_auth` | Any valid token | Shared endpoints (orders, couriers, restaurants) |

### Coverage
- **531 endpoints protected** (JWT required)
- **68 endpoints open** (webhooks with own API key auth)
- **~5 endpoints intentionally open** (login, logo serve, impersonate verify)

## What's Been Implemented

### JWT Auth Middleware (2026-03-29)
- Phase 1-4: Full JWT coverage across all routers

### System Admin Role Fix (2026-03-29)
- Fixed auth.py role override: systemadmin > superadmin > admin["role"]

### Courier Reports Fix (2026-03-29)
- Performansim, Ihlallerim tabs, UTC/Turkey timezone fix

### Permission System Fix (2026-04-01)
- Extended valid_keys + Event-driven permission updates

### R2 Logo Direct Streaming (2026-03-31)
- Presigned URL redirects replaced with direct byte streaming

### Mobile Responsive Fixes
- CourierCards, Vardiyalar tab, Muhasebe tabs mobile card views

### Muhasebe Bakiye Performans Optimizasyonu (2026-04-02)
- N+1 API → bulk entity-balances endpoint (%97 azalma)

### Fesih Tarih Seçimi Modalı (2026-04-05)
- Retroactive date selection for courier termination

### Çalışma Saatleri Standartlaştırma (2026-04-05)
- All defaults standardized to 06:00/06:00

### Kademeli Ücretlendirme Fix (2026-04-06)
- Tiered pricing courier_fee preserved on delivery

### OrderDetailModal Beyaz Ekran Fix (2026-04-06)
- `paymentLabel` ReferenceError in separate `OrderDetails` component → fixed by computing inside component

### Restoran Ürünler Yetki Fix (2026-04-06)
- **Sorun**: `products.py` router'ı `require_admin` ile korunuyordu → restoran kullanıcıları ürün ekleyemiyor ve göremiyordu
- **Fix**: Router dependency `require_admin` → `require_auth` olarak değiştirildi
- Restoran kullanıcıları artık kendi ürünlerini görüntüleyebilir, ekleyebilir, düzenleyebilir ve silebilir

## Pending Issues
- (P1) "Neden AgrosJet?" statik metin güncellemesi (Kurye kayıt sayfaları) - 5x ertelendi
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
