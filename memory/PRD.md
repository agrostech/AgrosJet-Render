# ShiftJet Kurye Yönetim Sistemi PRD

## Problem Statement
Multi-tenant kurye yönetim sistemi.

## What's Been Implemented

### Bug Fixes (17 Ocak 2026 - Güncel)
- [x] **"Daha Fazla Yükle" Butonu** - Muhasebe sekmelerinde bireysel işlem geçmişi için düzeltildi (useRef ile güncel transactions.length)
- [x] **Güncel Durum Gün Seçici** - Gün adı tekrarı düzeltildi, şimdi "Paz 12", "Sal 13" formatında (gün kısaltması + ayın kaçı)

### UI/UX İyileştirmeleri (17 Ocak 2026)
- [x] **Zimmet sayfası** - Sol/sağ sütunlar %50-%50 eşit genişlik
- [x] **Mali Bellek** - Eşit sütun genişlikleri
- [x] **Muhasebe arama** - Her sekmede liste araması
- [x] **Muhasebe sol sütun** - 72px → 80px genişletildi
- [x] **Güncel Durum** - Vardiyalar 2 sütunlu grid
- [x] **Sidebar icon** - Muhasebe = hesap makinesi
- [x] **Telefon kaldırıldı** - Kuryeler listesinden
- [x] **"X ürün kayıtlı" kaldırıldı** - Zimmet başlığından

### Backend Refactoring (Tamamlandı)
- [x] `server.py` modülerleştirildi (697 → 109 satır)

### Frontend Refactoring (Tamamlandı)
- [x] `AdminDashboard.jsx` parçalandı (1014 → 135 satır)
- [x] `useAccountingTab` hook

## Test Credentials
- **Süper Admin**: `onurertas` / `Delivery32..`

## Prioritized Backlog
- [ ] Toplu Hakediş Girişi (ON HOLD)
