# AgrosJet - Kurye Yönetim Sistemi PRD

## Original Problem Statement
Kurye yönetim sistemi için admin reconciliation özelliği ve admin-kurye bağlantı sistemi geliştirilmesi.

## Core Requirements
1. Admin hesaplarının kurye hesaplarına bağlanması (Admin-as-Courier)
2. Adminlerin aktif çalışma sürelerinin kurye sistemi üzerinden takibi
3. Admin hakedişlerinin bağlı kurye hesabı üzerinden yönetilmesi
4. Cariler'de admin-kurye hesaplarının doğru gösterimi

## What's Been Implemented

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

### Key Endpoints
- `POST /api/admins/{id}/toggle-status`: Admin aktif/pasif durumu
- `PUT /api/admins/{id}`: Kurye bağlama
- `GET /api/weekly-hakedis/{company_id}`: Haftalık hakediş (admin flag ile)
- `GET/POST /api/transactions/vendor/{id}`: Admin-kurye desteği

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
