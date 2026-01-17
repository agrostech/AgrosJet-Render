# ShiftJet Kurye Yönetim Sistemi PRD

## Problem Statement
Multi-tenant kurye yönetim sistemi.

## What's Been Implemented

### Kurye Dashboard (17 Ocak 2026 - YENİ)
- [x] **CourierDashboard.jsx** - Ana layout (sidebar, routing)
- [x] **CourierVardiyalarPage.jsx** - Kuryenin haftalık vardiya programı (read-only)
- [x] **CourierMuhasebePage.jsx** - İşlem geçmişi, bakiye, taksitli ürünler (read-only)
- [x] **CourierZimmetPage.jsx** - Zimmetli ürünler listesi (read-only)
- [x] **Backend API** - `/api/zimmet/courier/{id}/assignments`
- [x] Admin dashboard tasarım dili korundu
- [x] Modüler yapı (courier/ klasörü altında)

### Taksitli Ürün Özelliği (17 Ocak 2026)
- [x] Ürün ekleme, taksit alma, ilerleme takibi
- [x] İşlem silinirse taksit geri eklenir

### Sistem Sekmesi (17 Ocak 2026)
- [x] Sidebar'a eklendi (SlidersHorizontal ikonu)
- [x] Placeholder sayfa

### Muhasebe İşlem Düzenleme (17 Ocak 2026)
- [x] Tüm sekmelerde düzenleme modalı

### Backend/Frontend Refactoring (Tamamlandı)
- [x] Modüler yapı

## Test Credentials
- **Süper Admin**: `onurertas` / `Delivery32..`
- **Kurye**: `05551234567` / `123456`

## Kurye Dashboard Test Durumu (17 Ocak 2026)
- [x] Vardiyalarım - Çalışıyor (haftalık program görüntüleniyor)
- [x] Muhasebe - Çalışıyor (bakiye renkleri ters çevrilmiş, taksitli ürünler gösteriliyor)
- [x] Zimmetlerim - Çalışıyor (sadece ürün listesi, özet kartlar kaldırıldı)
- [x] Sidebar - Admin ile aynı tasarım (collapse özelliği mevcut)

### Vardiya Görüntüleme İyileştirmeleri (17 Ocak 2026)
- [x] Ardışık vardiyalar birleştiriliyor (10:00-11:00, 11:00-12:00 → 10:00-12:00)
- [x] Vardiya yoksa veya izinliyse "İzinli" gösteriliyor
- [x] 06:00 gün başlangıcı kuralı ile sıralama
- [x] POS cihazı zimmetinde "Pos SN:" gösterimi

### Fatura Yönetimi Sistemi (17 Ocak 2026)
- [x] **Backend**: `/api/invoices/` endpoint'leri (upload, delete, download, bulk download)
- [x] **Kurye Paneli**: Hakediş işlemlerinde "Fatura Yükle" butonu
- [x] **Kurye Paneli**: Yüklenen faturaları görme, indirme, silme (24 saat içinde)
- [x] **Admin Paneli**: Muhasebe → Faturalar alt sekmesi
- [x] **Admin Paneli**: 2x2 grid layout (Kuryeler, Kurye Faturaları, Ay Faturaları, Eksik Faturalar)
- [x] **Admin Paneli**: Ay bazında filtreleme, tekli/toplu indirme (ZIP)
- [x] Dosya isimlendirme: KuryeAdSoyad_HaftaninSalisi.pdf

## Prioritized Backlog
- [ ] Toplu Hakediş Girişi (ON HOLD)
- [ ] Sistem Sayfası özellikleri (kullanıcı gereksinimlerini bekliyor)
