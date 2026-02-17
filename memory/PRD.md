# ShiftJet - Kurye ve Restoran Yönetim Sistemi

## Problem Statement
ShiftJet, restoranlar ve kurye şirketleri için kapsamlı bir sipariş ve teslimat yönetim sistemidir.

## Completed Features

### Core Features
- Admin Panel (Sipariş yönetimi, kurye atama, restoran yönetimi)
- Restoran Panel (Sipariş görüntüleme, durum güncelleme, manuel sipariş)
- Kurye Uygulaması (Sipariş kabul, konum takibi, teslimat)
- Google Places entegrasyonu (adres autocomplete)
- Web scraping (tgoyemek.com ürün import)

### Restaurant Panel (Son Güncellemeler - Şubat 2025)
- ✅ Hazırlık süresi seçimi düzeltildi
- ✅ 2 saniyelik polling ile gerçek zamanlı güncelleme
- ✅ Kurye telefonu ve TVS (tahmini varış süresi) gösterimi
- ✅ Sidebar default kapalı
- ✅ Tablo düzeni admin paneli ile uyumlu
- ✅ Durum badge'leri 135px sabit genişlik

### Ürün Bazlı Hazırlık Süreleri (Yeni - Şubat 2025)
- Admin panelde "Hazırlık" butonu
- Standart hazırlık süresi ayarlama
- Ürün bazlı ekstra süreler (en uzun olanı 1 kez eklenir)
- Hesaplama: Standart + max(Ürün Süreleri)

## API Endpoints

### Hazırlık Süreleri
- `PUT /api/restaurants/{id}/preparation-times` - Güncelle
- `GET /api/restaurants/{id}/preparation-times` - Getir

### Sipariş
- `GET /api/orders/restaurant/{restaurant_id}` - Restoran siparişleri (kurye tel + konum dahil)
- `PUT /api/orders/{id}/status` - Durum güncelle (preparation_time destekli)
- `POST /api/orders/manual` - Manuel sipariş (ürün bazlı süre hesaplamalı)

## Tech Stack
- Frontend: React, Tailwind CSS, Shadcn UI
- Backend: FastAPI, Python
- Database: MongoDB
- Maps: Google Maps Platform (Places API)

## Known Issues
- Adisyo API entegrasyonu blocked (API 400 hatası)
- Background task reliability (kurye app)
- Mobile sidebar collapsible bug

## Backlog
- P1: Muhasebe, Raporlar, Entegrasyonlar sayfaları
- P1: Adisyo Webhook entegrasyonu
- P2: Chat sistemi
- P2: Dark mode
- P3: Motosikletim geliştirmeleri
