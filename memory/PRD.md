# AgrosJet Delivery Management Platform - PRD

## Original Problem Statement
Multi-tenant delivery management platform for restaurants, couriers, and administrators. Supports order management, courier tracking, integration with platforms (Trendyol, Migros, Getir, Yemeksepeti, Adisyo), and real-time operations.

## Core Architecture
- **Backend**: FastAPI + MongoDB
- **Frontend**: React + Shadcn UI
- **Storage**: Cloudflare R2
- **Notifications**: Expo / Firebase Push
- **SMS**: VatanSMS API

## What's Been Implemented

### Completed Features
- Courier login company_id resolution via junction table
- R2 logo direct byte streaming (replaces presigned URLs)
- Migros webhook auto-approve routing fix
- Getir integration production URL + POS activation fix
- Admin permissions sub-tab visibility fix
- Courier Collection (Kurye Hesap Al) feature with business-day filtering
- Admin toggle for courier_collection_enabled per restaurant
- Courier orders page "Siparisleri Yenile" refresh button with 5s countdown rate limit
- Courier Ihlaller (violations) page minimal redesign
- AgrosAI Rota tab name simplified
- Courier Odeme Raporu: Sirket/Restoran tabs (collector param), verildi/verilmedi status, business-day default date
- Online/Yemek karti collection status hidden (not applicable for restaurant collection)
- Restaurant delivery fee fix: uses pricing settings instead of courier_fee
- KDV fix: uses restaurant kdv_rate instead of hardcoded 10%
- POS commission: only shown when card collection is by company (not restaurant)
- Admin permissions auto-refresh on page load (GET /api/admins/{id}/permissions)
- Admin toggle-status auth fix (require_admin instead of require_super_or_system)
- PDF company logo fix (uses companyLogo prop directly, no auth-required fetch)
- Auto-processing schedules: dynamic closing_time + 1 hour (fatura, mutabakat, hakedis)
- VatanSMS integration: sms_service.py + system settings UI + test SMS
- **Courier Document Upload & Registration Revamp (P0)** - COMPLETED 2026-04-08:
  - Courier login allows login without company assignment (for onboarding flow)
  - TC Kimlik No field added to courier registration form
  - Scroll-enforced contract view with dynamic company variables
  - E-signature canvas (react-signature-canvas) for contract signing
  - PDF generation (reportlab) with embedded e-signature
  - Contract PDF uploaded to Cloudflare R2
  - Routing guard: forces couriers to /evraklar if contract/fesih not accepted
  - Admin panel: contract status (Onayli/Bekliyor) + PDF view button in courier detail modal
  - Document upload step (Step 3) after contract + fesih acceptance
  - Contract settings management via Admin API (/api/contracts/settings/{company_id})
  - **Fesih Şartları (Termination Conditions)** step added as Step 2:
    - 5 descriptive articles with dynamic company variables
    - Explicit checkbox confirmation required
    - Variables: fesih_tazminat, fesih_bildirim_suresi, fesih_bildirim_telefon, yetkili_mahkeme
    - POST /api/contracts/fesih-accept/{courier_id} endpoint
  - **Admin Document Management** - COMPLETED 2026-04-08:
    - Courier "Süreci tamamladınız" success screen when all 7 docs uploaded + contract + fesih accepted
    - Admin Panel Evraklar tab: Contract/Fesih status display with Sıfırla (Reset) buttons
    - Admin Panel: "Tek PDF" merged download button (combines images+PDFs into single PDF using reportlab+pypdf)
    - Admin Panel: "ZIP" download button for all docs
    - Admin Panel: "Evrakları Sıfırla" button (deletes uploaded docs except contract)
    - Backend endpoints: POST /api/contracts/reset-contract/{id}, reset-fesih/{id}, reset-documents/{id}
    - Backend endpoint: GET /api/documents/courier/{id}/download-merged-pdf
  - **Document Process Control System** - COMPLETED 2026-04-09:
    - Admin toggle (document_process_completed) per courier in CourierDetailModal
    - Restricted mode: When toggle OFF, courier sees only Evraklar + Logout, no bottom bar, no status dropdown
    - Full mode: When toggle ON, courier has full app access
    - Default: false when courier added to company
    - Removed old startup migration that auto-approved existing couriers
    - Backend endpoint: PUT /api/couriers/{id}/document-process

## Completed - Login Page Split (2026-04-09)
- Split unified LoginPage into LoginSelectorPage (/login), AdminLoginPage (/admin-login), RestaurantLoginPage (/restoran-login)
- Old LoginPage.jsx deleted, App.js routing updated
- All logout flows redirect to /login (selector page)
- Courier login (/courier-login) unchanged

## Completed - Adisyo Webhook Delivered-Without-Courier Fix (2026-04-24)
- **Bug**: Adisyo `order.updated` webhook with `statusId=5` (Teslim Edildi) could set order to "delivered" even when no courier was assigned (`courier_id` is null). This happened when order was in "preparing" status.
- **Fix**: Added `courier_id` check in both `adisyo_webhook.py` (process_order_event) and `adisyo_service.py` (sync function). If `delivered` comes from Adisyo but no courier is assigned, the update is blocked and logged. `cancelled` status is still allowed without courier assignment.
- **Fix 2**: Webhook handler and sync function now write `status_history` entries with `actor_type: "adisyo_webhook"` / `"adisyo_sync"` and `actor_name: "Adisyo"`. Previously no history was recorded, making it impossible to distinguish Adisyo-triggered changes from courier actions.
- **Files changed**: `/app/backend/routers/adisyo_webhook.py`, `/app/backend/services/adisyo_service.py`

## Completed - Paket Havuzu (Order Pool) System (2026-04-24)
- **New Feature**: Couriers can see unassigned orders in a pool and claim them.
- **Backend**: New router `/api/pool/` with settings CRUD, pool orders listing (filtered by status, prep time threshold, courier distance), and claim endpoint (assigns + auto-confirms to `confirmed`).
- **System Settings**: "Paket Havuzu" collapsible card added below auto-dispatch. Settings: enabled toggle, show_pending/show_ready checkboxes, pending_threshold_minutes, max_courier_distance.
- **Courier Permissions**: `pool_access` toggle added to permissions modal in KuryelerPage.
- **Courier Panel**: 2-tab (Liste/Rota) → 3-tab (Havuz/Siparişlerim/Rota). Pool tab shows available orders with "Üzerime Al" button, package limit enforcement, distance display.
- **Files**: `/app/backend/routers/pool.py` (new), `server.py`, `SistemPage.jsx`, `KuryelerPage.jsx`, `CourierSiparisPage.jsx`, `couriers.py`

## Completed - Konum Düzeltme Sistemi (2026-04-29)
- **New Feature**: Admin teslim edilmiş siparişlerin GPS konumlarını harita üzerinden düzeltebilir.
- **Auto-Correction**: Düzeltilen konum `address_corrections` havuzuna kaydedilir. Aynı müşteri adı + adres ile yeni sipariş geldiğinde otomatik doğru konum atanır.
- **Filtreler**: Sadece Adisyo/SepetTakip/Manuel siparişler (marketplace hariç)
- **Hook**: `insert_order()` merkezi fonksiyonunda auto-correction devreye girer
- **Files**: `/app/backend/routers/location_corrections.py`, `/app/backend/services/credit_service.py`, `/app/frontend/src/components/admin/LocationCorrectionModal.jsx`, `GecmisSiparislerPage.jsx`

## Pending Issues (Prioritized)
(P2 görevleri kullanıcı tarafından kalıcı olarak iptal edildi — yapılmayacak)

## Upcoming/Future
- Nilvera e-Fatura entegrasyonu (analiz tamamlandi, tevkifat destekli) — P1
- Native Courier App improvements (Map / Proximity Engine)
- Yemeksepeti Chrome extension
- "Stop Count" capacity logic
- Caller ID integration

## Recent Fixes (2026-02)
- Getir webhook order_id=None hatasi: ID icin fallback alanlari eklendi (id, orderId, _id, clientOrderId, order_id). Tam payload integration_logs.data alanina yaziliyor (debug icin). Bos/ping istekleri 500 yerine 200 donuyor. Test: /app/backend/tests/test_getir_webhook_id_fallback.py
- Kesilen Faturalar geçen hafta TypeError: Restoran pricing alanları None olunca patlama düzeltildi (issued_invoices.py — None-safe pattern).
- Paket onaylanmama cezası: dispatcher.add_shift_violation artık apply_penalty_if_needed çağırıyor → ceza/transaction otomatik oluşuyor. Test: /app/backend/tests/test_package_not_confirmed_penalty.py
- **Kurye Mütabakat 1000+ teslim bug'ı (2026-05-10, P0)**: 1111 teslim edilen siparişi olan kurye (Nazif Toprak) Cumartesi 299.95₺ nakit (Fast Coffee) admin ekranında görünmüyordu. `daily_mutabakat.py:get_order_totals_for_courier` ve `get_courier_orders_detail` `to_list(1000)` ile sınırlanıp en eski 1000 sipariş çekildiği için son günler düşüyordu. Fix: query'ye `delivered_at` ISO string range filter + `to_list(None)`. Regression test: `/app/backend/tests/test_daily_mutabakat_high_volume_courier.py`
- **Payout "Tamamlanmamış mütabakat" sahte engel bug'ı (2026-05-10, P0)**: `payout_requests.py:_check_unprocessed_collections` o gün sipariş yapılmış AMA mütabakata düşen tutar 0 olan günleri (örn. tüm siparişler `cash_collection: restaurant` olan restoranlardan veya hepsi online) yanlışlıkla "blocked" sayıyordu. Nazif için 10 gün sahte engelden 2 gerçek alınmamış güne düşürüldü. Fix: her unprocessed day için `get_order_totals_for_courier` çağırılır, `cash_total + card_total + meal_card_total > 0` olan günler engelleyici sayılır (Kurye Mütabakat sayfası ile birebir aynı `restaurant_collection_map` filtresi). Regression test: `/app/backend/tests/test_payout_unprocessed_zero_settlement.py`
- **Admin "Beni Hatırla" gerçek anlamda 30 gün (2026-05-10)**: Daha önce JWT her durumda 72 saat geçerliydi → "Beni Hatırla" işaretli olsa bile 3 gün sonra kullanıcı 401 ile logout oluyordu. Fix: `jwt_utils.create_token`'a `remember_me` parametresi eklendi (True → 720 saat = 30 gün, False → 72 saat). `AdminLogin` modeline `remember_me: bool = False` field, `AdminLoginPage.jsx` POST body'sine `remember_me` flag eklendi. Curl testi: True → 720h, False → 72h ✅. Frontend e2e test: PASS ✅

## NEW: Kurye Ödeme Profili Sistemi (2026-05-12, AYRI ENTEGRASYON)
- Kuryelere 5 ayrı ödeme profili: Profil 1 = Standart (mevcut alanlar, backward-compat), Profil 2-5 = `couriers.pricing_profiles` dict'inde tutulur.
- Her restoran `restaurants.courier_pricing_profile` (1-5, default 1) field'ı ile hangi profili kullanacağını seçer.
- Sipariş kuryeye atandığında `services/courier_pricing_service.get_courier_pricing_for_order(courier, restaurant_id)` çağrılır → restoranın profil no'su → kurye'nin o profilindeki tarife.
- Konfigüre değilse otomatik Profil 1'e sessiz fallback (hata göstermez).
- **Yeni endpoint'ler**:
  - `GET /api/couriers/{id}/pricing-profiles` (5 profilin tamamı)
  - `PUT /api/couriers/{id}/pricing-profiles/{n}` (n=1..5)
  - `DELETE /api/couriers/{id}/pricing-profiles/{n}` (sadece n>=2)
  - `PUT /api/restaurants/{id}/courier-pricing-profile` body `{profile: 1-5}`
  - `GET /api/restaurants/{id}/courier-pricing-profile`
  - Legacy `PUT /api/couriers/{id}/pricing` ve `GET /api/restaurants/pricing/{id}` korunuyor (response'a `courier_pricing_profile` int eklendi).
- **Frontend UI**:
  - `KuryelerPage.jsx`: Ücretlendirme modal'ında 5 sekme (P1 Std, P2, P3, P4, P5). Tab değişince form alanları o profilden hidrate olur, mevcut form cache'lenir.
  - `RestoranlarPage.jsx`: Ücretlendirme modal'ın en üstüne mavi "Kurye Ödeme Profili" kartı + dropdown eklendi.
- **tiered_pricing_service**: Kademeli kaydırma artık her sipariş için kendi restoranının profilini okur (multi-profil-aware).
- **Test**: 5 pytest unit + 10 HTTP integration test + 9 senaryolu tip kilitleme testi PASS (test_courier_pricing_profile.py + test_courier_pricing_profile_http.py + test_courier_pricing_type_lock.py).
- **Tip kilitleme (2026-05-12 sonradan eklendi)**: Profil 1 `tiered` ise tüm profillerin `tiered` olması ZORUNLU; Profil 1 `tiered` DEĞİL ise P2-P5 `tiered` OLAMAZ. Backend 400/409 hatası, frontend RadioGroup disabled+uyarı banner.
- **Risk yönetimi**: Mevcut sipariş akışı için Profil 1 her zaman default — `courier_pricing_profile` field'ı olmayan eski restoranlar otomatik Profil 1 kullanır → 0 regression.

## NEW: Adisyo Chrome Extension Köprüsü (2026-05-10, AYRI ENTEGRASYON)
- Adisyo'nun entegrasyon vermediği restoranlar için (örn. Terra Pizza) ek yol.
- **Backend (yeni, AYRI)**: `/api/adisyo-scrape/orders` endpoint'i, `routers/adisyo_scrape.py`. Mevcut Adisyo webhook entegrasyonuna dokunmadan paralel çalışır.
- **Source ayrımı**: webhook'tan gelen siparişler `source: "adisyo"`, Chrome extension'dan gelenler `source: "adisyo_scrape"`. İkisi karıştırılmaz; aynı `adisyo_order_id` her iki kanaldan gelse de duplicate olmaz.
- **Idempotent upsert**: `adisyo_order_id` unique anahtar; kurye atanmış (`assigned/confirmed/on_the_way/delivered`) statüde ezilmez, iptal her zaman uygulanır.
- **Items minimal**: Ürün listesi çekilmez (kullanıcı talebi); her sipariş tek satır "Adisyo Siparişi" + total_amount.
- **Field mapping**: `restaurantCustomer.{name,surname,phone,address,note,town}` → ShiftJet customer fields, `paramObject.coordinate` "lat,lng|..." → delivery_location, `paymentTypeName` → payment_method, `externalAppId` (15=Trendyol, 21=YS DeliveryHero, 9=Getir) human-readable.
- **Chrome Extension** (`/app/chrome_extension/agrosjet-adisyo-bridge/`): Manifest v3, MAIN-world content.js XHR/fetch hook, ISOLATED bridge.js postMessage bridge, background.js service worker config + POST forward, popup.html ayarlar (backend_url + restaurant_id + bearer token).
- **Test**: 3 pytest PASS (`test_adisyo_scrape.py` — payload convert, idempotency, kurye atanmış ezme koruması).
- **v1.5 güncellemesi (2026-05-11)**:
  - Backend: `preparation_time` (restoran default) + `preparation_end_at` (created_at + prep_time) otomatik set ediliyor → frontend countdown çalışır.
  - Backend: restaurant-users login endpoint'ine `remember_me=true` → 30 günlük token.
  - Backend: Restoran user rolü için cross-restaurant erişim kontrolü (403).
  - Extension: Restoran user (admin değil) ile direkt login, dropdown'lar kaldırıldı, sadece 2 alan.
  - Extension: WebSocket/SignalR hook eklendi + 20 sn periyodik polling → F5'siz otomatik akış.
  - Extension: Network hataları için try/catch + verbose console logging.
  - Extension: AgrosJet logosu (16/32/48/128) eklendi.
  - Extension: `https://api.agrosjet.app` hardcoded.

## NEW: Kurye Ödeme Talep Sistemi (2026-02)
- **Otomatik hakediş**: Sipariş "delivered" → courier_fee transaction olarak yazılır (type="earning", idempotent). Cancel/revert çalışıyor.
- **Yeni transaction tipi**: `earning` (accounting_service tüm aggregations'larında payment_in/received gibi total_in tarafında).
- **Yeni koleksiyon**: `payout_requests` (kurye talepleri, fatura zorunlu, status: pending|approved).
- **Yeni endpoint'ler**: `/api/payout-requests/courier/{id}/can-request|history`, `/courier/{id}` (POST), `/company/{id}`, `/{id}/invoice|approve`.
- **Kurallar**: min 1000 TL, 24h cooldown, mütabakat blokeri (kuryenin sipariş gününde işlenmemiş kayıt yoksa), bakiye ≤ talep, sadece PDF fatura.
- **Yüzdeli Taksit (yeni)**: `installment_products.installment_type="percent"` + `total_amount` + `withdrawal_percent`. Onay sırasında otomatik kesilir, kalan borçtan büyük olamaz. Eski "fixed" tip korundu (geri uyumlu).
- **Onay flow**: Admin manuel approved_amount girer → (varsa) %x taksit kesintisi + payment_out cash → 2 transaction yazılır. Push notification gönderilir.
- **Audit-trail**: admin_id/name approve sırasında JWT token'dan alınır (Form yerine). Kurye route'larında ownership kontrolü.
- **UI**: Kurye Muhasebe sayfasında "Ödeme İste" butonu + modal. Admin Muhasebe → "Ödeme Talepleri" hibrit sekme (Bekleyen + Onaylanmış, fatura preview, onay modal).
- **Test**: 18-test pytest suite + 2 native test, hepsi PASS. /app/backend/tests/test_payout_full_pytest.py

## Key API Endpoints
- POST /api/auth/courier/login (returns contract_accepted, fesih_accepted, document_status)
- GET /api/companies/logo/{filename}
- GET /api/contracts/status/{courier_id} (returns accepted, fesih_accepted)
- GET /api/contracts/preview/{courier_id} (returns text, company_name, fesih data)
- POST /api/contracts/accept/{courier_id}
- POST /api/contracts/fesih-accept/{courier_id}
- GET /api/contracts/pdf/{courier_id}
- GET/POST /api/contracts/settings/{company_id}
- POST /api/contracts/reset-contract/{courier_id}
- POST /api/contracts/reset-fesih/{courier_id}
- POST /api/contracts/reset-documents/{courier_id}
- GET /api/documents/courier/{courier_id}/download-merged-pdf
- GET /api/restaurant-collections/courier-balances
- POST /api/restaurant-collections/collect
- PUT /api/restaurants/collection-settings/{restaurant_id}
- GET /api/reports/courier/payments (collector=company|restaurant)
- GET /api/reports/courier/business-day (company_id)
- GET /api/admins/{admin_id}/permissions
- POST /api/admins/{admin_id}/toggle-status
- GET/POST/PUT /api/system-settings/vatansms
- POST /api/system-settings/vatansms/test

## 3rd Party Integrations
- Trendyol, Migros, Getir, Yemeksepeti, Sepetapp, Adisyo (Order Integrations)
- Cloudflare R2 (Storage)
- Expo / Firebase (Push Notifications)
- VatanSMS (SMS - API ayarlari sistem panelinden girilir)
- Nilvera (e-Fatura - henuz entegre edilmedi, analiz tamamlandi)

## CHANGELOG
- 2026-02: JetCüzdan earning açıklaması güncellendi: `İşletme Adı - Müşteri Adı siparişi hakediş` formatı (`services/courier_earning_service.py`). Müşteri adı boşsa `İşletme Adı siparişi hakediş` olarak kaydedilir. Test: `tests/test_courier_earning_description.py`.
- 2026-02: Otomatik atamaya **Restoran Grubu Minimum Mesafe Kuralı** eklendi. Sistem Ayarları → Otomatik Atama → "Restoran Grubu Min. Mesafe" kartı. Toggle açıkken yeni paketin VEYA mevcut paketlerin restoran→teslimat mesafesi belirlenen değerin (varsayılan 3500m) altındaysa, restoranlar aynı grupta olsa bile pickup birleştirme yapılmaz. Sadece yolda paketi olmayan kuryeler için uygulanır. Dosyalar: `services/auto_dispatch/config.py`, `routers/auto_dispatch.py`, `services/auto_dispatch/courier_selection.py`, `services/auto_dispatch/dispatcher.py`, `pages/SistemPage.jsx`. Test: `tests/test_group_min_distance.py`.
- 2026-02: **Onay bekleyen sipariş için 60sn'de bir tekrar push bildirimi** eklendi. Kurye "Siparişi Gördüm"e basana kadar her 60 saniyede bir hatırlatma push'u gönderilir (`isReminder: True`). Auto-cancel açıksa timeout dolduktan sonra hatırlatma durur (paket zaten geri alınacak); kapalıysa süresiz devam eder. Order modeline `last_reminder_sent_at` alanı eklendi; yeniden atamada ve geri almada sıfırlanır. Dosyalar: `services/auto_dispatch/dispatcher.py` (`send_reminders_to_unconfirmed_couriers`), `routers/orders.py` (`assign_courier_core`). Test: `tests/test_unconfirmed_reminder.py`.
- 2026-02: **Admin Sipariş Yönetimi → Kurye Detay Modalı mobil scroll fix**. `DialogContent` `overflow-hidden` yerine `max-h-[90vh] overflow-y-auto`, sipariş listesinin `max-h-[310px]` sınırı sadece `sm:` ve üstüne uygulandı; mobilde tüm modal dış scroll yapıyor, en alttaki siparişler artık görüntülenebiliyor. Dosya: `components/siparis/CourierDetailModal.jsx`.
- 2026-02: **Kurye Detay Modalı → Bugünkü Paket Sayısı badge'i**. Şirket iş günü (bugün opening_time → yarın closing_time) boyunca kuryenin toplam paket sayısı (yoldakiler + teslim edilenler + diğer aktif durumlar dahil, iptaller hariç) "Bugünkü Çalışma" satırında indigo bir pill olarak gösteriliyor. Backend: `GET /api/couriers/{courier_id}/today-package-count?company_id=...` (`routers/couriers.py`). Frontend: `CourierDetailModal.jsx` 30sn aralıkla polling. Test: `tests/test_today_package_count.py`.
- 2026-02: **Vardiya İhlal kontrolünde şirket iş günü (06:00–06:00) mantığı**. Eski kod `now.weekday()` kullanarak takvim gününü baz alıyordu; 06:00 öncesi (Çar→Per gece 02:00 gibi) ihlal kontrolünde **yanlış güne** bakılıyordu. Yeni `utils/business_day.py` helper'ı (`get_business_day_key`, `compute_business_date`) şirketin `opening_time` ayarına göre iş günü weekday'ini hesaplıyor. `routers/shift_violations.py:check_and_log_violations_internal` ve `utils/shift_scheduler.py:check_shift_start_violations` bu helper'ı kullanacak şekilde güncellendi. Test: `tests/test_business_day.py` (5 senaryo: cutoff öncesi/sonrası, custom opening_time 04:00/08:00, DB read fallback) PASSED.
- 2026-02: **Adisyo entegrasyonu için zenginleştirilmiş API log sistemi**. `services/adisyo_service.py` içinde `mark_adisyo_order_prepared`, `mark_adisyo_order_on_delivery`, `mark_adisyo_order_delivered`, `cancel_adisyo_order` fonksiyonları her çağrıda `save_integration_log("adisyo", ...)` ile MongoDB `integration_logs` koleksiyonuna yazıyor: endpoint, restaurant_id, adisyo_order_id, request_body, response_status_code, response_body, exception bilgileri dahil. `GET /api/integration-logs` endpoint'i `data` alanını da döndürüyor. Frontend `components/admin/IntegrationLogsModal.jsx` her log satırı altında "İstek/Yanıt detayı" expandable details ile JSON gösteriyor.
- 2026-02: **Sipariş Yönetimi → Tel siparişleri için telefon logosu**. `source: "manual"` (tel/manuel) siparişleri için yeşil daire içinde beyaz telefon ikonu eklendi (`public/images/platforms/phone.png`, 512×512). `SiparisYonetimiPage.jsx` tablo ve kart görünümünde `manual` → `phone` eşlemesi yapıldı; boyut diğer platform logolarıyla aynı (`w-4 h-4 rounded-full object-cover`).
- 2026-02: **Sipariş modalı → Konum Düzenle adres aramada modal kapanma fix**. `components/siparis/OrderDetailModal.jsx` `DialogContent`'e `onPointerDownOutside` ve `onInteractOutside` handler'ları eklendi; tıklanan target `.pac-container` (Google Places öneri listesi `document.body` altına eklenir, Radix bunu "dışarı" sayıyordu) içindeyse `e.preventDefault()` çağrılır. Masaüstünde öneriye tıklayınca artık modal kapanmıyor; mobil davranış değişmedi.
- 2026-02: **Kurye Günlük Mütabakat → online ödemeler kart kovasından çıkarıldı**. `routers/daily_mutabakat.py` içinde tek-ödeme dalında `payment_method == "online"` kart kovasına dahil ediliyordu; kurye hiç tahsil etmediği online tutar için kart borcu görünüyordu. Düzeltme: online için ayrı bir `elif` dalı eklendi (`pass` — hiçbir kovaya yazılmaz, sayım'a dahil), kart koşulundan "online" anahtarı çıkarıldı. Aynı düzeltme `get_courier_orders_detail` içinde sipariş listesi için de uygulandı. `online_meal_card` davranışı korundu (meal_card dalı önce eşleşiyor). Test: `tests/test_online_excluded_mutabakat.py`.

- 2026-02: **Görev Yönetimi (Tasks) sistemi**. Bildirim modalı 3 ayrı butona ayrıldı: Bildirimler / Talepler (mola talepleri) / Görevler. Süperadmin admin'lere ve kendine görev atayabilir (çoklu seçim → her admin için kopya), admin'ler birbirine atayamaz. Görevlerde opsiyonel `due_date`, `is_urgent` etiketi; tamamlanmamış geciken görevlere "GECİKEN" rozeti. Admin tamamlarken not + max 3 resim ekleyebilir; resimler R2'ye `tasks/{company_id}/{admin_id}/{task_id}/...` yoluna yüklenir. Yeni görev geldiğinde admin tarayıcısında 3-tonlu bildirim sesi + badge artar (15sn polling). Süperadmin sekmeleri: Görevlerim / Bekleyen Görevler / Tamamlananlar (admin filtresiyle). Admin sekmeleri: Görevlerim / Tamamlananlar. Backend: `routers/tasks.py` (POST/GET/PATCH/DELETE + `/badge-count` + `/admins/list`). Frontend: `TasksPopover.jsx`, `RequestsPopover.jsx`, `NotificationsPopover.jsx` (tek-tab haline getirildi). Yetki kuralları (create/assigned_by_me/admins/list/complete/delete) curl ile uçtan uca doğrulandı.

