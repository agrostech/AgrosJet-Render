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
- [x] Restoran KDV Oranı Özelliği (15 Şubat 2026)

### Devam Eden/Bekleyen
- [ ] **P1:** Adisyo Webhook entegrasyonu
- [ ] **P1:** Arka plan görev güvenilirliği (bildirimler/konum)
- [ ] **P1:** Mobil sidebar kurye listesi açılma sorunu
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
- `orders` - Siparişler (restaurant_kdv, pos_commission alanları)
- `transactions` - Muhasebe hareketleri
- `daily_collections` - Günlük tahsilatlar
- `restaurants` - Restoranlar (kdv_rate, pos_commission_rate alanları)
- `admins` - Yöneticiler

## API Endpoints (Önemli)
- `POST /api/auth/admin/login` - Admin girişi
- `GET /api/orders/{company_id}` - Sipariş listesi
- `PUT /api/orders/{order_id}/fees` - Ücret güncelleme (Süperadmin)
- `GET /api/restaurants/pricing/{restaurant_id}` - Restoran ücretlendirme bilgisi
- `PUT /api/restaurants/pricing/{restaurant_id}` - Restoran ücretlendirme güncelleme
- `POST /api/mutabakat/*` - Mütabakat işlemleri
- `POST /api/weekly-hakedis/*` - Hakediş işlemleri

## Son Güncellemeler (15 Şubat 2026)
1. Varsayılan filtre saatleri şirket ayarlarından dinamik olarak çekiliyor
2. Geçmiş siparişlerde süperadmin ücret düzenleyebilir
3. SuperAdmin kontrolü hem role hem is_super_admin field'ını kontrol ediyor
4. **Restoran KDV Oranı:** Restoran ayarlarına KDV oranı eklendi, sipariş tesliminde otomatik hesaplanıyor
5. **KDV Görüntüleme Düzeltmesi:**
   - Admin tarafından yapılan teslim işleminde `restaurant_kdv` alanının kaydedilmemesi sorunu düzeltildi
   - Mevcut teslim edilmiş siparişlerin KDV değerleri hesaplanarak güncellendi
   - SuperAdmin giriş mantığı düzeltildi: `role: superadmin` olan kullanıcılar için de `is_super_admin: true` döndürülüyor
6. **POS Komisyonu Özelliği (15 Şubat 2026):**
   - Restoran ücretlendirme modalına POS komisyon oranı (%) eklendi
   - Sadece kredi kartı (card) ödemeli siparişlerde sipariş tutarı üzerinden POS komisyonu hesaplanıyor
   - Geçmiş siparişler tablosunda POS komisyonu gösteriliyor
   - SuperAdmin ücret düzenleme modalına POS komisyonu alanı eklendi
7. **Ücretlendirme Gösterim Formatı:**
   - Kurye Hakediş (kırmızı), Taşıma Bedeli/KDV/POS (yeşil) olarak yeniden adlandırıldı
   - Kurye atanmamış siparişlerde Kurye Hakediş gösterilmiyor
8. **Filtre Özet Kartı (15 Şubat 2026):**
   - Yeni component: `FilterSummaryCard.jsx`
   - Restoran filtrelemesinde: Taşıma Ücreti, KDV, POS, Nakit/Kredi Kartı Toplamları
   - Kurye filtrelemesinde: Toplam Hakediş, Nakit/Kredi Kartı Toplamları
   - Sadece SuperAdmin için görünür

## Test Bilgileri
- **Super Admin:** username: `onurertas`, password: `123456`
- **Multi-company Admin:** username: `testadmin`, password: `123456`
- **Kurye:** phone: `05527370032`, password: `123456`

## Son Güncellemeler (15 Şubat 2026 - Devam)

### Raporlar Sayfası UI Yenileme
- Filtre bölümü kompakt hale getirildi (tek satır)
- Tablo satırları daha ince yapıldı (`p-2` padding)
- Özet bilgileri tek satırda metin formatında gösteriliyor
- Hem `KuryeRaporlari.jsx` hem `RestoranRaporlari.jsx` güncellendi

### Muhasebe Hareketler İşlem Tipi Etiketleri
- `weekly_hakedis` → "Haftalık Hakediş" (mavi, + işareti)
- `revert_weekly_hakedis` → "Haftalık Hakediş Geri Al" (turuncu, - işareti)
- `HareketlerTab.jsx` dosyasındaki `getActionLabel` fonksiyonu güncellendi

### Bekleyen Sorunlar
- **P1:** Adisyo Ödeme Eşleme Hatası - "Kredi Kartı" ödemeleri "online" olarak kaydediliyor (loglar eklendi, yeni sipariş bekliyor)
- **P1:** Arka Plan Görev Güvenilirliği - Konum takibi ve bildirimler background'da durabilir
- **P1:** Mobil Sidebar Kurye Listesi - Açılır menü sorunu
