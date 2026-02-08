# ShiftJet - Kurye Takip Sistemi PRD

## Son Güncelleme: 8 Şubat 2026

### ✅ Bu Oturumda Tamamlanan Değişiklikler

#### 🗺️ Rota Optimizasyonu (YENİ - 8 Şubat 2026)
Kurye 2+ siparişi yola çıkardığında tek tuşla optimum rotayı Google Maps'te açar:

**Özellikler:**
- "Rota" butonu üst header'da (2+ yolda sipariş varken görünür)
- Badge ile yolda sipariş sayısı gösterimi
- Kuryenin GPS konumundan başlayarak en yakın siparişe doğru sıralama (Nearest Neighbor)
- Google Maps'te multi-stop navigasyon URL'i açılır
- Toast ile rota sırası bilgisi (1. Müşteri A → 2. Müşteri B → 3. Müşteri C)

**Dosyalar:**
- `/app/frontend/src/pages/courier/CourierSiparisPage.jsx` (createOptimizedRoute fonksiyonu)

---

#### 📝 Adisyo Not Ayrıştırma (DÜZELTİLDİ - 8 Şubat 2026)
Adisyo'dan gelen siparişlerdeki notlar düzgün kategorize ediliyor:

**Özellikler:**
- Ödeme bilgileri (Online Kredi/Banka Kartı vb.) otomatik temizleniyor
- Müşteri notları (CUSTOMER:) - operasyonel notlar (örn: "ömer aybak çiğköfteye gelicek")
- Mutfak notları (KITCHEN:) - yemek talimatları (örn: "çatal bıçak göndermeyin")
- Frontend'de CUSTOMER notları kırmızı, KITCHEN notları normal renkte

**Dosyalar:**
- `/app/backend/services/adisyo_service.py` (parse_and_categorize_notes fonksiyonu)
- `/app/frontend/src/pages/courier/CourierSiparisPage.jsx` (not gösterimi)

---

#### 🔴 Yuvarlak Restoran Markerları (DÜZELTİLDİ - 8 Şubat 2026)
Haritadaki restoran ikonları artık yuvarlak görünüyor:

**Özellikler:**
- Leaflet divIcon className kaldırıldı
- Inline style ile border-radius: 50% zorlandı
- -webkit-border-radius eklendi (cross-browser)
- CSS'te .leaflet-marker-icon > div seçicisi güçlendirildi

**Dosyalar:**
- `/app/frontend/src/pages/admin/SiparisYonetimiPage.jsx` (updateMapMarkers)
- `/app/frontend/src/index.css` (Leaflet override CSS)

---

#### 🔔 Push Notification
Kurye sipariş atandığında sesli bildirim alır:

**Özellikler:**
- Browser notification desteği (izin gerekli)
- Ses çalma (3 tekrarlı alarm)
- Toast bildirimi
- "Bildirimleri açın" banner ve "İzin Ver" butonu
- 10 saniyede bir yeni sipariş kontrolü

**Dosyalar:**
- `/app/frontend/src/pages/courier/CourierSiparisPage.jsx` (GÜNCELLENDİ)

---

#### 🗺️ Kurye Konumları Haritada (YENİ)
Admin panelinde aktif ve molada kuryelerin konumları görünür:

**Özellikler:**
- Yeşil marker: Aktif kuryeler
- Sarı marker: Molada kuryeler
- Çevrimdışı kuryelerin konumu gizli
- Motosiklet ikonu ile gösterim
- Konum 30 saniyede bir güncellenir (geolocation API)

**Dosyalar:**
- `/app/frontend/src/pages/admin/SiparisYonetimiPage.jsx` (GÜNCELLENDİ)
- `/app/frontend/src/pages/CourierDashboard.jsx` (konum takibi)
- `/app/backend/routers/couriers.py` (PUT /couriers/{id}/location)

---

#### ⏰ Şirket Çalışma Saatleri (YENİ)
Admin Sistem sayfasında açılış/kapanış saati ayarı:

**Özellikler:**
- Açılış ve kapanış saati seçimi (time picker)
- Raporlarda varsayılan olarak kullanılacak
- Collapsible kart tasarımı

**Dosyalar:**
- `/app/frontend/src/pages/SistemPage.jsx` (GÜNCELLENDİ)
- `/app/backend/routers/companies.py` (GET/PUT /companies/{id}/working-hours)

---

#### 🎨 Kurye Durum İkonları (GÜNCELLENDİ)
- **Aktif:** ✓ Tik ikonu (yeşil)
- **Molada:** ☕ Fincan ikonu (sarı)  
- **Çevrimdışı:** ⊗ X ikonu (gri)

**Dosyalar:**
- `/app/frontend/src/pages/CourierDashboard.jsx`
- `/app/frontend/src/components/courier/CourierSidebar.jsx`

---

#### 🚀 Kurye Paneli - Durum Kontrolü
Kuryeler artık kendi durumlarını değiştirebilir:

**Durumlar:**
- **Aktif** (Yeşil) - Sipariş almaya hazır
- **Molada** (Sarı) - Geçici olarak müsait değil
- **Çevrimdışı** (Gri) - Çalışmıyor

**Özellikler:**
- Desktop sidebar'da durum dropdown'u
- Mobil header'da durum butonu
- Collapsed sidebar'da durum ikonu
- Admin panelinde kurye durumları görünür
- Anlık toast bildirimi

---

#### 🚀 Kurye Paneli - Sipariş Yönetimi
Kuryeler için tam özellikli sipariş yönetimi sekmesi:

**Akış:**
1. **Yeni Sipariş Atandı** → Kurye "Siparişi Gördüm" butonunu görür (detaylar gizli)
2. **Siparişi Gördüm** → Sipariş detayları açılır, durum "Onaylandı" olur
3. **Yola Çık** → Kurye siparişi almaya gider, durum "Yolda" olur
4. **Teslim Et** → Sipariş tamamlanır, durum "Teslim Edildi" olur

**Özellikler:**
- Sipariş kartı: Restoran, müşteri, adres, ürünler, toplam, not bilgileri
- "Yol Tarifi" butonu: Google Maps'te açar
- "Ara" butonu: Müşteriyi arar
- Mobil uyumlu tasarım
- Status history kaydı (kim ne zaman değiştirdi)

---

### Önceki Tamamlanan Değişiklikler

#### 1. Türkiye 81 İl Listesi
- Tüm 81 il alfabetik sırayla eklendi (Isparta dahil)
- Her ilin koordinatları mevcut

#### 2. Harita Scroll Hassasiyeti Düzeltildi
- `wheelPxPerZoomLevel: 300` - 1 scroll ≈ 1 zoom level
- Daha kontrollü zoom deneyimi

#### 3. Sipariş Durumu Dropdown
- Sıralı butonlar yerine tek dropdown
- İstenilen durum direkt seçilebilir
- Durumlar: Hazırlanıyor, Hazır, Kurye Atandı, Yolda, Teslim Edildi, İptal Edildi
- "Yeni" ve "Kurye Onayladı" durumları kaldırıldı

#### 4. Diğer Düzeltmeler
- updateMapMarkers'da null kontrolü eklendi
- Menü sırası: Restoranlar Kuryeler'in altında
- İstatistikler kompakt badge formatında
- Sipariş kartında restoran adı öncelikli

---

## Teknik Detaylar

### Sipariş Durumları (Güncel)
```javascript
ORDER_STATUSES = {
  preparing: "Hazırlanıyor",
  ready: "Hazır", 
  assigned: "Kurye Atandı",
  confirmed: "Onaylandı",  // Kurye siparişi gördü
  on_the_way: "Yolda",
  delivered: "Teslim Edildi",
  cancelled: "İptal Edildi"
}
```

### Kurye API Endpoints
```
GET  /api/couriers/{courier_id}                                - Kurye bilgisi
PUT  /api/couriers/{courier_id}/availability                   - Durum güncelle
PUT  /api/couriers/{courier_id}/location                       - Konum güncelle
GET  /api/orders/courier/{courier_id}/active                   - Kuryenin aktif siparişleri
POST /api/orders/courier/{courier_id}/order/{order_id}/confirm - Siparişi onayla
POST /api/orders/courier/{courier_id}/order/{order_id}/pickup  - Yola çık
POST /api/orders/courier/{courier_id}/order/{order_id}/deliver - Teslim et
POST /api/orders/courier/{courier_id}/order/{order_id}/reject  - Reddet
```

### Şirket API Endpoints
```
GET  /api/companies/{company_id}/working-hours                 - Çalışma saatleri
PUT  /api/companies/{company_id}/working-hours                 - Çalışma saatleri güncelle
```

### Harita Zoom Ayarları
```javascript
{
  scrollWheelZoom: true,
  zoomSnap: 1,
  zoomDelta: 1,
  wheelPxPerZoomLevel: 300
}
```

---

## Test Credentials
- **System Admin:** ShiftJet / Delivery32..
- **Test Admin:** testadmin / 123456
- **Test Courier:** 05551234567 / 123456

---

## Bekleyen Görevler

### P0
- Adisyo gerçek API entegrasyonu (API anahtarları gerekli)

### P1
- Webhook endpoint'leri
- Admin panelinde kurye detay modalındaki harita düzeltmesi
- Restaurant marker stilini yuvarlak yap

### Backlog
- Chat sistemi
- Dark mode
- SiparisYonetimiPage.jsx refactoring (~1700+ satır)
