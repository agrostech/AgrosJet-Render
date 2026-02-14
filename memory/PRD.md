# ShiftJet - Kurye Takip Sistemi PRD

## Son Güncelleme: 15 Şubat 2026

### ✅ Bu Oturumda Tamamlanan Değişiklikler (15 Şubat 2026)

#### 📊 Haftalık Hakediş Sekmesi - Büyük Güncelleme
Muhasebe sayfasında "Haftalık Hakediş" sekmesi tamamen yeniden tasarlandı:

**Yeni Özellikler:**
1. **Hafta Seçici Dropdown**: Tarih seçimi yerine hafta bazlı görüntüleme (Pazartesi→Pazartesi)
2. **Checkbox ile Kurye Seçimi**: Tek tek veya toplu kurye seçimi
3. **Toplu Hakediş Ekleme**: Seçili kuryelerin hakedişi bakiyelerine eklenir
4. **İşlem Geri Alma**: Sadece son hafta için geri alma imkanı
5. **Otomatik İşleme**: Toggle ile açılır, kapanış saatinden 15 dk sonra otomatik işler
6. **İşlenmiş Belirteci**: İşlenmiş kuryelerde yeşil "İşlendi" badge'i

**Backend (`/app/backend/routers/weekly_hakedis.py`):**
- `GET /api/weekly-hakedis/weeks/{company_id}` - Hafta listesi
- `POST /api/weekly-hakedis/data/{company_id}` - Hafta hakediş verileri
- `POST /api/weekly-hakedis/apply/{company_id}` - Toplu hakediş ekleme
- `POST /api/weekly-hakedis/revert/{company_id}` - Hakediş geri alma
- `GET/PUT /api/weekly-hakedis/auto-settings/{company_id}` - Otomatik ayarlar

**Frontend Bileşenleri:**
- `/app/frontend/src/pages/muhasebe/HaftalikHakedisTab.jsx` - Ana sayfa
- `/app/frontend/src/components/muhasebe/WeekSelector.jsx` - Hafta dropdown
- `/app/frontend/src/components/muhasebe/HakedisTable.jsx` - Checkbox'lı tablo
- `/app/frontend/src/components/muhasebe/HakedisAutoSettings.jsx` - Otomatik toggle
- `/app/frontend/src/components/muhasebe/ApplyHakedisModal.jsx` - Uygulama modalı
- `/app/frontend/src/components/muhasebe/RevertHakedisModal.jsx` - Geri alma modalı

**Scheduler:** Otomatik haftalık hakediş işleme APScheduler'a eklendi (her dakika kontrol)

#### 💰 Sipariş Ücret Sistemi
Her sipariş için kurye ve restoran ücreti otomatik hesaplanıyor:

**Backend Değişiklikleri (`/app/backend/routers/orders.py`):**
- `calculate_distance()` - Haversine formülü ile mesafe hesaplama
- `calculate_fee_from_pricing()` - Paket başı veya KM aralığına göre ücret
- `calculate_order_fees()` - Kurye ve restoran ücretlerini hesaplama
- Sipariş teslim edildiğinde `courier_fee`, `restaurant_fee`, `distance_km` kaydediliyor

**Frontend Değişiklikleri (`GecmisSiparislerPage.jsx`):**
- "Ücretler" sütunu eklendi (K: X₺ / R: Y₺ formatında)
- **Sadece Super Admin görebilir** (isSuperAdmin kontrolü)
- Tablo kompakt hale getirildi

**Silinen Dosyalar:**
- `/app/frontend/src/components/kuryeler/CourierFinanceModal.jsx`
- `/app/frontend/src/components/restoranlar/RestaurantFinanceModal.jsx`

#### 🔧 Adisyo Ödeme Yöntemi Düzeltmesi
Ödeme yöntemi mapping mantığı güncellendi:

**Yeni Mantık:**
1. `paymentMethodId: 1` veya "Nakit" → **cash**
2. External platform (Yemeksepeti, Getir, Migros, Trendyol) → **online**
3. "Kapıda kart/kredi" → **card**
4. "Online/Çevrimiçi" → **online**
5. `paymentMethodId: 2` veya "Kredi Kartı" (Adisyo direkt) → **card**
6. `paymentMethodId: 3+` → **online**
7. Varsayılan → **cash**

**Dosya:** `/app/backend/services/adisyo_service.py`

#### ✅ Aktif Siparişler Sıralaması
Kontrol edildi - Backend'de `created_at: -1` ile en yeni sipariş en üstte sıralanıyor. ✓

#### 🔍 Kurye Şifre Kontrolü - DOĞRULANDI
Kurye şifre oluşturma süreci kontrol edildi ve **düzgün çalıştığı doğrulandı**.

---

### Önceki Oturum Değişiklikleri (14 Şubat 2026)

#### 🏗️ SiparisYonetimiPage Refactoring - TAMAMLANDI
Ana sipariş yönetimi sayfası 2405 satırdan **944 satıra** düşürüldü (%60 azalma):

**Çıkarılan Bileşenler:**
- `/app/frontend/src/utils/orderUtils.js` (261 satır) - Yardımcı fonksiyonlar
- `/app/frontend/src/components/siparis/CourierSidebar.jsx` (304 satır) - Desktop/Mobil kurye listesi
- `/app/frontend/src/components/siparis/OrderDetailModal.jsx` (466 satır) - Sipariş detay modalı
- `/app/frontend/src/components/siparis/CourierDetailModal.jsx` (273 satır) - Kurye detay modalı

**Korunan Özellikler:**
- ✅ Canlı harita ve kurye takibi
- ✅ Sipariş tablosu ve filtreleme
- ✅ Durum değiştirme dropdown'ları
- ✅ Kurye atama/kaldırma
- ✅ Sipariş detay modalı (3 sekme: Detaylar, Konum, Geçmiş)
- ✅ Kurye detay modalı (harita + sipariş listesi)
- ✅ Tab değişiminde harita düzgün çalışıyor (beyaz ekran bug'ı yok)
- ✅ Mobil kurye sidebar collapsible

#### 💰 Finans Özelliği - TAMAMLANDI
Kurye ve Restoran için finansal log/özet görüntüleme modalı eklendi:

**Özellikler:**
- Kuryeler sayfasında her kurye satırında "Finans" butonu
- Restoranlar sayfasında her restoran satırında "Finans" butonu
- Modal içinde 2 sekme:
  - **Taşıma Finansı:** Teslim edilen siparişler listesi, paket başı kazanç
  - **Tahsilat Finansı:** Nakit/Online ödeme ayrımı, toplam tahsilat tutarları

**API Endpoints:**
- `GET /api/couriers/{courier_id}/finance-logs?company_id=X`
- `GET /api/restaurants/{restaurant_id}/finance-logs?company_id=X`

---

### Önceki Oturum Değişiklikleri (12 Şubat 2026)

#### 🔧 Mobil Sidebar Collapsible Bug - ÇÖZÜLDÜ
Kurye listesi collapsible'ları mobil görünümde düzgün çalışıyor:
- Aktif, Dağıtımda, Molada, Çevrimdışı bölümleri açılıp kapanabiliyor
- Önceki oturumda belirtilen hata mevcut değil

#### ⚡ Arka Plan Görev Güvenilirliği İyileştirmeleri
Kurye panelinde bildirim ve konum izleme güvenilirliği artırıldı:

**Wake Lock API:**
- Kurye aktifken ekran açık kalır (pil tasarrufu modunda konum/bildirim kesilmez)
- Arka plandan dönüşte otomatik yeniden etkinleştirme

**Konum İzleme İyileştirmeleri:**
- `watchPosition` + 10 saniyelik yedek interval
- Arka plandan dönüşte konum izleme yeniden başlatılır
- Daha agresif konum parametreleri (timeout: 15s, maximumAge: 5s)

**Service Worker İyileştirmeleri:**
- Cache versiyonu v2'ye yükseltildi
- Keepalive mekanizması eklendi
- API çağrıları cache'den hariç tutuldu
- Bildirim vibrasyon desteği

**Dosyalar:**
- `/app/frontend/src/pages/courier/CourierSiparisPage.jsx`
- `/app/frontend/src/pages/CourierDashboard.jsx`
- `/app/frontend/public/sw.js`

---

### Önceki Oturum Değişiklikleri

#### 🗺️ Rota Optimizasyonu (YENİ - 8 Şubat 2026)
Kurye 2+ siparişi yola çıkardığında tek tuşla optimum rotayı Google Maps'te açar:

**Özellikler:**
- "Rota Oluştur" butonu "Yoldaki Siparişler" başlığının yanında
- Kuryenin GPS konumundan başlayarak en yakın siparişe doğru sıralama (Nearest Neighbor)
- Google Maps'te multi-stop navigasyon URL'i açılır
- Toast ile rota sırası bilgisi

**Dosyalar:**
- `/app/frontend/src/pages/courier/CourierSiparisPage.jsx` (createOptimizedRoute fonksiyonu)

---

#### ⏰ Kurye Bazlı Mola Süresi (YENİ - 8 Şubat 2026)
Her kurye için günlük mola limiti belirlenir ve takip edilir:

**Özellikler:**
- Admin kurye düzenleme modalında "Günlük Mola" dropdown (15dk - 2 saat arası)
- Varsayılan limit: 30 dakika
- Kurye header'daki durum dropdown'unda "Molada (Kalan Xdk)" gösterimi
- Mola limiti dolduğunda kurye molaya çıkamaz (hata mesajı)
- Şirket kapanış saatinde tüm kuryelerin mola süreleri sıfırlanır (APScheduler job)

**API Endpoints:**
- `GET /api/couriers/{id}/break-status` - Mola durumu
- `PUT /api/couriers/{id}/break-limit` - Mola limiti güncelleme

**Dosyalar:**
- `/app/backend/routers/couriers.py` (break-status, break-limit endpoints)
- `/app/backend/server.py` (reset_courier_break_times job)
- `/app/frontend/src/components/kuryeler/CourierEditModal.jsx`
- `/app/frontend/src/pages/CourierDashboard.jsx`

---

#### 📋 Sipariş Listesi Yeniden Düzenleme (8 Şubat 2026)
Kurye sipariş sayfası 2 bölüme ayrıldı:

- **Atanmış Siparişler**: assigned + confirmed durumundaki siparişler (mor başlık)
- **Yoldaki Siparişler**: on_the_way durumundaki siparişler (mavi başlık)

---

#### 🔔 Bildirim Butonu Taşıma (8 Şubat 2026)
- Bildirim butonu sipariş sayfasından header'a taşındı
- Yeşil ikon = aktif, gri ikon = pasif

---

#### 🐛 Bug Fix: Restoran Telefonu (8 Şubat 2026)
- Mevcut 43 siparişe restoran telefonu eklendi
- Kurye artık restoran arama butonunu kullanabilir

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
