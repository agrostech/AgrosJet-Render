# ShiftJet - Kurye Yönetim Sistemi PRD

## Orijinal Problem
Kurye yönetim sistemi (ShiftJet) için kapsamlı admin paneli. Sipariş yönetimi, kurye takibi, restoran entegrasyonları, raporlama, vardiya yönetimi ve faturalandırma özellikleri.

## Temel Gereksinimler
- Admin dashboard ile sipariş/kurye/restoran yönetimi
- Çoklu platform entegrasyonu (Adisyo, Getir, Trendyol, Yemeksepeti, Migros, Sepettakip)
- Raporlama sistemi (Kurye, Restoran, Performans, Ciro, Kar/Zarar)
- Vardiya yönetimi (atama, ihlal takibi, mola sistemi)
- Restoran panel erişimi (impersonation)
- Firebase push bildirimleri
- Super admin (/system) paneli

## Mimari
- Frontend: React + Tailwind + Shadcn/UI
- Backend: FastAPI + MongoDB
- Bildirimler: Firebase Cloud Messaging
- Haritalar: Leaflet + CartoDB/Stadia Maps
- Grafikler: Recharts

## Tamamlanan İşler

### Önceki Oturumlar
- Tüm temel admin paneli özellikleri
- Platform entegrasyonları (Adisyo, Getir, Trendyol, Yemeksepeti, Migros, Sepettakip)
- Sipariş yönetimi, kurye takibi, harita görünümü
- Vardiya yönetimi sistemi
- Fatura ve muhasebe modülleri
- Super admin paneli

### Son Oturum (Mart 2026)
- Ciro Raporu implementasyonu
- Ortak tarih filtresi (ReportDateFilter.jsx) - 5 raporda kullanılıyor
- Restoran Panel Erişimi (impersonation)
- Restoran bazlı fatura ceza toggle
- Logo yükleme sistemi (dark/light)
- Performans raporu yeniden tasarımı
- Masaüstü sipariş butonları renk düzeltmesi
- Bildirim ikonu düzeltmesi

### Bu Fork (14 Mart 2026)
- **Raporlar Sayfası Mobil Uyumluluk (5 alt rapor)**
  - KuryeRaporlari: Mobilde açılır/kapanır özet + kart görünümü
  - RestoranRaporlari: Mobilde açılır/kapanır özet + kart görünümü
  - CiroRaporu: Mobilde 3-sütun özet kartlar + kart listesi
  - KarZararRaporu: Mobilde kart tabanlı layout
  - PerformansRaporu: Mobilde responsive grafikler + kart tabanlı tablolar

- **Restoranlar Sayfası Mobil Uyumluluk**
  - Header: Mobilde ikon-only butonlar, kompakt arama
  - Tabs: Responsive boyutlar, mobilde küçük text
  - Mobil kartlar: 4x2 grid buton düzeni (ikon + etiket)
  - RestaurantMatrixView: Mobilde kart tabanlı ayar görünümü

- **Kuryeler Sayfası Mobil Uyumluluk**
  - Header: Mobilde kompakt layout
  - Tabs + view mode: Responsive boyutlar
  - CourierCards: 4'lü grid buton düzeni
  - CourierMatrixView: Mobilde kart tabanlı ayar görünümü

- **Vardiya Yönetimi Alt Sekme Dönüşümü**
  - 3 modal (İhlaller, Hareketler, Mola Ayarları) → inline alt sekmeler
  - VardiyaIhlalleriSection.jsx: Hafta seçici + filtreler + ihlal listesi
  - StatusMovementsSection.jsx: Gün seçici + filtreler + hareket listesi
  - BreakSettingsSection.jsx: Mola modu + kısıtlamalar + vardiya limitleri
  - Hem mobil hem masaüstü için optimize edildi

- **Firebase Log Düzeltme**
  - Bildirim servisine save_integration_log çağrıları eklendi
  - Başarılı/başarısız/geçersiz token durumları loglanıyor

- **System Panel (/system) Mobil Uyumluluk**
  - SirketlerPage: Mobil kart görünümü eklendi
  - KontorYonetimiPage: Mobil kart görünümü eklendi
  - YoneticilerPage: Mobil kart görünümü eklendi
  - SistemAyarlariPage: Padding'ler responsive yapıldı

## Bekleyen Görevler

### P0
- Kritik Migros backend bugları (is_test boolean, migros_status update, DB migration)

### P1
- Stop Count bazlı kapasite sistemi
- Push bildirim sistemi doğrulaması (orders_v6 kanalı)
- Migros entegrasyon düzeltmeleri doğrulaması
- restaurant_fee hesaplama
- Haftalık Hakediş/Restoran Mütabakat refactoring

### P2
- Caller ID araştırması
- dispatch_decision fonksiyonu araştırma
- API request monitor
- Native Kurye App geliştirme

### Backlog
- Restoran Kurye Sistemi (büyük özellik)
- Restoran Bazlı Gelir Raporu
- İptal Analiz Raporu

## Anahtar Dosyalar
- backend/routers/webhooks.py - Migros webhook (is_test bug FIX NEEDED)
- backend/services/notifications.py - Firebase bildirimler + integration logging
- backend/services/integration_log_service.py - Log servisi
- frontend/src/pages/admin/RaporlarPage.jsx - Raporlar ana sayfası
- frontend/src/pages/admin/RestoranlarPage.jsx - Restoranlar sayfası
- frontend/src/pages/admin/KuryelerPage.jsx - Kuryeler sayfası (farklı yolda)
- frontend/src/pages/VardiyaPage.jsx - Vardiya yönetimi (alt sekmeler)
- frontend/src/pages/SystemDashboard.jsx - Super admin paneli
- frontend/src/components/admin/reports/* - 5 rapor + tarih filtresi
- frontend/src/components/vardiya/*Section.jsx - 3 alt sekme bileşeni
- frontend/src/components/admin/RestaurantMatrixView.jsx
- frontend/src/components/admin/CourierMatrixView.jsx
- frontend/src/components/kuryeler/CourierCards.jsx
