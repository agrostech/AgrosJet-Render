# ShiftJet - Kurye Yönetim Sistemi PRD

## Proje Özeti
Adisyo entegrasyonlu, kapsamlı sipariş yönetim sistemi. Kurye takibi, muhasebe, hakediş hesaplama ve daha fazlasını içerir.

## Kullanıcı Rolleri
- **Süper Admin:** Tüm yetkiler, sistem ayarları
- **Admin:** Şirket bazlı yetkiler, kısıtlı erişim
- **Kurye:** Sipariş yönetimi, kendi muhasebesi

## Temel Özellikler

### Tamamlanan Özellikler
- [x] Sipariş Yönetimi (Aktif, Geçmiş, İptal)
- [x] Kurye Takibi ve Konum
- [x] Günlük Mütabakat Sistemi
- [x] Haftalık Hakediş Hesaplama
- [x] Restoran Yönetimi
- [x] Vardiya Yönetimi
- [x] Zimmet Takibi
- [x] JetPuan Market Sistemi
- [x] Push Bildirimler
- [x] Dinamik Filtre Saatleri (Şirket ayarlarından)
- [x] Sipariş Ücret Düzenleme (Süperadmin)

### Devam Eden/Bekleyen
- [ ] **P0:** Kurye şifre oluşturma sorunu araştırması
- [ ] **P1:** Adisyo Webhook entegrasyonu
- [ ] **P1:** Molada/çevrimdışı kuryelere atama engeli
- [ ] **P2:** Finans raporlaması

### Gelecek Özellikler
- [ ] Chat sistemi (yeniden aktifleştirme)
- [ ] Dark mode
- [ ] Sipariş geçmişi refaktör (FilteredOrderTable)
- [ ] Motosikletim özellik geliştirmeleri

## Teknik Mimari

### Backend
- FastAPI
- MongoDB
- APScheduler (arka plan görevleri)
- PyWebPush (bildirimler)

### Frontend
- React
- Shadcn/UI
- Leaflet (haritalar)
- Sonner (toast bildirimleri)

### Entegrasyonlar
- Adisyo (sipariş kaynağı)

## Veritabanı Şeması (Ana Koleksiyonlar)
- `companies` - Şirketler
- `couriers` - Kuryeler
- `orders` - Siparişler
- `transactions` - Muhasebe hareketleri
- `daily_collections` - Günlük tahsilatlar
- `restaurants` - Restoranlar
- `admins` - Yöneticiler

## API Endpoints (Önemli)
- `POST /api/auth/admin/login` - Admin girişi
- `GET /api/orders/{company_id}` - Sipariş listesi
- `PUT /api/orders/{order_id}/fees` - Ücret güncelleme (Süperadmin)
- `POST /api/mutabakat/*` - Mütabakat işlemleri
- `POST /api/weekly-hakedis/*` - Hakediş işlemleri

## Son Güncellemeler (15 Şubat 2026)
1. Varsayılan filtre saatleri şirket ayarlarından dinamik olarak çekiliyor
2. Geçmiş siparişlerde süperadmin ücret düzenleyebilir
3. SuperAdmin kontrolü hem role hem is_super_admin field'ını kontrol ediyor

## Test Bilgileri
- **Multi-company Admin:** username: `testadmin`, password: `123456`
- **Kurye:** phone: `05527370032`, password: `123456`
