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

### January 20, 2026 - Session 2 Bug Fixes (Latest)

#### ✅ Fixed: Yetki Güncellendiğinde Otomatik Logout
- Admin'in yetkileri değiştiğinde otomatik session invalidation
- `/api/auth/check-session/{user_id}` endpoint'i eklendi
- Frontend 10 saniyede bir session kontrolü yapıyor
- Yetki değişikliğinde "Yetkilerin güncellendi, lütfen tekrar giriş yap" mesajı

#### ✅ Fixed: Çoklu Hata Mesajları
- `axiosConfig.js` - Aynı hatayı 2 saniye içinde tekrar göstermeme
- Component catch bloklarında `err.permissionError` flag kontrolü
- Artık sadece TEK bir "Bu işlem için yetkiniz yok" mesajı gösteriliyor

#### ✅ Fixed: Kurye Pasife Alma Kontrolleri
- `courier_service.py` - Zimmet kontrolü düzeltildi (`products` koleksiyonu)
- Bakiye kontrolü düzeltildi (`transactions` koleksiyonu)
- Zimmetli ürünü olan kurye pasife alınamaz: "Bu kuryenin üzerinde zimmetli ürün bulunuyor"
- Bakiyesi olan kurye pasife alınamaz: "Bu kuryenin X TL alacağı/borcu bulunuyor"

### January 20, 2026 - Session 1 Bug Fixes

#### ✅ Fixed: Yetki Sistemi Sorunları
1. **Sayfa Erişim Yetkisi Düzeltildi**
   - `AdminDashboard.jsx` - NAV_ITEMS'da `permKey` ile doğru yetki kontrolü
   - `page_market: false` olan admin artık Market menüsünü görmüyor
   
2. **İşlem Silme Yetkisi Bypass Bug'ı Düzeltildi**
   - `/api/transactions/{id}/with-installment-restore` endpoint'ine yetki kontrolü eklendi
   - `muhasebe_delete_transaction: false` olan admin artık işlem silemiyor

#### ✅ Fixed: Hakediş Checkbox Mantık Hatası
- **Önceki:** Yeşil buton (Verilen/payment_out) ile hakediş çalışıyordu
- **Şimdi:** Kırmızı buton (Alınan/payment_in) ile hakediş çalışıyor

#### ✅ Fixed: Bildirim Mantığı
- Superadmin kendi işlemlerinde bildirim almıyor
- `actor_id` ve `actor_role` parametreleri eklendi

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

### P1 - High Priority
1. **Import/Restore Functionality**
   - Yedekleme modülünde geri yükleme özelliği eksik
   - Backend TODO olarak işaretli

2. **Otomatik Yedekleme Scheduler**
   - APScheduler ile günlük otomatik yedekleme çalıştırma
   - Background task olarak çalışacak

### P2 - Medium Priority
3. **Kalıcı Dosya Depolama Çözümü**
   - Akademi video yüklemeleri için S3 veya kalıcı volume
   - Production için kritik

4. **Kalan Büyük Dosyaların Refactoring'i**
   - `GuncelDurumPage.jsx` (497 satır)
   - `SistemPage.jsx` (455 satır)
   - `invoices.py` (468 satır)
   - `zimmet.py` (454 satır)

---

## Key API Endpoints

### Permission-Protected Endpoints (X-Admin-Id Header Required)
All endpoints below require `X-Admin-Id` header for authorization.

### Academy
- `GET /api/academy/company/{company_id}/trainings` - akademi_view
- `POST /api/academy/company/{company_id}/trainings` - akademi_add
- `PUT /api/academy/training/{training_id}` - akademi_edit
- `DELETE /api/academy/training/{training_id}` - akademi_delete
- `GET /api/academy/video/{training_id}` - public (video streaming)

### Backup
- `GET /api/backup/company/{company_id}/export` - sistem_backup
- `POST /api/backup/company/{company_id}/import` - sistem_backup (TODO)
- `GET /api/backup/company/{company_id}/schedule` - sistem_backup
- `POST /api/backup/company/{company_id}/schedule` - sistem_backup
- `POST /api/backup/company/{company_id}/send-now` - sistem_backup

---

## Test Reports
- `/app/test_reports/iteration_16.json` - ConfirmModal tests (100% pass)
- `/app/test_reports/iteration_17.json` - Granular Permissions tests (100% pass)
- `/app/test_reports/iteration_18.json` - Backend Permission Enforcement tests (100% pass - 35/35)

## Credentials
- **Super Admin:** username: onurertas, password: Delivery32..
- **Courier:** phone: 05551234567, password: 123456
- **Test Admin (no perms):** ID: 64b44a19-1323-482a-9ba3-184d4afde1d1

---

## Granular Permissions (✅ FULLY IMPLEMENTED - Frontend + Backend)

### Sayfa Erişimi (8 izin)
- `page_vardiya`: Vardiya sayfasına erişim
- `page_muhasebe`: Muhasebe sayfasına erişim
- `page_zimmet`: Zimmet sayfasına erişim
- `page_kuryeler`: Kuryeler sayfasına erişim
- `page_market`: JetPuan Market sayfasına erişim
- `page_akademi`: Akademi sayfasına erişim
- `page_sistem`: Sistem ayarlarına erişim
- `page_yoneticiler`: Yöneticiler sayfasına erişim (disabled - sadece superadmin)

### Muhasebe Modülü (7 izin)
- `muhasebe_view`: İşlemleri görüntüleme
- `muhasebe_add_transaction`: İşlem ekleme
- `muhasebe_edit_transaction`: İşlem düzenleme
- `muhasebe_delete_transaction`: İşlem silme
- `muhasebe_archive`: Kurye/işletme arşivleme
- `muhasebe_export_pdf`: PDF dışa aktarma
- `muhasebe_bulk_hakedis`: Toplu hakediş işlemi

### Kuryeler Modülü (6 izin)
- `kurye_add`: Kurye ekleme
- `kurye_edit`: Kurye bilgilerini düzenleme
- `kurye_remove`: Kuryeyi şirketten çıkarma
- `kurye_deactivate`: Kuryeyi pasife alma
- `kurye_start_termination`: Fesih başlatma
- `kurye_cancel_termination`: Fesih iptal

### Zimmet Modülü (6 izin)
- `zimmet_view`: Zimmetleri görüntüleme
- `zimmet_add_product`: Ürün ekleme
- `zimmet_edit_product`: Ürün düzenleme
- `zimmet_delete_product`: Ürün silme
- `zimmet_assign`: Zimmet atama
- `zimmet_return`: Zimmet iade

### Market (JetPuan) Modülü (6 izin)
- `market_view`: Market görüntüleme
- `market_add_product`: Ürün ekleme
- `market_edit_product`: Ürün düzenleme
- `market_delete_product`: Ürün silme
- `market_manage_orders`: Sipariş yönetimi
- `market_add_jetpuan`: JetPuan ekleme

### Akademi Modülü (4 izin)
- `akademi_view`: Eğitimleri görüntüleme
- `akademi_add`: Eğitim ekleme
- `akademi_edit`: Eğitim düzenleme
- `akademi_delete`: Eğitim silme

### Vardiya Modülü (4 izin)
- `vardiya_view`: Vardiyaları görüntüleme
- `vardiya_add`: Vardiya ekleme
- `vardiya_delete`: Vardiya silme
- `vardiya_assign`: Atama yapma

### Sistem Ayarları (3 izin)
- `sistem_company_info`: Şirket bilgileri düzenleme
- `sistem_email_settings`: E-posta ayarları
- `sistem_backup`: Yedekleme işlemleri
