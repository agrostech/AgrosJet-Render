# ShiftJet Kurye Yönetim Sistemi PRD

## Problem Statement
Multi-tenant kurye yönetim sistemi. Kuryeler global kayıt olur (telefon eşsiz), şirketler kuryeleri telefon ile kendi sistemlerine ekler.

## User Personas & Hiyerarşi
1. **Sistem Yöneticisi** (`systemadmin` / `System123!`): Şirketleri yönetir, süper admin atar
2. **Süper Admin** (`onurertas` / `Delivery32..`): Şirkete bağlı, otomatik login, adminleri/kuryeleri yönetir
3. **Admin**: Yetkilere göre çalışır, Super Admin tarafından yetkilendirilir
4. **Kurye**: Global kayıt, şirketlere bağlanabilir

## Core Requirements
- Kuryeler şirket bağımsız kayıt olur (telefon unique, `05XXXXXXXXX` format)
- Şirketler kuryeleri telefon ile ekler
- Admin/Süper Admin girişte otomatik şirketine bağlanır
- Login'de şirket seçimi YOK
- Türkçe karakter desteği (İ, Ş, Ğ, Ü, Ö, Ç)
- Mobile-first responsive tasarım
- "Beni Hatırla" özelliği - işaretlenmezse 60 dakika oturum süresi
- Gün tanımı: 06:00'da başlar, 05:59'da biter (raporlama için)

## What's Been Implemented (Jan 2026)

### Kullanıcı Yönetimi
- [x] Global kurye kayıt sistemi (validasyon ile)
- [x] Telefon ve plaka formatı doğrulama
- [x] Telefon ile kurye arama ve şirkete ekleme
- [x] Otomatik şirket bağlantılı admin girişi
- [x] Sistem Yöneticisi Dashboard (şirket yönetimi)
- [x] Admin/Süper Admin Dashboard
- [x] Kurye Dashboard (şirket bekleme durumu, çoklu şirket desteği)
- [x] "Beni Hatırla" özelliği ve oturum süresi yönetimi
- [x] Super Admin düzenleme ve silme

### Vardiya Yönetimi (Tamamlandı - 15 Ocak 2026)
- [x] Vardiya oluşturma/düzenleme/silme
- [x] Kurye-vardiya atama (gün bazlı)
- [x] İzin listesi yönetimi (izindeki kuryeler vardiyadan otomatik çıkar)
- [x] Grid tabanlı görünüm (Vardiyalar satır, Günler sütun)
- [x] 06:00 gün başlangıcına göre sıralama
- [x] Düzenleme modu (aksiyon butonları gizle/göster)
- [x] Zebra striping ve scrollable cell (çok kuryeli vardiyalar için)

### Güncel Durum Sayfası (Tamamlandı - 15 Ocak 2026)
- [x] Günlük vardiya raporu
- [x] 06:00-05:59 gün döngüsü desteği
- [x] Aktif vardiya vurgulama
- [x] Kurye sayısı ve listesi (responsive grid)

### Muhasebe (Tamamlandı - 16 Ocak 2026)
- [x] Üç alt sekme: Kuryeler, İşletmeler, Cariler + Hareketler (Activity Log)
- [x] **Inline form ile ödeme işlemleri (Modal kaldırıldı)**
- [x] Ödeme Al (payment_in) ve Ödeme Yap (payment_out)
- [x] Bakiye takibi (yeşil/kırmızı renk kodlaması)
- [x] İşlem geçmişi tablosu (infinite scroll, arama/filtreleme)
- [x] **Hakediş checkbox'ı (sadece Kuryeler tabında)**
- [x] Hakediş etiketi işlem geçmişinde görünüyor
- [x] İşletme ekleme/silme/arşivleme
- [x] Cari ekleme/silme/arşivleme
- [x] Kurye arşivleme (bakiye kontrolü ile)
- [x] **İşlem silme** (onay ile, Activity Log'a kaydedilir)
- [x] **Özel tarih seçimi** ("Şimdi" butonu + datetime-local input)
- [x] **PDF Export** (jspdf-autotable ile tablo formatında)
- [x] **Tarih seçici timezone düzeltmesi** (yerel saat gösterimi)
- [x] **Tutar input scroll engelleme** (onWheel blur)

### Kuryeler Sayfası (Tamamlandı - 15 Ocak 2026)
- [x] İsim veya plaka ile arama/filtreleme
- [x] Detay modal (tüm kurye bilgileri)
- [x] Kurye ekleme ve çıkarma işlevleri

### UI/UX
- [x] Türkçe karakter desteği (Montserrat font)
- [x] Footer tüm sayfalarda
- [x] Collapsible fixed sidebar
- [x] Responsive tasarım
- [x] Data-testid'ler testing için

## Prioritized Backlog

### P0 - Acil
- [ ] **Zimmet sekmesi içeriği** (Placeholder durumunda)

### P1 - Sıradaki
- [ ] Güncel Durum sayfasına ek bilgi kartları
- [ ] Hakediş checkbox'ının backend mantığı (örn. haftalık rapor)
- [ ] server.py modülerleştirme (routers/ klasörü)

### P2 - Gelecek
- [ ] Kurye profil düzenleme
- [ ] Şifre sıfırlama
- [ ] Raporlama özellikleri
- [ ] SMS/E-posta bildirimleri

## Tech Stack
- Backend: FastAPI + MongoDB
- Frontend: React + Tailwind CSS + Shadcn UI
- Auth: JWT (session duration based on "Remember Me")

## Test Credentials
- **Sistem Yöneticisi**: `systemadmin` / `System123!`
- **Süper Admin**: `onurertas` / `Delivery32..`
- **Test Kurye**: `05321234567` / `Test123!`
- **Company ID**: `e1c50cea-307e-4889-b33b-4b22e467b0b4`

## Key Files
- `/app/backend/server.py` - Tüm backend API
- `/app/frontend/src/pages/AdminDashboard.jsx` - Admin layout ve routing
- `/app/frontend/src/pages/VardiyaPage.jsx` - Vardiya yönetimi
- `/app/frontend/src/pages/GuncelDurumPage.jsx` - Güncel durum dashboard
- `/app/frontend/src/pages/MuhasebePage.jsx` - Muhasebe container
- `/app/frontend/src/pages/muhasebe/KuryelerTab.jsx` - Kurye muhasebe
- `/app/frontend/src/pages/muhasebe/IsletmelerTab.jsx` - İşletme muhasebe
- `/app/frontend/src/pages/muhasebe/CarilerTab.jsx` - Cari muhasebe
- `/app/frontend/src/pages/LoginPage.jsx` - Login sayfası
- `/app/frontend/src/pages/RegisterPage.jsx` - Kurye kayıt
- `/app/frontend/src/pages/SystemDashboard.jsx` - Sistem yöneticisi dashboard

## DB Schema
- **companies**: `{_id, name, logo_url}`
- **users**: `{_id, username, password, role, company_id}`
- **couriers**: `{_id, name, phone, address, iban, plate, password, company_id}`
- **shifts**: `{_id, company_id, start_time, end_time}`
- **shift_assignments**: `{_id, shift_id, courier_id, day}`
- **leaves**: `{_id, company_id, courier_id, day}`
- **businesses**: `{_id, company_id, name, phone, address}`
- **vendors**: `{_id, company_id, name, phone, address}`
- **transactions**: `{_id, company_id, entity_id, entity_type, amount, type, description, is_hakedis, created_at}`

## Test Reports
- `/app/test_reports/iteration_5.json` - En son test raporu (100% başarı)
- `/app/tests/test_muhasebe_api.py` - Muhasebe API testleri
