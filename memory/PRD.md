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
- Phase 1: Token generation + frontend interceptor
- Phase 2: Critical endpoints (system_settings, admins, backup) 
- Phase 3: Admin-only routers (34 files, ~268 endpoints)
- Phase 4: Shared routers (orders, couriers, companies, restaurants, etc.)
- Fixed CourierDashboard overwriting localStorage without token

### System Admin Role Fix (2026-03-29)
- Fixed auth.py role override: systemadmin → superadmin bug
- Priority chain: systemadmin > superadmin > admin["role"]

### Courier Reports Fix (2026-03-29)
- Performansım: default tab, first position, Bugün/Bu Hafta selector
- İhlallerim: entity_id param fix, added violation types
- UTC/Turkey timezone fix using getTurkeyNow()

### Other Fixes (2026-03-29)
- Restaurant phone enrichment in orders/v2/list
- Scroll reset on page navigation
- CompanySwitcher logo display (logo_dark > logo_light > logo_url)
- Raporlar sub-tab permissions in admin panel
- Default company selection for multi-company admins
- Google Places autocomplete on restaurant address form
- MongoDB backup test button in System panel

## Pending Issues
- (P1) "Neden AgrosJet?" statik metin güncellemesi (Kurye kayıt sayfaları)
- (P2) Webhook setup agrosjet.net ping hatası

## Turkish Character & Logo Visibility Fix (2026-03-30)
### CourierCards.jsx Türkçe Karakter Düzeltmeleri
- "Ucret" → "Ücret", "Odeme" → "Ödeme", "Duzenle" → "Düzenle"
- "Birlestir" → "Birleştir", "Fesih Iptal" → "Fesih İptal", "Cikar" → "Çıkar"
- "bulunamadi" → "bulunamadı"
### SistemPage.jsx Türkçe Karakter Düzeltmeleri
- "Ayni Bina Optimizasyonu" → "Aynı Bina Optimizasyonu"
- "Yakin teslimatlar icin kapasite artisi" → "Yakın teslimatlar için kapasite artışı"
- "Onaylanmayan Paket Iptali" → "Onaylanmayan Paket İptali"
- "Suresinde onaylanmayan atamalari iptal et" → "Süresinde onaylanmayan atamaları iptal et"
### Admin Panel Logo Bölümü Kaldırma
- "Logo (Koyu Arkaplan)" ve "Logo (Beyaz Arkaplan)" yükleme alanları Admin panel Sistem Ayarları'ndan kaldırıldı
- Logo yönetimi sadece /system master panelden yapılabilir
- Kullanılmayan state, ref, import ve fonksiyonlar temizlendi (handleLogoUpload, logoUploading, darkFileRef, lightFileRef)

## Upcoming Tasks
- ~~bcrypt password hashing migration~~ ✅ DONE (2026-03-29)
- ~~File upload size limits~~ ✅ DONE (2026-03-29)
- ~~General rate limiting~~ ✅ DONE (2026-03-29)
- ~~Native App konum/batarya JWT bypass~~ ✅ DONE (2026-03-29)
- Webhook setup agrosjet.net ping hatası (P2)
- Yemeksepeti Chrome extension (P2)
- "Stop Count" kapasite mantığı (P2)
- Caller ID entegrasyonu (P2)

## Native App JWT Bypass (2026-03-29)
### Sorun
Native app (Android/iOS) arka plan konum servisinden doğrudan backend API'ye istek atıyor.
WebView'daki axios interceptor'dan geçmediği için JWT token içermiyor → 401 Unauthorized.
### Çözüm
`PUT /api/couriers/{courier_id}/location` endpoint'i ayrı bir router'a (`courier_native.py`) taşındı.
Bu router JWT gerektirmez. Courier ID'nin DB'de var olup olmadığı kontrol edilir (404 koruması).
### Dosyalar
- `routers/courier_native.py` — JWT gerektirmeyen konum endpoint'i
- `routers/couriers.py` — Eski konum endpoint'i kaldırıldı
- `server.py` — Yeni router eklendi

## Polling Optimizasyonu (2026-03-29)
### Sorun
Kurye paneli 10sn'de bir 4 ayrı API çağrısı yapıyordu (checkCourierStatus, fetchAvailabilityStatus, fetchBreakStatus, fetchCourierBreakInfo). Bu, kurye başına 26 istek/dk demek. 30+ kuryede rate limit aşılıyordu.
### Çözüm
Yeni birleşik `GET /api/couriers/{courier_id}/poll` endpoint'i oluşturuldu. Tek istekte:
- `availability_status` (aktif/molada/çevrimdışı)
- `break_status` (limit, kullanılan, kalan, molada mı)
- `should_logout` (pasif mi, başka cihaz mı)
- `resend_token` (push token yenilenmeli mi)

Sonuç: **4 istek → 1 istek** = %75 azalma. Kurye başına 26 → 8 istek/dk.
### Kapasite Etkisi
| Senaryo | Önce | Sonra |
|---------|------|-------|
| 30 kurye | 1041/dk (🔴 limit) | ~297/dk (✅ rahat) |
| 50 kurye | 1717/dk (🔴 ciddi) | ~477/dk (✅ rahat) |
### Dosyalar
- `routers/couriers.py` — Yeni `/poll` endpoint'i
- `CourierDashboard.jsx` — startPolling + loadInitialData yeniden yazıldı
### Dikkat
Mevcut tekil endpoint'lere (GET /couriers/{id}, GET /couriers/{id}/break-status, GET /auth/courier/{id}/check-status) DOKUNULMADI. Admin panel ve diğer bileşenler bunları kullanmaya devam eder.

## Admin Panel Kurye Liste/Matrix Senkronizasyon Düzeltmesi (2026-03-30)
### Sorun
Şirkete kurye eklendiğinde: Kurye matrix görünümüne geliyordu ama liste görünümüne gelmiyordu. İkinci ve sonraki kuryeler için sorun devam ediyordu. Matrix butonları (ödeme yöntemi toggle, max paket vs.) çalışmıyordu.
### Kök Neden
1. `useKuryeler.addCourier()` fonksiyonu `fetchCouriers()`'u await etmeden çağırıyordu → Liste henüz yenilenmeden modal kapanıyordu
2. `CourierMatrixView` bağımsız veri kaynağı kullanıyordu → Kurye ekleme sadece liste verisini yeniliyordu, matrix'i değil
3. `allowed_payment_methods` alanı DB'de null olduğunda ödeme toggle'ı başarısız oluyordu
### Çözüm
1. `addCourier()` ve `addGhostCourier()` artık `await fetchCouriers()` ile liste yenilemesini bekliyor
2. `CourierMatrixView`'a `refreshTrigger` prop'u eklendi — kurye ekleme/silme/deaktif/aktif işlemlerinde matrix de yenileniyor
3. `allowed_payment_methods` null kontrolü düzeltildi (`or` ile varsayılan değer atanıyor)
### Dosyalar
- `hooks/useKuryeler.js` — await fetchCouriers
- `pages/admin/KuryelerPage.jsx` — matrixRefreshTrigger state
- `components/admin/CourierMatrixView.jsx` — refreshTrigger prop
- `routers/couriers.py` — null payment methods fix

## Yük Testi (Load Test) Sistemi (2026-03-30)
### Genel
System Admin paneline gömülü yük testi aracı. Gerçek HTTP çağrıları ile kurye-sipariş döngüsünü simüle eder.
### Konfigürasyon
- Kurye sayısı: 50, 100, 200, 500
- Süre: 30, 60, 120, 180 saniye
- Her kuryeye 3 aktif sipariş
### Simülasyon İçeriği
- Kurye poll (her 10sn) — `GET /api/couriers/{id}/poll`
- Konum güncelleme (her 30sn) — `PUT /api/couriers/{id}/location`
- Sipariş onaylama → Yola çıkma → Teslim etme → Reset döngüsü (her 20sn)
- Sipariş listesi polling (her 15sn)
- Admin panel polling (kurye haritası + sipariş listesi)
### Veri Güvenliği
- Tüm geçici veriler `_loadtest: True` flag'i ile işaretlenir
- Test bitince otomatik temizlik
- Manuel "Temizle" butonu (crash durumları için)
### Metrikler
- Toplam/başarılı/başarısız/rate limited istek sayıları
- RPS (istek/saniye)
- Endpoint bazlı avg/P95/P99 yanıt süreleri
- RPS zaman serisi grafiği
- Kapasite tahmini
### Dosyalar
- `backend/services/load_test_service.py` — LoadTestRunner (singleton)
- `backend/routers/load_test.py` — API endpoint'leri
- `frontend/src/components/system/LoadTestPanel.jsx` — UI bileşeni
### Rate Limiting
- Load test endpoint'leri (`/api/load-test/*`) rate limiter'dan muaf
- Localhost (127.0.0.1) istekleri rate limiter'dan muaf (internal test trafiği)

## Security - Password Hashing (2026-03-29)
### Implementation
- Migrated from SHA-256 (hashlib) to bcrypt
- `hash_password()` now uses `bcrypt.hashpw()` with `bcrypt.gensalt()`
- `verify_password()` supports dual-hash: bcrypt ($2b$) and legacy SHA-256 (64 hex chars)
- Auto-upgrade: On successful SHA-256 login, hash is replaced with bcrypt in DB
- All 36 user accounts (4 admins, 22 couriers, 10 restaurant users) upgraded to bcrypt

### Affected Files
- `utils/helpers.py` - Core hash_password() and verify_password()
- `routers/auth.py` - Admin/Courier login + auto-upgrade
- `routers/restaurant_users.py` - Restaurant login + auto-upgrade
- `routers/profile.py` - Password change with auto-upgrade
- `routers/admins.py` - New admin creation
- `services/courier_service.py` - Courier password update
- `server.py` - System admin seeder

## Security - File Upload Limits (2026-03-29)
### Limits
| Tür | Limit | Dosyalar |
|-----|-------|----------|
| Logo | 5MB | companies.py |
| Fatura/Belge | 10MB | invoices.py, issued_invoices.py, restaurant_invoices.py, restaurant_panel_invoices.py, business_invoices.py, documents.py |
| Chat dosyası | 10MB | chat.py |
| Akademi görsel | 10MB | academy.py |
| Akademi video | 100MB | academy.py |
| Excel | 5MB | bulk_hakedis.py, daily_reports.py |
| DB Yedek | 500MB | backup.py |

### Implementation
- Tüm upload endpoint'lerinde `await file.read()` sonrası `len(content)` kontrolü
- Aşıldığında HTTP 413 (Payload Too Large) döner

## Security - Router Auth Fix (2026-03-29)
### Issue
Güvenlik güncellemesinde (Phase 4) toplam 9 router `require_admin` ile korunmuş ancak kurye panelinden erişim gereken endpoint'ler vardı. Kuryeler `role: "courier"` ile geldiğinden 401/403 alıyorlardı.

### Fix — Toplu 9 Router
`require_admin` → `require_auth` olarak değiştirildi:
- `motorcycles.py`, `zimmet.py`, `academy.py`, `documents.py`, `invoices.py` (ilk batch)
- `shifts.py`, `accounting.py`, `hakedis.py`, `break_system.py` (ikinci batch)

### Result
Hem admin hem kurye token'ları bu endpoint'lere erişebilir. Token olmadan 401 korunur.
### Global Middleware
- Custom `GlobalRateLimitMiddleware` in `server.py`
- **1000 istek/dakika/IP** tüm endpoint'lere uygulanır (DDoS koruması + kurye polling uyumlu)
- In-memory tracking, 5 dakikada bir stale IP temizliği
- Aşıldığında HTTP 429 döner

### Endpoint-spesifik (slowapi)
- Login: 5/dakika
- E-posta doğrulama: 10/dakika
- Şifre sıfırlama: 3/dakika

### Muaf Path'ler (Webhook/3.parti)
- `/api/getir/`, `/api/migros/`, `/api/sepettakip/`, `/api/adisyo/`, `/api/webhooks/`, `/api/external/`

## Key Files
- `/app/backend/utils/jwt_utils.py` - JWT token creation, validation, FastAPI dependencies
- `/app/backend/routers/auth.py` - Login endpoints + token generation
- `/app/frontend/src/utils/axiosConfig.js` - Axios interceptor for auth headers
- `/app/frontend/src/pages/CourierDashboard.jsx` - Token preservation in localStorage

## Credentials
- System Admin: `onurertas` / `Delivery32..`
- Company Admin: `admin` / `123456`
- Courier: `05550003201` / `123456`
