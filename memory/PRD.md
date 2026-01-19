# ShiftJet Kurye Yönetim Sistemi - Product Requirements Document

## Original Problem Statement
Kapsamlı bir kurye yönetim sistemi. Temel özellikler:
- Kurye yönetimi (ekleme, düzenleme, fesih, arşivleme)
- Vardiya planlama
- Muhasebe (gelir/gider, taksitler, faturalar)
- Zimmet takibi
- JetPuan market sistemi
- Akademi (eğitim içerikleri)
- Bildirim sistemi
- E-posta bildirimleri

## User Personas
1. **Süper Admin**: Tüm şirketleri yönetir
2. **Şirket Yöneticisi**: Kendi şirketinin kuryelerini ve operasyonlarını yönetir
3. **Kurye**: Kendi verilerini görüntüler, eğitimleri izler

## Tech Stack
- Frontend: React + Tailwind CSS + Shadcn UI
- Backend: FastAPI (Python)
- Database: MongoDB

---

## What's Been Implemented

### December 19, 2025 - Session Updates

#### ✅ Completed: Detaylı Yetkiler (Granular Permissions)
- **44 adet granüler izin** 8 gruba ayrılarak implement edildi
- Gruplar: Sayfa Erişimi, Muhasebe, Kuryeler, Zimmet, Market, Akademi, Vardiya, Sistem
- Collapsible gruplar ve Switch ile toplu kontrol
- Migration endpoint ile mevcut adminler otomatik güncellendi
- Backend: `/app/backend/routers/admins.py`
- Frontend: `/app/frontend/src/pages/admin/YoneticilerPage.jsx`
- Test durumu: %100 başarı oranı

#### ✅ Completed: Onay Popupları (Confirmation Modals)
- **22 adet window.confirm()** çağrısı `ConfirmModal` bileşeni ile değiştirildi
- AlertDialog shadcn UI kullanılarak tutarlı modal deneyimi sağlandı
- 3 variant: `default`, `danger` (kırmızı), `warning` (amber)
- Test durumu: %100 başarı oranı (testing agent tarafından doğrulandı)

#### ✅ Completed: Akademi Modülü
- Admin: Video/metin eğitim materyali yükleme ve yönetim
- Kurye: Eğitimleri görüntüleme
- Video streaming desteği
- Backend: `/app/backend/routers/academy.py`
- Frontend: `/app/frontend/src/pages/admin/AkademiPage.jsx`, `/app/frontend/src/pages/courier/CourierAkademiPage.jsx`

#### ✅ Completed: Yedekleme (Backup) Modülü
- Manuel veritabanı export (ZIP formatında)
- Otomatik günlük yedekleme ayarları
- E-posta ile yedekleme gönderimi
- Backend: `/app/backend/routers/backup.py`
- Frontend: `SistemPage.jsx` içinde collapsible kart

#### 📋 Previous Session Completions
- Refactoring: `KuryelerPage.jsx`, `FaturalarTab.jsx`, `couriers.py` 
- Toplu Hakediş Excel parsing ve mobil uyumluluk
- Bildirim sistemi iyileştirmeleri
- JetPuan siparişler listesi yeni tasarım
- Shift kartları collapsible yapıldı

---

## Prioritized Backlog

### P0 - Critical (Next Up)
1. **Detaylı Yetkiler (Granular Permissions)**
   - Status: ✅ COMPLETED (December 19, 2025)
   - 8 izin grubu implement edildi
   - Migration endpoint oluşturuldu ve mevcut adminler güncellendi
   - Test: %100 başarı oranı

### P1 - High Priority
2. **Import/Restore Functionality**
   - Yedekleme modülünde geri yükleme özelliği eksik
   - Backend TODO olarak işaretli

3. **Dosya Depolama Çözümü**
   - Video ve belge yüklemeleri için kalıcı depolama gerekli
   - Mevcut: Geçici `/app/uploads` dizini

### P2 - Medium Priority
4. **Kalan Büyük Dosyaların Refactoring'i**
   - `GuncelDurumPage.jsx` (497 satır)
   - `SistemPage.jsx` (455 satır)
   - `invoices.py` (468 satır)
   - `zimmet.py` (454 satır)

5. **Otomatik Yedekleme Scheduler**
   - Background task olarak günlük yedekleme çalıştırma
   - APScheduler veya Celery entegrasyonu gerekebilir

---

## Key API Endpoints

### Academy
- `GET /api/academy/company/{company_id}/trainings`
- `POST /api/academy/company/{company_id}/trainings`
- `PUT /api/academy/training/{training_id}`
- `DELETE /api/academy/training/{training_id}`
- `GET /api/academy/video/{training_id}`

### Backup
- `GET /api/backup/company/{company_id}/export`
- `POST /api/backup/company/{company_id}/import` (TODO)
- `GET /api/backup/company/{company_id}/schedule`
- `POST /api/backup/company/{company_id}/schedule`
- `POST /api/backup/company/{company_id}/send-now`

---

## Test Reports
- `/app/test_reports/iteration_16.json` - ConfirmModal tests (100% pass)

## Credentials
- **Super Admin:** username: onurertas, password: Delivery32..
- **Courier:** phone: 05551234567, password: 123456

---

## Proposed Granular Permissions (Awaiting User Approval)

### Sayfa Erişimi (Mevcut)
- `page_vardiya`: Vardiya sayfasına erişim
- `page_muhasebe`: Muhasebe sayfasına erişim
- `page_zimmet`: Zimmet sayfasına erişim
- `page_kuryeler`: Kuryeler sayfasına erişim
- `page_market`: JetPuan Market sayfasına erişim
- `page_akademi`: Akademi sayfasına erişim
- `page_sistem`: Sistem ayarlarına erişim
- `page_yoneticiler`: Yöneticiler sayfasına erişim

### Muhasebe Modülü
- `muhasebe_view`: İşlemleri görüntüleme
- `muhasebe_add_transaction`: İşlem ekleme
- `muhasebe_edit_transaction`: İşlem düzenleme
- `muhasebe_delete_transaction`: İşlem silme
- `muhasebe_archive`: Kurye/işletme arşivleme
- `muhasebe_export_pdf`: PDF dışa aktarma
- `muhasebe_bulk_hakedis`: Toplu hakediş işlemi

### Kuryeler Modülü
- `kurye_add`: Kurye ekleme
- `kurye_edit`: Kurye bilgilerini düzenleme
- `kurye_remove`: Kuryeyi şirketten çıkarma
- `kurye_deactivate`: Kuryeyi pasife alma
- `kurye_start_termination`: Fesih başlatma
- `kurye_cancel_termination`: Fesih iptal

### Zimmet Modülü
- `zimmet_view`: Zimmetleri görüntüleme
- `zimmet_add_product`: Ürün ekleme
- `zimmet_edit_product`: Ürün düzenleme
- `zimmet_delete_product`: Ürün silme
- `zimmet_assign`: Zimmet atama
- `zimmet_return`: Zimmet iade

### Market (JetPuan) Modülü
- `market_view`: Market görüntüleme
- `market_add_product`: Ürün ekleme
- `market_edit_product`: Ürün düzenleme
- `market_delete_product`: Ürün silme
- `market_manage_orders`: Sipariş yönetimi
- `market_add_jetpuan`: JetPuan ekleme

### Akademi Modülü
- `akademi_view`: Eğitimleri görüntüleme
- `akademi_add`: Eğitim ekleme
- `akademi_edit`: Eğitim düzenleme
- `akademi_delete`: Eğitim silme

### Vardiya Modülü
- `vardiya_view`: Vardiyaları görüntüleme
- `vardiya_add`: Vardiya ekleme
- `vardiya_delete`: Vardiya silme
- `vardiya_assign`: Atama yapma

### Sistem Ayarları
- `sistem_company_info`: Şirket bilgileri düzenleme
- `sistem_email_settings`: E-posta ayarları
- `sistem_backup`: Yedekleme işlemleri
