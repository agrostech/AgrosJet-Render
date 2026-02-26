# Kurye Yönetim Sistemi - PRD

## Proje Özeti
Sipariş yönetimi, kurye takibi, restoran entegrasyonları ve muhasebe işlemlerini içeren kapsamlı bir kurye yönetim sistemi.

## Son Güncelleme: 26 Şubat 2026

## Tamamlanan Özellikler

### Bu Oturumda Tamamlanan (26.02.2026)
- **Performans Raporu Yeniden Tasarımı (P0)**: Kurye panelindeki performans raporu tamamen yeniden tasarlandı
  - "Bu Haftaki Performansın" başlığı kaldırıldı
  - Tüm kartlar renksiz (slate border) yapıldı
  - 4 yeni veri kartı oluşturuldu:
    - **Toplam Teslimat**: Ana metin (kurye), alt metin (şampiyon ismi ve paket sayısı)
    - **Toplam Çalışma Süresi**: Ana metin (kurye), alt metin (şampiyon ismi ve süre)
    - **Ortalama Teslimat Süresi**: "Yolda" → "Teslim Edildi" arası süre hesaplaması
    - **Haftalık Toplam Kazanç**: Kuryenin haftalık kazancı
  - Backend'e `/api/companies/{company_id}/work-hours` endpoint'i eklendi
  - Backend'e `/api/courier-status-logs/{company_id}/courier/{courier_id}/weekly-stats` endpoint'i eklendi
  - `delivery_duration_minutes` hesaplaması `/api/reports/courier/earnings` endpoint'ine eklendi
  - Dosyalar: 
    - `/app/frontend/src/components/courier/reports/PerformansRaporu.jsx`
    - `/app/backend/routers/companies.py`
    - `/app/backend/routers/courier_status_logs.py`
    - `/app/backend/routers/reports.py`

### Önceki Oturumlarda Tamamlanan
- **Kurye Paneli PWA Refaktörü**: Push notification UI, ses bildirimleri ve browser geolocation kaldırıldı
- **WebView Bridge İletişimi**: Native uygulama için login/logout mesaj iletişimi
- **Kurye Paneli UI/UX**: Header, sidebar, sipariş sayfası ve raporlar sayfası güncellendi
- **Raporlar Sayfası**: İhlal ve Performans raporları eklendi, tarih seçici kaldırıldı
- **Eksik Fatura Uyarı Modalı**: Süre 5 dakikaya düşürüldü
- Cloudflare R2 Entegrasyonu
- Timezone standardizasyonu (UTC+3 Türkiye)

## Bekleyen Görevler

### P1 - Yüksek Öncelik
- **Verimsiz Zamanlanmış Görevler**: `Haftalık Hakediş` ve `Restoran Mütabakat` job'ları CronTrigger'a geçirilmeli
- **Fee Hesaplama Entegrasyonu**: `Getir`, `Trendyol`, `Yemeksepeti`, `Migros`, `SepetTakip` için `restaurant_fee` hesaplama eksik
- **Push Notification Backend Kurulumu**: Firebase admin key gerekli

### P2 - Orta Öncelik  
- Veri tutarlılığı son doğrulama
- "Kurye Bulunamadı" hatası doğrulaması
- Geçmiş muhasebe veri tutarsızlığı

### P3 - Düşük Öncelik
- Mobil dosya yükleme sorunu (tekrarlayan)

## Gelecek Görevler
- Native Kurye Uygulaması
- Chat Sistemi Yeniden Etkinleştirme
- Google Maps Entegrasyonu
- Dark Mode

## Teknik Mimari
- **Frontend**: React + Shadcn/UI
- **Backend**: FastAPI + MongoDB
- **Entegrasyonlar**: Adisyo, Getir, Trendyol, Yemeksepeti, SepetTakip, Migros, APScheduler

## Test Bilgileri
- **Admin Girişi**: superadmin / 123456
- **Kurye Girişi**: 05550003201 / 123456
