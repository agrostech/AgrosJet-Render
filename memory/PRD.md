# ShiftJet - Kurye Yönetim Sistemi PRD

## Orijinal Problem Tanımı
Restoran paneli için kapsamlı kurye yönetim sistemi. Ana özellikler:
- Çoklu platform entegrasyonları (Adisyo, Getir, Trendyol, Yemeksepeti, Migros, SepetTakip)
- Sipariş yönetimi ve durum güncellemeleri
- Kurye takibi ve atama
- Muhasebe ve raporlama
- Sessiz termal yazdırma

## Kullanıcı Personaları
1. **Restoran Yöneticisi** - Siparişleri yönetir, kurye atar, raporları görür
2. **Kurye** - Siparişleri teslim eder, konum paylaşır
3. **Super Admin** - Tüm sistemi yönetir

## Temel Gereksinimler

### Entegrasyonlar
- **Adisyo**: Polling tabanlı sipariş çekme + durum güncelleme (v2 API)
- **Getir/Yemeksepeti/Migros**: Webhook tabanlı (placeholder)
- **SepetTakip**: Webhook tabanlı (3. taraf yapılandırması bekliyor)
- **Trendyol**: Polling tabanlı

### Sessiz Yazdırma
- Yerel Python sunucusu (`localhost:5555`)
- System tray versiyonu (konsol penceresi olmadan)
- ESC/POS termal yazıcı desteği

---

## Tamamlanan İşler

### 20 Şubat 2026 (Güncel Oturum)
- ✅ **Gelişmiş Kurye ETA Hesaplama Sistemi** tamamlandı
  - Backend: `calculate_courier_eta_for_restaurant()` fonksiyonu
  - Yeni endpoint: `GET /api/orders/courier/{courier_id}/eta/{restaurant_id}`
  - Yeni endpoint: `GET /api/orders/restaurant/{restaurant_id}/couriers-with-eta`
  - Kuryenin mevcut konumu, aktif siparişleri ve mesafeleri dikkate alan dinamik hesaplama
  - Çoklu senaryo desteği: boşta kurye, teslimat yapan kurye, teslim alan kurye, karışık durumlar
  - Frontend: RestaurantAnasayfa.jsx'te ETA bilgisi gösterimi
  - Kurye dropdown'unda ETA ve rota özeti görünümü
  - Atanmış kuryelerde dinamik ETA güncelleme (15 saniyede bir)

### 20 Şubat 2026 (Önceki)
- ✅ **Ürün Kategorisi Sıralama** tamamlandı
  - Backend: `PUT /api/products/categories/reorder` endpoint
  - Kategorilere `order` alanı eklendi
  - Frontend: Yukarı/aşağı ok butonları ile sıralama
  - Optimistic UI güncellemesi
  - Sıralama Telefon Siparişi modalında da geçerli
- ✅ **Sidebar Güncellemesi**
  - %15 küçültüldü (w-56 → w-48)
  - Açılır/kapanır özelliği kaldırıldı
  - Sürekli açık, sabit genişlik

### Önceki Oturumlar
- ✅ Sessiz yazıcı sunucusu (Go ile .exe) - AgrosJet_Print_Server.exe
- ✅ Frontend receipt tasarımı (localPrintService.js)
- ✅ Ayarlar sayfası yeniden tasarımı (collapsible cards)
- ✅ Sipariş sayfası UI/UX iyileştirmeleri
- ✅ İptal seçeneği ve onay modalları
- ✅ Restaurant Panel UI yeniden düzenleme (üst navbar)
- ✅ Geçmiş/İptal Siparişler sayfaları
- ✅ Admin panel bug fix (created_at opsiyonel)

---

## Bekleyen İşler

### P0 - Kritik
- [ ] ~~Gelişmiş Kurye ETA Hesaplama~~ ✅ TAMAMLANDI

### P1 - Yüksek Öncelik
- [ ] Adisyo sipariş senkronizasyonu doğrulaması
- [ ] Raporlar sayfası işlevselliği
- [ ] Yemeksepeti entegrasyonu (kimlik bilgileri bekleniyor)
- [ ] Adisyo webhook implementasyonu (polling yerine)

### P2 - Orta Öncelik
- [ ] Arka plan görev güvenilirliği (kurye uygulaması)
- [ ] Mobil sidebar collapsible bug
- [ ] Tarihsel muhasebe veri migration

### P3 - Düşük Öncelik
- [ ] QZ Tray kodlarının temizlenmesi
- [ ] Dark mode tema
- [ ] Motosikletim özellikleri

---

## Bloklanmış İşler
- **SepetTakip**: 3. taraf Base URL yapılandırması gerekli
- **Migros/Getir**: API anahtarları bekleniyor

---

## Teknik Mimari

```
/app/
├── backend/
│   ├── routers/
│   │   ├── orders.py
│   │   │   ├── calculate_courier_eta_for_restaurant()  # YENİ
│   │   │   ├── GET /courier/{id}/eta/{restaurant_id}   # YENİ
│   │   │   └── GET /restaurant/{id}/couriers-with-eta  # YENİ
│   │   └── restaurant_products.py
│   ├── jobs/sync_orders.py (Adisyo polling - 60s)
│   └── services/adisyo_service.py (v2 API)
└── frontend/
    ├── components/restoran/
    │   └── RestaurantNavbar.jsx
    ├── pages/restoran/
    │   ├── RestaurantAnasayfa.jsx  # ETA gösterimi eklendi
    │   ├── RestaurantGecmisSiparisler.jsx
    │   ├── RestaurantIptalSiparisler.jsx
    │   └── RestaurantUrunler.jsx
    └── utils/localPrintService.js
```

## Test Hesapları
- Super Admin: `onurertas` / `125594`
- Restaurant: `testrestaurant` / `password`
- Courier: `05527370032` / `123456`

---

## Yeni API Endpointleri

### Kurye ETA Hesaplama
```
GET /api/orders/courier/{courier_id}/eta/{restaurant_id}

Response:
{
    "eta_minutes": 18,
    "eta_text": "~18 dk",
    "distance_km": 4.05,
    "current_orders_count": 3,
    "route_summary": "3 teslim alım sonra",
    "breakdown": [
        {
            "type": "pickup",
            "description": "Teslim Al: Meydan Avm Terra",
            "distance_km": 2.2,
            "time_mins": 8,
            "is_target": false
        },
        ...
    ]
}
```

### Kuryeler + ETA Listesi
```
GET /api/orders/restaurant/{restaurant_id}/couriers-with-eta

Response:
{
    "couriers": [
        {
            "id": "...",
            "name": "Test Kurye",
            "phone": "05551234567",
            "package_count": 1,
            "eta": {
                "eta_minutes": 15,
                "eta_text": "~15 dk",
                "route_summary": "Doğrudan geliyor"
            }
        }
    ],
    "restriction_mode": "restricted"
}
```
