# ShiftJet - Kurye Takip Sistemi PRD

## Son Güncelleme: 8 Şubat 2026

### ✅ Bu Oturumda Tamamlanan Değişiklikler

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
  on_the_way: "Yolda",
  delivered: "Teslim Edildi",
  cancelled: "İptal Edildi"
}
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

---

## Bekleyen Görevler

### P0
- Adisyo gerçek API entegrasyonu (API anahtarları gerekli)
- Mobil dosya yükleme doğrulaması

### P1
- Webhook endpoint'leri
- Kurye canlı konum takibi
- Push notification

### Backlog
- Chat sistemi
- Dark mode
