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

### 20 Şubat 2026 (Son Oturum)
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

### Önceki Oturum
- ✅ Sessiz yazıcı sunucusu (Go ile .exe) - AgrosJet_Print_Server.exe
- ✅ Frontend receipt tasarımı (localPrintService.js)
- ✅ Ayarlar sayfası yeniden tasarımı (collapsible cards)
- ✅ Sipariş sayfası UI/UX iyileştirmeleri
- ✅ İptal seçeneği ve onay modalları

---

## Bekleyen İşler

### P0 - Kritik
- [ ] Adisyo sipariş senkronizasyonu - "sipariş gelmedi" sorunu doğrulaması

### P1 - Yüksek Öncelik
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
│   ├── routers/products.py (kategori sıralama endpoint)
│   ├── jobs/sync_orders.py (Adisyo polling - 60s)
│   └── services/adisyo_service.py (v2 API)
└── frontend/
    ├── components/restoran/RestaurantSidebar.jsx (sabit sidebar)
    ├── pages/restoran/RestaurantUrunler.jsx (kategori sıralama)
    └── utils/localPrintService.js (fiş tasarımı)
```

## Test Hesapları
- Super Admin: `onurertas` / `125594`
- Restaurant: `testrestaurant` / `password`
- Courier: `05527370032` / `123456`
