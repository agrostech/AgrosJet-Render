# Kurye Yönetim Sistemi - PRD

## Proje Özeti
Sipariş yönetimi, kurye takibi, restoran entegrasyonları ve muhasebe işlemlerini içeren kapsamlı bir kurye yönetim sistemi.

## Son Güncelleme: 23 Şubat 2026

## Tamamlanan Özellikler

### Bu Oturumda Tamamlanan (23.02.2026)
- **Yaklaşan Fatura Önizlemesi (P0)**: "Alınan Faturalar" sekmesine eklendi
  - Backend: `/api/restaurant-invoices/{company_id}/upcoming-preview` endpoint'i
  - Frontend: `UpcomingInvoicesCard` component'i
  - Geçen haftanın siparişlerini hesaplayarak önizleme gösterir
  - Hafta etiketi, restoran sayısı, sipariş sayısı ve toplam tutar bilgisi

### Önceki Oturumlarda Tamamlanan
- Timezone standardizasyonu (UTC+3 Türkiye)
- Restoran faturalandırma akışı entegrasyonu
- Zamanlanmış görev optimizasyonu (CronTrigger)
- Kurye mütabakat sayfası düzeltmeleri
- UI/UX iyileştirmeleri

## Bekleyen Görevler

### P1 - Yüksek Öncelik
- **Verimsiz Zamanlanmış Görevler**: `Haftalık Hakediş` ve `Restoran Mütabakat` job'ları her dakika çalışıyor, CronTrigger'a geçirilmeli
- **Fee Hesaplama Entegrasyonu**: `Getir`, `Trendyol`, `Yemeksepeti`, `Migros`, `SepetTakip` için `restaurant_fee` hesaplama eksik

### P2 - Orta Öncelik  
- Veri tutarlılığı son doğrulama
- "Kurye Bulunamadı" hatası doğrulaması
- Geçmiş muhasebe veri tutarsızlığı

### P3 - Düşük Öncelik
- Mobil dosya yükleme sorunu (tekrarlayan)

## Gelecek Görevler
- Native Kurye Uygulaması
- Chat Sistemi
- Login Sayfası Refactor
- Google Maps Entegrasyonu
- Dark Mode

## Teknik Mimari
- **Frontend**: React + Shadcn/UI
- **Backend**: FastAPI + MongoDB
- **Entegrasyonlar**: Adisyo, Getir, Trendyol, Yemeksepeti, SepetTakip, Migros, APScheduler

## Test Bilgileri
- **Admin Girişi**: superadmin / 123456
