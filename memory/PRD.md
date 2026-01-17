# ShiftJet Kurye Yönetim Sistemi PRD

## Problem Statement
Multi-tenant kurye yönetim sistemi.

## What's Been Implemented

### Güncel Durum Sayfası Güncellemeleri (17 Ocak 2026 - En Son)
- [x] **Vardiya Takibi kartı** - Gün seçici ve tarih/saat birleştirildi
- [x] **Gün kısaltmaları** - PZT, SAL, ÇAR, PER, CUM, CMT, PAZ + ayın kaçı
- [x] **Muhasebe Durumu kartı** - Kuryeler, İşletmeler, Cariler toplam bakiyeleri
- [x] **API endpoint** - `/api/companies/{id}/accounting-summary`

### Bug Fixes (17 Ocak 2026)
- [x] **"Daha Fazla Yükle" Butonu** - useRef ile düzeltildi

### UI/UX İyileştirmeleri (17 Ocak 2026)
- [x] **Zimmet sayfası** - Sol/sağ sütunlar %50-%50 eşit genişlik
- [x] **Mali Bellek** - Eşit sütun genişlikleri
- [x] **Muhasebe arama** - Her sekmede liste araması
- [x] **Güncel Durum** - Vardiyalar 2 sütunlu grid
- [x] **Sidebar icon** - Muhasebe = hesap makinesi

### Backend Refactoring (Tamamlandı)
- [x] `server.py` modülerleştirildi (697 → 109 satır)

### Frontend Refactoring (Tamamlandı)
- [x] `AdminDashboard.jsx` parçalandı
- [x] `useAccountingTab` hook

## Test Credentials
- **Süper Admin**: `onurertas` / `Delivery32..`

## Prioritized Backlog
- [ ] Toplu Hakediş Girişi (ON HOLD)
