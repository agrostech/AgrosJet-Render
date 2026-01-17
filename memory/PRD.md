# ShiftJet Kurye Yönetim Sistemi PRD

## Problem Statement
Multi-tenant kurye yönetim sistemi.

## What's Been Implemented

### Taksitli Ürün Özelliği (17 Ocak 2026 - YENİ)
- [x] **Backend API'leri**:
  - `POST /api/couriers/{id}/installment-products` - Ürün ekle
  - `GET /api/couriers/{id}/installment-products` - Ürünleri listele
  - `POST /api/installment-products/{id}/pay` - Taksit öde
  - `DELETE /api/installment-products/{id}` - Ürün sil
  - `DELETE /api/transactions/{id}/with-installment-restore` - Taksit geri al
- [x] **Frontend**: Kuryeler sekmesinde taksitli ürün bölümü ve modal
- [x] **Özellikler**:
  - Ürün adı, taksit tutarı, taksit sayısı girişi
  - Otomatik toplam hesaplama
  - İlerleme çubuğu (ödenen/toplam)
  - Taksit öde butonu (özel tarih seçeneği ile)
  - İşlem silinirse taksit sayısı geri eklenir
  - İşlem geçmişinde "Taksit" etiketi

### Muhasebe İşlem Düzenleme (17 Ocak 2026)
- [x] `PUT /api/transactions/{id}` endpoint
- [x] Tüm sekmelerde düzenleme modalı

### Güncel Durum Sayfası (17 Ocak 2026)
- [x] Vardiya Takibi kartı (birleşik)
- [x] Muhasebe Durumu kartı
- [x] Gün kısaltmaları düzeltildi

### Backend Refactoring (Tamamlandı)
- [x] `server.py` modülerleştirildi

### Frontend Refactoring (Tamamlandı)
- [x] `AdminDashboard.jsx` parçalandı
- [x] `useAccountingTab` hook

## Test Credentials
- **Süper Admin**: `onurertas` / `Delivery32..`

## Prioritized Backlog
- [ ] Toplu Hakediş Girişi (ON HOLD)
