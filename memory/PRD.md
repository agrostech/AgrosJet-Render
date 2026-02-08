# ShiftJet - Kurye Takip Sistemi PRD

## Proje Özeti
ShiftJet, kurye yönetimi, muhasebe takibi, vardiya planlaması ve işletme yönetimi için kapsamlı bir web uygulamasıdır.

---

## Son Güncelleme: 8 Şubat 2026

### ✅ Tamamlanan Özellikler (Bu Oturum)

#### 1. Sipariş Yönetimi Sistemi (YENİ - Adisyo Entegrasyon Temeli)
- **Sipariş Yönetimi Sekmesi** - Tam işlevsel admin paneli sekmesi
  - Canlı İstanbul haritası (Leaflet/OpenStreetMap)
  - İstatistik kartları: Toplam, Atanmamış, Yolda, Teslim
  - Sipariş listesi filtreli görünüm
  - Sipariş detay modal (müşteri, adres, ürünler, toplam)
  - Kurye atama modal
  - Durum güncelleme butonları
  - Mock sipariş oluşturma (test için)
- **Backend:** `/app/backend/routers/orders.py`
- **Frontend:** `/app/frontend/src/pages/admin/SiparisYonetimiPage.jsx`

#### 2. Restoranlar Yönetimi (YENİ)
- **Restoranlar Sekmesi** - Ana menüde ayrı sekme
  - Restoran ekleme/düzenleme/silme/arşivleme
  - Konum bilgileri (enlem/boylam)
  - **Adisyo API Entegrasyonu bilgileri:**
    - API Key
    - API Secret  
    - Branch ID
  - Bağlantı test butonu
  - Arama ve filtreleme
- **Backend:** `/app/backend/routers/restaurants.py`
- **Frontend:** `/app/frontend/src/pages/admin/RestoranlarPage.jsx`

### ✅ Önceki Oturumlarda Tamamlananlar

1. **Multi-Company System** - Şirket değiştirici, çoklu şirket yönetimi
2. **System Admin Panel** - Şirketler, Yöneticiler, Kuryeler tabs
3. **Chat/Mesajlaşma Sistemi** - WebSocket ile gerçek zamanlı
4. **Mobil UX Refactor** - Responsive tasarım
5. **Günlük Tahsilat** - Kümülatif sistem
6. **Market Sistemi** - JetPuan sipariş
7. **Motosikletim** - Kurye motosiklet takibi
8. **Yedekleme Sistemi** - APScheduler + Cloudflare R2

---

## 🔴 Kullanıcı Doğrulaması Bekleyen (P0)

### P0 - Mobil Dosya Yükleme
- Fiziksel mobil cihazda test gerekiyor
- Test noktaları: Mütabakat, Kurye Fatura, Evrak Yükleme, Chat Dosya

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

### Yeni Veritabanı Koleksiyonları
- `restaurants` - Restoran bilgileri + Adisyo API credentials
- `orders` - Sipariş yönetimi

### API Endpoints (Yeni)

#### Restoranlar
- `GET /api/restaurants/{company_id}` - Şirket restoranları
- `POST /api/restaurants` - Restoran ekle
- `PUT /api/restaurants/{id}` - Güncelle
- `DELETE /api/restaurants/{id}` - Sil
- `POST /api/restaurants/{id}/test-adisyo` - API test

#### Siparişler
- `GET /api/orders/{company_id}` - Siparişleri listele
- `POST /api/orders/{company_id}/{order_id}/assign` - Kurye ata
- `POST /api/orders/{company_id}/{order_id}/status` - Durum güncelle
- `POST /api/orders/{company_id}/generate-mock` - Mock oluştur (test)
- `DELETE /api/orders/{company_id}/clear-mock` - Mock temizle

---

## Test Credentials
- **System Admin:** ShiftJet / Delivery32..
- **Test Admin:** testadmin / 123456
- **Test Company ID:** af44eb06-9148-4990-8338-ea0208a47734

---

## Notlar
- Sipariş sistemi şu an MOCK DATA ile çalışıyor
- Gerçek Adisyo entegrasyonu için API anahtarları gerekli
- Restoranlar artık ayrı sekmeden yönetiliyor (Muhasebe'den bağımsız)
