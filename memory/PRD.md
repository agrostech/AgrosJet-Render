# ShiftJet Kurye Yönetim Sistemi PRD

## Problem Statement
Multi-tenant kurye yönetim sistemi. Kuryeler global kayıt olur (telefon eşsiz), şirketler kuryeleri telefon ile kendi sistemlerine ekler.

## User Personas & Hiyerarşi
1. **Sistem Yöneticisi** (`systemadmin` / `System123!`): Şirketleri yönetir, süper admin atar
2. **Süper Admin** (`onurertas` / `Delivery32..`): Şirkete bağlı, otomatik login, adminleri/kuryeleri yönetir
3. **Admin**: Yetkilere göre çalışır, Super Admin tarafından yetkilendirilir
4. **Kurye**: Global kayıt, şirketlere bağlanabilir

## What's Been Implemented

### Backend Refactoring (Tamamlandı - 17 Ocak 2026)
- [x] `server.py` modülerleştirildi (697 → 109 satır)
- [x] 9 ayrı router modülü: auth, companies, couriers, admins, profile, accounting, shifts, zimmet, mali_bellek
- [x] Kurye silme kontrolü düzeltildi (bakiye öncelikli)

### Frontend Refactoring (Tamamlandı - 17 Ocak 2026)
- [x] `AdminDashboard.jsx` parçalandı (1014 → 135 satır)
- [x] `KuryelerPage.jsx` ve `YoneticilerPage.jsx` ayrı dosyalara taşındı
- [x] `AdminSidebar.jsx` ve `ProfileModal.jsx` component'leri oluşturuldu
- [x] **Muhasebe Tab'ları `useAccountingTab` hook ile refactor edildi**
  - KuryelerTab: 515 → 305 satır
  - IsletmelerTab: 439 → 362 satır
  - CarilerTab: 514 → 362 satır
  - Toplam: ~30% kod azalması, ~60% tekrar azalması

### Kullanıcı Yönetimi
- [x] Global kurye kayıt sistemi
- [x] Admin/Süper Admin Dashboard
- [x] Kurye Dashboard
- [x] "Beni Hatırla" özelliği

### Vardiya Yönetimi
- [x] Vardiya CRUD
- [x] Kurye-vardiya atama
- [x] İzin listesi yönetimi
- [x] Grid tabanlı görünüm

### Zimmet
- [x] Ürün Tipleri yönetimi
- [x] Kuryeye zimmetleme
- [x] Mali Bellek özelliği

### Muhasebe
- [x] Üç sekme: Kuryeler, İşletmeler, Cariler
- [x] Ödeme işlemleri
- [x] PDF Export
- [x] Hakediş checkbox'ı

## Prioritized Backlog

### P1 - Sıradaki
- [ ] Toplu Hakediş Girişi (ON HOLD - 3. parti cevap bekleniyor)
- [ ] Güncel Durum sayfasına ek bilgi kartları

### P2 - Gelecek
- [ ] Kurye profil düzenleme
- [ ] Şifre sıfırlama
- [ ] Raporlama özellikleri

## Tech Stack
- Backend: FastAPI + MongoDB (modüler router yapısı)
- Frontend: React + Tailwind CSS + Shadcn UI

## Code Architecture
```
/app/
├── backend/
│   ├── server.py          # 109 satır (modüler)
│   └── routers/           # 9 modül
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── AdminDashboard.jsx    # 135 satır
│       │   ├── admin/
│       │   │   ├── KuryelerPage.jsx
│       │   │   └── YoneticilerPage.jsx
│       │   └── muhasebe/
│       │       ├── KuryelerTab.jsx   # 305 satır (refactored)
│       │       ├── IsletmelerTab.jsx # 362 satır (refactored)
│       │       └── CarilerTab.jsx    # 362 satır (refactored)
│       ├── components/
│       │   └── admin/
│       │       ├── AdminSidebar.jsx
│       │       └── ProfileModal.jsx
│       └── hooks/
│           └── useAccountingTab.js   # 505 satır (shared hook)
└── memory/
    └── PRD.md
```

## Test Credentials
- **Süper Admin**: `onurertas` / `Delivery32..`
- **Sistem Yöneticisi**: `systemadmin` / `System123!`

## Changelog

### 17 Ocak 2026
- **Backend Refactoring**: `server.py` 697 → 109 satır
- **Frontend Refactoring**: `AdminDashboard.jsx` 1014 → 135 satır
- **Muhasebe Refactoring**: `useAccountingTab` hook ile tab'lar refactor edildi
- **Bug Fix**: Kurye silme kontrolünde bakiye önceliği

### 16 Ocak 2026
- Mali Bellek özelliği eklendi
- Zimmet sayfası UI iyileştirmeleri
