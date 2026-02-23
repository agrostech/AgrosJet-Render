# ShiftJet - Kurye ve Restoran Yönetim Sistemi

## Proje Özeti
ShiftJet, kurye firmalarının restoran siparişlerini yönetmelerini sağlayan kapsamlı bir SaaS platformudur. Admin paneli, restoran paneli ve kurye uygulaması içerir.

## Ana Modüller

### 1. Admin Paneli
- Sipariş yönetimi (aktif, geçmiş, iptal)
- Kurye yönetimi (vardiya, performans, hakedis)
- Restoran yönetimi (ücretlendirme, tahsilat ayarları)
- Muhasebe (günlük mutabakat, restoran mutabakat, haftalık hakedis, faturalar)
- Raporlama

### 2. Restoran Paneli
- Sipariş kabul/reddetme
- Hazırlık süresi yönetimi
- Kurye takibi
- Muhasebe ve fatura yönetimi
- Termal yazıcı entegrasyonu (ESC/POS)

### 3. Kurye Uygulaması
- Sipariş listesi ve navigasyon
- Durum güncelleme
- Performans takibi

## Platform Entegrasyonları
- Getir Yemek
- Trendyol Yemek
- Yemeksepeti
- Adisyo
- SepetTakip
- Migros Yemek (Devam ediyor)

## Teknik Altyapı
- **Frontend:** React, Tailwind CSS, Shadcn/UI
- **Backend:** FastAPI (Python)
- **Veritabanı:** MongoDB
- **Zamanlama:** APScheduler

---

## Tamamlanan Özellikler (Son Oturum - 23 Şubat 2026)

### ✅ Taşıma Ücreti Hesaplama Düzeltmesi
- Mutabakat sekmesinde taşıma ücreti artık restoran pricing ayarlarından hesaplanıyor
- `delivery_fee` veya `restaurant_fee` siparişte yoksa, `per_package_price` veya `km_ranges` kullanılıyor

### ✅ Restoran Bazlı KDV Oranı
- Her restoran için ayrı `kdv_rate` değeri kullanılıyor
- Şirket varsayılanı yerine restoran ayarlarından alınıyor

### ✅ Timezone Düzeltmeleri (Önceki Oturum)
- Tüm tarih filtreleme ve raporlama 'Europe/Istanbul' timezone'u ile düzeltildi

### ✅ Hareketler Modalı
- Kurye ve admin durum değişiklik logları

### ✅ Fatura Sistemi Genişletmesi
- Admin: "Kesilen Faturalar" sekmesi
- Restoran: "Faturalar" modalı (2 sekmeli)

### ✅ Termal Yazıcı İyileştirmeleri
- Manuel bağlantı kontrolü
- Türkçe karakter desteği
- Kalın başlıklar (ESC/POS)
- Otomatik kağıt kesme
- Uzun ürün isimlerinde satır kaydırma

---

## Bekleyen Sorunlar

### P2 - Kurye Bulunamadı Hatası
- Durum: Kullanıcı doğrulaması bekleniyor
- Kurye sonlandırma işleminde hata düzeltildi

### P2 - Geçmiş Muhasebe Verisi
- `entity_type: "business"` olan eski kayıtlar görünmüyor

### P3 - Mobil Dosya Yükleme
- Tekrarlayan sorun, henüz çözülmedi

---

## Gelecek Görevler

### P1 - Yüksek Öncelik
- Migros Yemek entegrasyonu tamamlama
- Yemeksepeti entegrasyonu tamamlama
- Restoran Raporlar sayfası

### P2 - Orta Öncelik
- Native kurye uygulaması
- Chat sistemi yeniden etkinleştirme
- Google Maps entegrasyonu

### P3 - Düşük Öncelik
- Login sayfası refaktör
- Dark mode
- Motosikletim özellik geliştirmeleri
- orders.py refaktör (büyük dosya)

---

## Önemli Notlar

### Timezone
Tüm tarih işlemleri `Europe/Istanbul` timezone'u ile yapılmalı.

### Veritabanı Alanları
- Sipariş taşıma ücreti: `delivery_fee` veya `restaurant_fee`
- Restoran pricing: `pricing_type`, `per_package_price`, `km_ranges`, `kdv_rate`
- Kurye fee: `courier_fee`

### Test Kullanıcıları
- Admin: `superadmin` / `123456`
