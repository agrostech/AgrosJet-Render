# ShiftJet - Kurye Takip Sistemi PRD

## Proje Özeti
ShiftJet, kurye yönetimi, muhasebe takibi, vardiya planlaması ve işletme yönetimi için kapsamlı bir web uygulamasıdır.

---

## Son Güncelleme: 2 Şubat 2026

### ✅ Tamamlanan Özellikler (Bu Oturum)

#### 1. Mobil UX Refactor - Muhasebe Tabları
- **Kuryeler**, **İşletmeler** ve **Cariler** tabları için mobil UX iyileştirmesi
- Mobilde: Liste görünümünden öğe seçildiğinde aynı kart içinde detay görünümüne geçiş
- "Listeye Dön" butonu ile geri dönüş
- Sadece mobil cihazlarda (lg breakpoint altında) aktif
- **Dosyalar:** `KuryelerTab.jsx`, `IsletmelerTab.jsx`, `CarilerTab.jsx`

### ✅ Önceki Oturumda Tamamlananlar

1. **Motosikletim Özelliği** - Kuryeler için motosiklet ve bakım takibi
2. **Günlük Tahsilat Refactor** - Yönetici bazlı tahsilat, süper admin onayı
3. **Yedekleme Sistemi** - APScheduler + Cloudflare R2 entegrasyonu
4. **Tab Kalıcılığı** - Muhasebe sayfası tab hatırlama
5. **Numara Fontu Düzeltmesi** - Inter font ile "0" görünüm sorunu çözüldü
6. **Kurye Paneli Mobil Navigasyon** - "Daha Fazla" dropdown menüsü

---

## 🔴 Kullanıcı Doğrulaması Bekleyen (P0/P1)

### P0 - Mobil Dosya Yükleme
- `accept="*/*"` düzeltmesi uygulandı
- Fiziksel mobil cihazda test edilmesi gerekiyor
- Test noktaları: Mütabakat, Kurye Fatura, Evrak Yükleme

### P1 - Fatura Eksikliği (Shortfall) E2E Testi
- Tam iş akışının kullanıcı tarafından test edilmesi gerekiyor

### P1 - Kurye Fatura Görünürlüğü
- Birden fazla fatura görünürlüğü kontrolü

### P2 - Yedekleme E-posta
- SMTP ayarları yapılandırılarak test edilmeli

---

## 🔵 Gelecek Görevler (Backlog)

### Refactoring (P1)
- `FaturalarTab.jsx` - Büyük dosya, parçalanmalı
- `KuryelerTab.jsx` - Hook ayrıştırma
- `useAccountingTab.js` - Hook bölünmesi

### Motosikletim Geliştirmeleri
- Bakım geçmişi görünümü
- Motosiklet istatistik dashboard'u

---

## Teknik Mimari

### Backend
- FastAPI + MongoDB
- APScheduler (otomatik yedekleme)
- boto3 (Cloudflare R2)

### Frontend
- React + Tailwind CSS
- Shadcn/UI bileşenleri

### Veritabanı Koleksiyonları
- `admins`, `couriers`, `companies`
- `transactions`, `invoices`
- `motorcycles`, `motorcycle_maintenances`
- `daily_collections`, `admin_collection_status`
- `backup_settings`

---

## API Endpoints (Önemli)

### Muhasebe
- `GET/POST /api/transactions`
- `GET /api/daily-collections/admin-summary`
- `POST /api/daily-collections/mark-admin-collection-as-received`

### Motosiklet
- `GET/POST /api/motorcycles`
- `POST /api/motorcycles/maintenance`
- `PUT/DELETE /api/motorcycles/{id}`

### Yedekleme
- `POST /api/backup/company/{id}/send-now`
