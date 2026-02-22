# AgrosJet - Kurye Yönetim Sistemi PRD

## Original Problem Statement
Kurye yönetim sistemi için admin reconciliation özelliği ve admin-kurye bağlantı sistemi geliştirilmesi. Ayrıca aylık bazlı restoran fatura sistemi.

## Core Requirements
1. Admin hesaplarının kurye hesaplarına bağlanması (Admin-as-Courier)
2. Adminlerin aktif çalışma sürelerinin kurye sistemi üzerinden takibi
3. Admin hakedişlerinin bağlı kurye hesabı üzerinden yönetilmesi
4. Cariler'de admin-kurye hesaplarının doğru gösterimi
5. Aylık restoran fatura sistemi (4 kartlı tasarım)
6. Vardiya İhlalleri takip sistemi

## What's Been Implemented

### Session: 2025-02-22 (Latest)
- **Durum Hareketleri (Status Movements) Modal Eklendi:**
  - Vardiya Yönetimi sayfasına "Hareketler" butonu eklendi
  - Kurye ve Yönetici durum değişikliklerini (Aktif, Offline, Molada) gösteren modal
  - Günlük tarih seçici ile geçmiş günlere bakabilme
  - Kişi bazında filtreleme
  - Backend: `/api/status-movements/{company_id}` endpoint oluşturuldu
  - Frontend: `StatusMovementsModal.jsx` component oluşturuldu

- **Vardiya Yönetimi Sayfası Yeniden Tasarlandı:**
  - Sayfa adı "Vardiyalar" -> "Vardiya Yönetimi" olarak değişti
  - Üstte "Vardiya Takibi" kartı (Güncel Durum'dan taşındı)
  - Altta "Vardiya Yönetimi" kartı (mevcut atama tablosu)
  - "Vardiya İhlalleri Geçmişi" modalı eklendi (Kuryeler/Yöneticiler sekmeleri)
  - Backend: `/api/shift-violations/` endpoint'leri oluşturuldu
  - İhlal türleri: Vardiyası başladı ama aktif değil, Vardiyası yok ama aktif, Vardiya bitmeden çevrimdışı, Mola limitini aştı
  - Kurye/yönetici bazlı filtreleme
  - Superadmin için silme özellikleri

- **Restoran Fatura Sistemi Tamamlandı:**
  - 4 kartlı tasarım (Ay Faturaları, Eksik Faturalar, Restoranlar, Restoran Faturaları)
  - WhatsApp ile hatırlatma özelliği
  - Eksik fatura kaydı silme (superadmin)
  - Kurye eksik fatura kartına da WhatsApp hatırlatma modal tasarımı eklendi

- **Yönetici Saatlik Ücret Düzeltmesi:**
  - Yönetici düzenleme modalından gereksiz "Saatlik Ücret" alanı kaldırıldı
  - Tablodaki değer artık bağlı kuryenin saatlik ücretinden alınıyor

### Session: 2025-02-22
- **Bug Fix:** Cariler'de admin-kurye bakiyelerinin gösterilmemesi sorunu düzeltildi
  - `GET /api/transactions/vendor/{id}` admin_courier_ prefix kontrolü eklendi
  - `POST /api/transactions` admin-kurye için entity dönüştürme eklendi
  - Frontend `is_admin_courier` flag düzeltmesi

### Previous Sessions
- **Admin-Kurye Bağlantı Sistemi:** Admin hesaplarını kurye hesaplarına bağlama
- **Kurye Aktif Süre Hesaplama:** `courier_daily_active` collection ile doğru süre takibi
- **Haftalık Hakediş:** Admin-kuryeler için ayrı tablo
- **Yöneticiler Sayfası:** Kurye bağlama UI
- **Fatura Uyarıları:** Superadmin için silme özelliği

## Architecture

### Key Collections
- `courier_daily_active`: Günlük aktif süre takibi
- `couriers`: `is_admin_linked` flag eklendi
- `users (admin)`: `linked_courier_id`, `hourly_rate` eklendi
- `restaurant_invoices`: Restoran fatura kayıtları (haftalık bazda eksik fatura takibi)
- `restaurants`: `invoice_settings` eklendi (hangi ödeme yöntemleri için fatura gerekli)
- `restaurant_users`: `phone` alanı eklendi

### Key Endpoints
- `POST /api/admins/{id}/toggle-status`: Admin aktif/pasif durumu
- `PUT /api/admins/{id}`: Kurye bağlama
- `GET /api/weekly-hakedis/{company_id}`: Haftalık hakediş (admin flag ile)
- `GET/POST /api/transactions/vendor/{id}`: Admin-kurye desteği
- `GET /api/restaurant-invoices/{company_id}/missing`: Tüm eksik faturalar
- `GET /api/restaurant-invoices/{company_id}/month/{year}/{month}`: Ay faturaları
- `GET /api/restaurant-invoices/{company_id}/restaurants`: Fatura ayarı olan restoranlar
- `DELETE /api/restaurant-invoices/{company_id}/missing/{record_id}`: Eksik fatura kaydı silme
- `GET /api/shift-violations/{company_id}`: Vardiya ihlalleri listesi
- `GET /api/shift-violations/{company_id}/summary`: İhlal özeti
- `GET /api/shift-violations/{company_id}/entities`: İhlali olan kuryeler/yöneticiler
- `POST /api/shift-violations/{company_id}/check`: Manuel ihlal kontrolü
- `DELETE /api/shift-violations/{company_id}/{violation_id}`: İhlal kaydı silme

## Prioritized Backlog

### P0 - Critical
- [ ] Admin hakediş özelliği tam doğrulama (kullanıcı testi)

### P1 - High Priority
- [ ] Vardiya İhlalleri merkezi modalı
- [ ] Migros Yemek entegrasyonu
- [ ] Yemeksepeti entegrasyonu
- [ ] Restoran Raporları sayfası

### P2 - Medium Priority
- [ ] Eski muhasebe veri tutarsızlığı (entity_type: "business")
- [ ] Mobil dosya yükleme sorunu
- [ ] Native Kurye Uygulaması
- [ ] Chat sistemi
- [ ] Login sayfası refactor
- [ ] Google Maps entegrasyonu
- [ ] Karanlık mod

### P3 - Low Priority
- [ ] Redis caching
- [ ] Motosikletim geliştirmeleri

## 3rd Party Integrations
- Getir Yemek
- Adisyo
- Trendyol Yemek
- Yemeksepeti
- SepetTakip
- Migros Yemek
- Google Maps (Leaflet)

## Test Credentials
- Superadmin: `superadmin` / `123456`
