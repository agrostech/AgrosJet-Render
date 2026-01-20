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

### January 20, 2026 - Basit Sayfa Bazlı İzin Sistemi (Latest)

#### ✅ COMPLETED: Basit Sayfa Bazlı İzin Sistemi
Kullanıcı talebi üzerine basit ve temiz bir izin sistemi uygulandı.

**İzin Yapısı (7 sayfa için boolean):**
```json
{
  "vardiya": true/false,
  "muhasebe": true/false,
  "zimmet": true/false,
  "kuryeler": true/false,
  "market": true/false,
  "akademi": true/false,
  "sistem": true/false
}
```

**Özellikler:**
- ✅ Sayfa erişim kontrolü (menüde görünme + route koruması)
- ✅ Yöneticiler sayfasında izin modalı (Shield ikonu, 7 switch)
- ✅ Varsayılan izinler: Yeni admin tüm sayfalara erişebilir (sistem hariç)
- ✅ Superadmin tüm izinlere sahip
- ✅ Yöneticiler sayfası SADECE superadmin için
- ❌ İşlem bazlı kontrol YOK
- ❌ Session invalidation YOK (izin değişikliği sonrası manuel çıkış gerekir)

**Dosyalar:**
- Backend: `admins.py` (get_default_permissions, get_full_permissions, /permissions endpoint)
- Backend: `auth.py` (login response'da permissions field)
- Frontend: `AdminDashboard.jsx` (menü filtreleme, route koruması)
- Frontend: `YoneticilerPage.jsx` (izin modalı, PERMISSION_ITEMS)

**Test Sonuçları (iteration_21.json):**
- ✅ 9/9 backend testi geçti
- ✅ Tüm frontend testleri geçti

---

### January 20, 2026 - Fatura Yükleme Düzeltmesi

#### ✅ COMPLETED: Kurye Hakediş Fatura Yükleme
Mobil görünümde sadece fotoğraf seçeneği çıkıyordu, dosya (PDF) seçeneği eklendi.

**Değişiklikler:**
- Frontend: `CourierMuhasebePage.jsx` - accept attribute güncellendi
- Backend: `invoices.py` - PDF yanında resim dosyaları da kabul ediliyor (JPG, PNG, HEIC)

---

### Previous Sessions (January 20, 2026)

#### Completed Features
- Hakediş Checkbox Mantık Hatası düzeltildi
- Bildirim mantığı düzeltildi
- Akademi Modülü tamamlandı
- Yedekleme (Backup) Modülü tamamlandı

---

## Core Features (All Completed)
- ✅ Kurye yönetimi (CRUD, fesih, arşivleme)
- ✅ Vardiya sistemi
- ✅ Muhasebe (gelir/gider, taksitler, faturalar, cariler, işletmeler)
- ✅ Zimmet takibi
- ✅ JetPuan market sistemi
- ✅ Akademi (video/metin eğitim)
- ✅ Bildirim sistemi
- ✅ E-posta bildirimleri
- ✅ PDF export
- ✅ Sayfa bazlı izin sistemi

---

## Prioritized Backlog

### P1 - High Priority
- [ ] Kurye deaktivasyonu kontrolü son doğrulama

### P2 - Medium Priority
- [ ] Kod refactoring (büyük dosyaları parçalama)
- [ ] err.handled temizliği (artık kullanılmıyor)

### P3 - Low Priority
- [ ] Akademi için kalıcı dosya depolama

---

## Test Credentials

### Super Admin
- Username: `onurertas`
- Password: `Delivery32..`

### Test Admin (Restricted)
- Username: `testpermadmin`
- Password: `test123`
- Permissions: vardiya ✓, muhasebe ✓, zimmet ✓, kuryeler ✓, market ✗, akademi ✗, sistem ✗

---

## Architecture

```
/app/
├── backend/
│   ├── routers/
│   │   ├── auth.py         # Login (permissions field döner)
│   │   ├── admins.py       # Admin CRUD + permissions endpoint
│   │   ├── profile.py      # Profil güncelleme
│   │   ├── accounting.py   # Muhasebe
│   │   ├── shifts.py       # Vardiya
│   │   ├── zimmet.py       # Zimmet
│   │   ├── academy.py      # Akademi
│   │   ├── invoices.py     # Fatura (PDF + resim)
│   │   └── ...
│   └── services/
│       └── courier_service.py
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── AdminDashboard.jsx      # İzin bazlı menü + route koruması
│       │   ├── admin/
│       │   │   ├── YoneticilerPage.jsx # İzin modalı (Shield butonu)
│       │   │   └── ...
│       │   └── courier/
│       │       └── CourierMuhasebePage.jsx  # Fatura yükleme
│       └── ...
└── memory/
    └── PRD.md
```
