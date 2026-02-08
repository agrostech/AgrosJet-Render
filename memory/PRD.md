# ShiftJet - Kurye Takip Sistemi PRD

## Proje Özeti
ShiftJet, kurye yönetimi, muhasebe takibi, vardiya planlaması ve işletme yönetimi için kapsamlı bir web uygulamasıdır.

---

## Son Güncelleme: 8 Şubat 2026

### ✅ Tamamlanan Özellikler (Bu Oturum)

#### 1. Sipariş Yönetimi UI İyileştirmeleri
- **İstatistikler kompakt** - Üstte badge olarak gösteriliyor (yer kaplamıyor)
- **Sipariş kartı** - Restoran adı öncelikli gösterim (ORD-xxx yerine)
- **Harita zoom** - 1 scroll = 1 zoom level (hassasiyet düzeltildi)
- **Şirket ili bazlı harita ortalama** - Harita şirketin iline otomatik ortalanıyor

#### 2. Restoran Yönetimi İyileştirmeleri
- **Haritadan konum seçimi** - Enlem/boylam manuel giriş yerine haritadan tıklayarak işaretleme
- **Menü sırası düzeltildi** - Restoranlar sekmesi Kuryeler'in altına taşındı

#### 3. Şirket Yönetimi İyileştirmeleri
- **İl seçimi eklendi** - Şirket eklerken/düzenlerken Türkiye illeri dropdown
- **Harita otomatik ortalama** - Sipariş haritası şirketin iline göre ortalanıyor

### ✅ Önceki Oturumlarda Tamamlananlar

1. **Sipariş Yönetimi Sistemi** - Harita + sipariş listesi + kurye atama
2. **Restoranlar Yönetimi** - CRUD + Adisyo API bilgileri
3. **Multi-Company System** - Şirket değiştirici
4. **System Admin Panel** - Şirketler, Yöneticiler, Kuryeler tabs
5. **Chat/Mesajlaşma Sistemi** - WebSocket
6. **Mobil UX Refactor** - Responsive tasarım
7. **Günlük Tahsilat** - Kümülatif sistem
8. **Market Sistemi** - JetPuan
9. **Motosikletim** - Kurye motosiklet takibi
10. **Yedekleme Sistemi** - APScheduler + Cloudflare R2

---

## 🔴 Kullanıcı Doğrulaması Bekleyen (P0)

### P0 - Mobil Dosya Yükleme
- Fiziksel mobil cihazda test gerekiyor

### P0 - Adisyo Gerçek API Entegrasyonu
- Şu an mock data kullanılıyor
- Gerçek API bağlantısı için kullanıcıdan API anahtarları gerekli

---

## 🔵 Yaklaşan Görevler (P1-P2)

### Adisyo Entegrasyonu - Faz 2 (P1)
- Webhook endpoint'leri (order.created, order.updated)
- Gerçek sipariş çekme
- Kurye canlı konum takibi
- Push notification entegrasyonu

### Refactoring (P2)
- `SystemDashboard.jsx` - Bileşenlere ayırma
- `GuncelDurumPage.jsx` - Taksit modal extraction

---

## 🟢 Gelecek Görevler (Backlog)

- Chat sistemi yeniden aktifleştirme
- Dark mode implementasyonu
- Motosikletim feature geliştirmeleri
- Kurye mobil app için sipariş kabul/red akışı

---

## Teknik Mimari

### Backend
- FastAPI + MongoDB
- WebSocket (chat için)
- APScheduler (otomatik yedekleme)
- boto3 (Cloudflare R2)

### Frontend
- React + Tailwind CSS
- Shadcn/UI bileşenleri
- Leaflet (harita)

### Veritabanı Koleksiyonları
- `companies` - Şirket bilgileri (artık city, city_lat, city_lng dahil)
- `restaurants` - Restoran bilgileri + Adisyo API credentials
- `orders` - Sipariş yönetimi

### Türkiye İlleri (Harita Koordinatları)
Frontend'de TURKEY_CITIES array'i ile 20 büyük il koordinatları mevcut.

---

## Test Credentials
- **System Admin:** ShiftJet / Delivery32..
- **Test Admin:** testadmin / 123456

---

## Notlar
- Sipariş sistemi **MOCK DATA** ile çalışıyor
- Gerçek Adisyo entegrasyonu için API anahtarları gerekli
- Restoranlar artık haritadan konum seçimiyle ekleniyor
