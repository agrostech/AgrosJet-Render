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

### 20 Şubat 2026
- ✅ Sessiz yazıcı sunucusu (system tray versiyonu) tamamlandı
  - `/app/frontend/public/shiftjet_print_server_systray.py`
  - `pystray` ile sistem tepsisi ikonu
  - Flask sunucusu arka planda çalışıyor
  - Yazıcı seçimi, test yazdırma menüsü
  - Windows bildirimleri
- ✅ Tek tıkla kurulum batch dosyası oluşturuldu
  - `/app/frontend/public/ShiftJet_Kurulum.bat`
  - Otomatik kütüphane kurulumu
  - PyInstaller ile .exe oluşturma
  - Masaüstüne "ShiftJet Print Server.exe" koyar
- ✅ **DOĞRUDAN EXE DOSYASI OLUŞTURULDU**
  - `/app/frontend/public/ShiftJet_Print_Server.exe`
  - Go ile yazıldı, cross-compile edildi
  - Hiçbir kurulum gerektirmez
  - İndir, çalıştır, bitti

### Önceki Oturumlar
- ✅ Adisyo entegrasyonu yenilendi (v2 API)
- ✅ Yerel yazıcı sunucusu (temel versiyon)
- ✅ Ayarlar sayfası yazıcı yapılandırması

---

## Bekleyen İşler

### P0 - Kritik
- [ ] Adisyo sipariş senkronizasyonu - "sipariş gelmedi" sorunu
- [ ] Backend sync_orders.py inceleme

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
│   ├── jobs/sync_orders.py (Adisyo polling - 60s)
│   ├── services/adisyo_service.py (v2 API)
│   └── routers/orders.py, webhooks/
└── frontend/
    ├── public/shiftjet_print_server*.py
    └── src/pages/restoran/RestaurantAyarlar.jsx
```

## Test Hesapları
- Super Admin: `onurertas` / `125594`
- Restaurant: `testrestaurant` / `password`
- Courier: `05527370032` / `123456`
