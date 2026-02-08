# ShiftJet - Kurye Takip Sistemi PRD

## Son Güncelleme: 8 Şubat 2026

### ✅ Bu Oturumda Tamamlanan Değişiklikler

#### 🚀 Kurye Paneli - Durum Kontrolü (YENİ)
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

**Dosyalar:**
- `/app/frontend/src/pages/CourierDashboard.jsx` (GÜNCELLENDİ)
- `/app/frontend/src/components/courier/CourierSidebar.jsx` (GÜNCELLENDİ)
- `/app/backend/routers/couriers.py` (GÜNCELLENDİ - GET /couriers/{id} eklendi)

---

#### 🚀 Kurye Paneli - Sipariş Yönetimi (YENİ)
Kuryeler için tam özellikli sipariş yönetimi sekmesi eklendi:

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
- 15 saniyede bir otomatik yenileme
- Status history kaydı (kim ne zaman değiştirdi)

**Dosyalar:**
- `/app/frontend/src/pages/courier/CourierSiparisPage.jsx` (YENİ)
- `/app/frontend/src/pages/CourierDashboard.jsx` (GÜNCELLENDİ)
- `/app/backend/routers/orders.py` (GÜNCELLENDİ)

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
GET  /api/orders/courier/{courier_id}/active  - Kuryenin aktif siparişleri
POST /api/orders/courier/{courier_id}/order/{order_id}/confirm - Siparişi onayla
POST /api/orders/courier/{courier_id}/order/{order_id}/pickup  - Yola çık
POST /api/orders/courier/{courier_id}/order/{order_id}/deliver - Teslim et
POST /api/orders/courier/{courier_id}/order/{order_id}/reject  - Reddet
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
- Kurye durum kontrolü (Aktif/Molada/Çevrimdışı)
- Adisyo gerçek API entegrasyonu (API anahtarları gerekli)
- Push notification (sipariş atandığında)

### P1
- Webhook endpoint'leri
- Kurye canlı konum takibi
- Admin panelinde kurye detay modalındaki harita düzeltmesi
- Restaurant marker stilini yuvarlak yap

### Backlog
- Chat sistemi
- Dark mode
- SiparisYonetimiPage.jsx refactoring (~1700+ satır)
