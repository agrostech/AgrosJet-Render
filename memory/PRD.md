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

### January 20, 2026 - İzin Sistemi Kaldırıldı (Latest)

#### ✅ COMPLETED: İzin (Permission) Sistemi Tamamen Kaldırıldı
Kullanıcı talebi üzerine granüler izin sistemi tamamen kaldırıldı.

**Kaldırılan Bileşenler:**
1. **Backend:**
   - `admins.py` - Tüm permission fonksiyonları (get_default_admin_permissions, get_superadmin_permissions, migrate-permissions endpoint)
   - `profile.py` - Session invalidation kodları (invalidate_user_session, check_session_valid, clear_session_invalidation)
   - `auth.py` - Login response'da permissions field'ı döndürülmüyor

2. **Frontend:**
   - `useSessionCheck.js` - Hook silindi
   - `axiosConfig.js` - X-Admin-Id header ve karmaşık error handling kaldırıldı
   - `api.js` - X-Admin-Id header kaldırıldı
   - `AdminDashboard.jsx` - Permission bazlı menü filtreleme kaldırıldı
   - `YoneticilerPage.jsx` - İzin modalı ve ilgili tüm kodlar kaldırıldı
   - `LoginPage.jsx` - Session invalidation temizleme kodu kaldırıldı

**Mevcut Durum:**
- Tüm adminler (superadmin hariç) tüm sayfalara erişebilir
- Yöneticiler sayfası SADECE superadmin için görünür
- Yöneticiler sayfasında sadece "Düzenle" ve "Sil" butonları var
- "Yetkiler" butonu YOK

**Test Sonuçları (iteration_20.json):**
- ✅ Admin login çalışıyor (permissions field YOK)
- ✅ Yanlış şifre için tek toast gösteriliyor (3 değil 1)
- ✅ Tüm menü öğeleri görünüyor
- ✅ Yöneticiler sayfasında "Yetkiler" butonu YOK
- ✅ Vardiyalar, Muhasebe, Zimmet sayfaları çalışıyor
- ✅ Kurye dashboard çalışıyor

---

### Previous Sessions

#### January 20, 2026 - Session 1 Bug Fixes
- ✅ Hakediş Checkbox Mantık Hatası düzeltildi
- ✅ Bildirim mantığı düzeltildi (superadmin kendi işlemlerinde bildirim almıyor)
- ✅ Akademi Modülü tamamlandı
- ✅ Yedekleme (Backup) Modülü tamamlandı

#### Core Features (Completed)
- Kurye yönetimi (CRUD, fesih, arşivleme)
- Vardiya sistemi
- Muhasebe (gelir/gider, taksitler, faturalar, cariler, işletmeler)
- Zimmet takibi
- JetPuan market sistemi
- Akademi (video/metin eğitim)
- Bildirim sistemi
- E-posta bildirimleri
- PDF export (muhasebe özeti)

---

## Prioritized Backlog

### P0 - Critical (Next)
- [ ] **Yeni İzin Sistemi Planı**: Basit ve sağlam bir izin sistemi tasarla ve kullanıcı onayı al

### P1 - High Priority
- [ ] **Kurye Deaktivasyonu Kontrolü Doğrulama**: Bakiye/zimmet kontrolü mantığını doğrula
- [ ] **Dosya Yükleme İyileştirmesi**: Akademi için kalıcı dosya depolama çözümü

### P2 - Medium Priority
- [ ] **Kod Refactoring**: Büyük dosyaları parçala (GuncelDurumPage.jsx, SistemPage.jsx)
- [ ] **Test Kapsamını Artır**: Backend için pytest testleri ekle

### P3 - Low Priority
- [ ] **err.handled Temizliği**: Artık kullanılmayan err.handled kontrollerini kaldır

---

## Test Credentials

### Super Admin
- Username: `onurertas`
- Password: `Delivery32..`

### Test Admin
- Username: `testdeleteadmin`
- Password: `test123`

### Test Courier
- Phone: `05559999999`
- Password: `test123`

---

## Architecture

```
/app/
├── backend/
│   ├── routers/
│   │   ├── auth.py         # Login (permissions kaldırıldı)
│   │   ├── admins.py       # Admin CRUD (permissions kaldırıldı)
│   │   ├── profile.py      # Profil güncelleme (session invalidation kaldırıldı)
│   │   ├── accounting.py   # Muhasebe
│   │   ├── shifts.py       # Vardiya
│   │   ├── zimmet.py       # Zimmet
│   │   ├── academy.py      # Akademi
│   │   └── ...
│   └── services/
│       └── courier_service.py  # Kurye deaktivasyon kontrolleri
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── AdminDashboard.jsx      # Ana dashboard
│       │   ├── admin/
│       │   │   ├── YoneticilerPage.jsx # Yöneticiler (izin modalı kaldırıldı)
│       │   │   └── ...
│       │   └── ...
│       ├── utils/
│       │   ├── axiosConfig.js  # Basitleştirildi
│       │   └── api.js          # X-Admin-Id kaldırıldı
│       └── hooks/
│           └── useSessionCheck.js  # SİLİNDİ
└── memory/
    └── PRD.md
```
