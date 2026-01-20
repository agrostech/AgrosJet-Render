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

### January 20, 2026 - İzin Güncelleme Otomatik Çıkış (Latest)

#### ✅ COMPLETED: İzin Güncellendiğinde Otomatik Çıkış
Admin izinleri güncellendiğinde 10 saniye içinde otomatik çıkış yapılıyor.

**Akış:**
1. Superadmin izinleri günceller
2. Backend `permissions_updated_at` timestamp'i kaydeder
3. Frontend her 10 saniyede `/api/auth/check-permissions` endpoint'ini kontrol eder
4. Timestamp değişmişse warning toast gösterir ve login'e yönlendirir

**Önemli:**
- ✅ İzin güncellemesi şifreyi ETKİLEMİYOR
- ✅ Superadmin bu kontrolden muaf
- ✅ Warning toast: "İzinleriniz güncellendi. Yeniden giriş yapmanız gerekiyor."

**Test Sonuçları (iteration_22.json):** Tüm kritik testler geçti

---

### January 20, 2026 - Basit Sayfa Bazlı İzin Sistemi

#### ✅ COMPLETED: Basit Sayfa Bazlı İzin Sistemi
7 sayfa için boolean izinler: vardiya, muhasebe, zimmet, kuryeler, market, akademi, sistem

**Özellikler:**
- Yöneticiler sayfasında Shield (kalkan) butonu ile izin modalı
- Menü filtreleme + route koruması
- Varsayılan: Yeni admin tüm sayfalara erişebilir (sistem hariç)

---

### January 20, 2026 - Fatura Yükleme Düzeltmesi

#### ✅ COMPLETED: Kurye Hakediş Fatura Yükleme
Mobil görünümde dosya (PDF) + fotoğraf yükleme eklendi.

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
- ✅ İzin güncelleme otomatik çıkış

---

## Prioritized Backlog

### P2 - Medium Priority
- [ ] Kod refactoring (büyük dosyaları parçalama)
- [ ] err.handled temizliği

### P3 - Low Priority
- [ ] Akademi için kalıcı dosya depolama

---

## Test Credentials

### Super Admin
- Username: `onurertas`
- Password: `Delivery32..`

### Test Admin
- Username: `testpermadmin`
- Password: `test123`


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

---

## January 20, 2026 - PWA "Tekrar Gösterme" Checkbox

### ✅ COMPLETED: PWA Bildiriminde "Bunu tekrar gösterme" Checkbox

PWA "Ana ekrana ekle" bildirimine checkbox eklendi. Kullanıcı işaretlerse bildirim bir daha gösterilmiyor.

**Değişiklikler:**
- `/app/frontend/src/hooks/usePWAInstall.js`: `pwa-install-never-show` localStorage key eklendi
- `/app/frontend/src/components/PWAInstallPrompt.jsx`: Checkbox bileşeni ve state eklendi

**Davranış:**
- Checkbox işaretlenmeden "Daha Sonra" → 7 gün sonra tekrar göster
- Checkbox işaretlenip "Daha Sonra" veya X → Bir daha gösterme

---

## January 20, 2026 - PWA İkon Güncellemesi

### ✅ COMPLETED: PWA İkonları Güncellendi

Masaüstüne eklendiğinde görünen PWA ikonu, ShiftJet logosu ile değiştirildi.

**Değişiklikler:**
- `/app/frontend/public/icon-192.png`: ShiftJet logosu ile yeniden oluşturuldu
- `/app/frontend/public/icon-512.png`: ShiftJet logosu ile yeniden oluşturuldu
- `/app/frontend/public/index.html`: Favicon linkleri yerel dosyalara güncellendi

**İkon Tasarımı:**
- Koyu mavi (#1e3a5f) arka plan
- Ortalanmış ShiftJet logosu (takvim + onay + jet simgesi)
