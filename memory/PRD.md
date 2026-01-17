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
- [x] `KuryelerPage.jsx` ayrı dosyaya taşındı
- [x] `YoneticilerPage.jsx` ayrı dosyaya taşındı
- [x] `AdminSidebar.jsx` component oluşturuldu
- [x] `ProfileModal.jsx` component oluşturuldu
- [x] `useAccountingTab.js` custom hook oluşturuldu (Muhasebe tab'ları için)

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
- [ ] Toplu Hakediş Girişi (ON HOLD)
- [ ] Güncel Durum sayfasına ek bilgi kartları
- [ ] Muhasebe tab'larını `useAccountingTab` hook ile refactor et

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
│   ├── server.py          # 109 satır
│   └── routers/           # 9 modül
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── AdminDashboard.jsx    # 135 satır (refactored)
│       │   ├── admin/
│       │   │   ├── KuryelerPage.jsx
│       │   │   └── YoneticilerPage.jsx
│       │   └── muhasebe/
│       ├── components/
│       │   └── admin/
│       │       ├── AdminSidebar.jsx
│       │       └── ProfileModal.jsx
│       └── hooks/
│           └── useAccountingTab.js   # Custom hook for accounting
└── memory/
    └── PRD.md
```

## Test Credentials
- **Süper Admin**: `onurertas` / `Delivery32..`
- **Sistem Yöneticisi**: `systemadmin` / `System123!`

## Changelog

### 17 Ocak 2026
- **Backend Refactoring**: `server.py` tamamen modülerleştirildi
- **Frontend Refactoring**: `AdminDashboard.jsx` parçalandı
- **New Hook**: `useAccountingTab.js` oluşturuldu
- **Bug Fix**: Kurye silme kontrolünde bakiye önceliği

### 16 Ocak 2026
- Mali Bellek özelliği eklendi
- Zimmet sayfası UI iyileştirmeleri
