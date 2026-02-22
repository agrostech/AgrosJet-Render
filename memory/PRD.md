# AgrosJet - Kurye Yönetim Sistemi PRD

## Original Problem Statement
AgrosJet, restoran siparişlerini yöneten ve kurye dağıtım süreçlerini koordine eden kapsamlı bir kurye yönetim sistemidir. Sistem; sipariş takibi, kurye yönetimi, muhasebe işlemleri (mütabakat, tahsilat, hakediş) ve restoran entegrasyonlarını içerir.

## User Personas
- **Superadmin**: Tüm sistem yönetimi, muhasebe, kurye ve restoran yönetimi
- **Admin/Yönetici**: Şirkete bağlı operasyonlar, kurye koordinasyonu
- **Kurye**: Sipariş teslimi, mesai takibi
- **Restoran Kullanıcısı**: Sipariş takibi

## Core Requirements
1. Sipariş yönetimi ve takibi
2. Kurye atama ve mesai yönetimi
3. Muhasebe ve mütabakat işlemleri
4. Restoran entegrasyonları (Getir, Trendyol, Yemeksepeti, Adisyo, Migros)
5. Raporlama

---

## What's Been Implemented

### Session: 2026-02-22 - Kurye Mütabakatı Refaktörü

**Completed:**
- ✅ "Kurye Mütabakatı" (Günlük Mütabakat) sayfası tamamen refaktör edildi
- ✅ Checkbox ve toplu aksiyon butonları kaldırıldı
- ✅ Her kurye satırına bireysel "Kaydet" butonu eklendi (tahsilat + mütabakat tek seferde)
- ✅ Her satıra "Sıfırla" butonu eklendi (sadece superadmin için görünür)
- ✅ Backend'de yeni endpoint'ler oluşturuldu:
  - `POST /api/daily-mutabakat/{company_id}/save-and-process-single-courier`
  - `POST /api/daily-mutabakat/{company_id}/revert-single-courier`

### Previous Sessions (Completed)
- ✅ Yönetici Mütabakatı sayfası
- ✅ Cariler'de admin hesapları
- ✅ Yemek kartı entegrasyonu
- ✅ Business day/timezone bug fix
- ✅ Shift icon bug fix
- ✅ ShiftJet → AgrosJet rebranding

---

## Prioritized Backlog

### P0 (Critical)
- None currently

### P1 (High Priority)
- Migros Yemek entegrasyonu finalize
- Yemeksepeti entegrasyonu tamamlama
- Raporlar sayfası işlevselliği

### P2 (Medium Priority)
- Native Kurye Uygulaması
- Chat sistemi re-enable
- Google Maps entegrasyonu
- Dark Mode tema
- Geçmiş Siparişler sayfası refaktör
- Login sayfası refaktör

### P3 (Low Priority)
- Redis caching for order list
- Motosikletim özellik geliştirmeleri

---

## Known Issues (Not Started)
1. **Historical Accounting Data Inconsistency**: Old transactions with `entity_type: "business"` not showing
2. **Mobile File Upload Issue**: Recurring issue with file uploads on mobile devices

---

## Tech Stack
- **Frontend**: React, Tailwind CSS, Shadcn/UI
- **Backend**: FastAPI, Python
- **Database**: MongoDB
- **Integrations**: Getir, Trendyol, Yemeksepeti, Adisyo, SepetTakip, Migros

---

## Key Files Reference
- `/app/frontend/src/pages/muhasebe/GunlukMutabakatTab.jsx` - Kurye Mütabakatı UI
- `/app/backend/routers/daily_mutabakat.py` - Mütabakat backend logic
- `/app/frontend/src/pages/muhasebe/YoneticiMutabakatTab.jsx` - Yönetici Mütabakatı
- `/app/backend/routers/admin_mutabakat.py` - Admin mütabakat backend

---

## Credentials
- **Superadmin**: `superadmin` / `123456`
