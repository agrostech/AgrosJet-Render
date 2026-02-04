# ShiftJet - Kurye Takip Sistemi PRD

## Proje Özeti
ShiftJet, kurye yönetimi, muhasebe takibi, vardiya planlaması ve işletme yönetimi için kapsamlı bir web uygulamasıdır.

---

## Son Güncelleme: 4 Şubat 2026

### ✅ Tamamlanan Özellikler (Bu Oturum)

#### 1. Chat/Mesajlaşma Sistemi (YENİ)
- Admin ve kuryeler arası gerçek zamanlı mesajlaşma
- 1-1 ve grup sohbetleri desteği
- Dosya ve resim gönderme
- Okunmamış mesaj sayacı (badge)
- WebSocket ile canlı güncelleme
- Şirket bazlı ayrım (company-specific)
- **Backend:** `/app/backend/routers/chat.py`
- **Frontend:** `ChatPage.jsx`, `ChatSidebar.jsx`, `MessagePane.jsx`, `NewChatModal.jsx`
- **Hook:** `useChatData.js`
- **Test Durumu:** %100 (15/15 backend, tüm frontend testleri geçti)

### ✅ Önceki Oturumlarda Tamamlananlar

1. **Mobil UX Refactor** - Muhasebe tabları için in-place detail view
2. **Günlük Tahsilat** - Kümülatif sistem, reset butonu, geçmiş log
3. **Haftalık Özet Barı** - Günlük Tahsilat ve Mütabakat tablarında
4. **Kurye Deaktivasyonu** - Otomatik logout, login engeli
5. **Telefon Doğrulama** - Kayıt ve giriş için numara validasyonu
6. **Market Sistemi** - Şirkete özel sipariş ve badge
7. **Motosikletim Özelliği** - Kurye motosiklet ve bakım takibi
8. **Yedekleme Sistemi** - APScheduler + Cloudflare R2

---

## 🔴 Kullanıcı Doğrulaması Bekleyen (P0/P1)

### P0 - Mobil Dosya Yükleme
- `accept="*/*"` düzeltmesi uygulandı
- Fiziksel mobil cihazda test edilmesi gerekiyor
- Test noktaları: Mütabakat, Kurye Fatura, Evrak Yükleme, Chat Dosya

### P1 - Fatura Eksikliği (Shortfall) E2E Testi
- Tam iş akışının kullanıcı tarafından test edilmesi gerekiyor

---

## 🔵 Gelecek Görevler (Backlog)

### Refactoring (P1)
- `GunlukTahsilatTab.jsx` - Çok büyük, parçalanmalı
- `FaturalarTab.jsx` - Büyük dosya, parçalanmalı
- `useAccountingTab.js` - Hook bölünmesi

### Motosikletim Geliştirmeleri
- Bakım geçmişi görünümü
- Motosiklet istatistik dashboard'u

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

### Veritabanı Koleksiyonları
- `admins`, `couriers`, `companies`
- `transactions`, `invoices`
- `motorcycles`, `motorcycle_maintenances`
- `daily_collections`, `admin_collection_status`
- `chat_conversations`, `chat_messages` (YENİ)
- `backup_settings`

---

## API Endpoints (Önemli)

### Chat (YENİ)
- `GET /api/chat/conversations/{user_id}` - Kullanıcı sohbetleri
- `POST /api/chat/conversations` - Yeni sohbet oluştur
- `GET /api/chat/conversations/{id}/messages` - Mesajları getir
- `POST /api/chat/messages` - Mesaj gönder
- `GET /api/chat/users/search` - Kullanıcı ara
- `POST /api/chat/upload` - Dosya yükle
- `WS /api/chat/ws/{user_id}` - WebSocket bağlantısı

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
