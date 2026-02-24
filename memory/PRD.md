# Kurye Yönetim Sistemi - PRD

## Proje Özeti
Sipariş yönetimi, kurye takibi, restoran entegrasyonları ve muhasebe işlemlerini içeren kapsamlı bir kurye yönetim sistemi.

## Son Güncelleme: 24 Şubat 2026

## Tamamlanan Özellikler

### Bu Oturumda Tamamlanan (24.02.2026)
- **Eksik Fatura Uyarı Modalı Güncelleme**: Restoran panelindeki tekrarlayan uyarı modalı güncellendi
  - Süre 30 dakikadan **5 dakikaya** düşürüldü
  - Buton metni "Anladım" yerine **"5 Dakikalığına Uyarıyı Kapat"** olarak değiştirildi
  - Dosya: `/app/frontend/src/pages/restoran/RestaurantDashboard.jsx`

### Önceki Oturumlarda Tamamlanan (23.02.2026)
- **Yaklaşan Fatura Önizlemesi (P0)**: "Alınan Faturalar" sekmesine eklendi
- Cloudflare R2 Entegrasyonu (fatura dosya depolama)
- Restoran fatura iş akışı (30 dk silme penceresi, otomatik isimlendirme, badge)
- Fatura Örneği Önizleme ve WhatsApp paylaşım

### Daha Önce Tamamlanan
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
