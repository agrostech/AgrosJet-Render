# ShiftJet Kurye Yönetim Sistemi PRD

## Problem Statement
Multi-tenant kurye yönetim sistemi. Kuryeler global kayıt olur (telefon eşsiz), şirketler kuryeleri telefon ile kendi sistemlerine ekler.

## What's Been Implemented

### UI/UX İyileştirmeleri (17 Ocak 2026)
- [x] **Zimmet sayfası Muhasebe ile aynı tasarım** - Eşit sütun genişlikleri, büyük fontlar
- [x] **Mali Bellek sekmesi** - Geniş ve kullanışlı tasarım
- [x] **Tüm Hareketler sekmesi** - Büyük ve okunabilir
- [x] **Muhasebe iconu** - Hesap makinesi olarak değiştirildi
- [x] **"Daha Fazla Yükle" scroll sorunu** - Scroll pozisyonu korunuyor

### Backend Refactoring (Tamamlandı)
- [x] `server.py` modülerleştirildi (697 → 109 satır)
- [x] 9 ayrı router modülü

### Frontend Refactoring (Tamamlandı)
- [x] `AdminDashboard.jsx` parçalandı (1014 → 135 satır)
- [x] Muhasebe Tab'ları `useAccountingTab` hook ile refactor edildi

### Temel Özellikler
- [x] Kullanıcı yönetimi
- [x] Vardiya yönetimi  
- [x] Zimmet sistemi
- [x] Mali Bellek
- [x] Muhasebe (PDF export dahil)

## Prioritized Backlog

### P1 - Sıradaki
- [ ] Toplu Hakediş Girişi (ON HOLD)
- [ ] Güncel Durum sayfasına ek bilgi kartları

### P2 - Gelecek
- [ ] Kurye profil düzenleme
- [ ] Raporlama özellikleri

## Test Credentials
- **Süper Admin**: `onurertas` / `Delivery32..`

## Changelog

### 17 Ocak 2026 - UI/UX Güncellemesi
- **Zimmet Sayfası**: Muhasebe ile aynı geniş tasarım uygulandı
- **Sidebar Icon**: Muhasebe iconu hesap makinesi olarak değiştirildi
- **Scroll Fix**: "Daha Fazla Yükle" scroll pozisyonu korunuyor
