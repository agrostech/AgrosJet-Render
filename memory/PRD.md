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

### Vardiya Yönetimi (Tamamlandı)
- [x] Vardiya oluşturma/düzenleme/silme
- [x] Kurye-vardiya atama (gün bazlı)
- [x] İzin listesi yönetimi (izindeki kuryeler vardiyadan otomatik çıkar)
- [x] Grid tabanlı görünüm (Vardiyalar satır, Günler sütun)
- [x] 06:00 gün başlangıcına göre sıralama
- [x] Düzenleme modu (aksiyon butonları gizle/göster)
- [x] Zebra striping ve scrollable cell (çok kuryeli vardiyalar için)

### Güncel Durum Sayfası (Tamamlandı)
- [x] Günlük vardiya raporu
- [x] 06:00-05:59 gün döngüsü desteği
- [x] Aktif vardiya vurgulama
- [x] Kurye sayısı ve listesi (responsive grid)

### Zimmet (Tamamlandı)
- [x] Ürün Tipleri yönetimi (POS Cihazı için ekstra alanlar)
- [x] Ürün ekleme/silme/güncelleme
- [x] Kuryeye zimmetleme ve geri alma
- [x] Arızalı/Kayıp durumları
- [x] Zimmet geçmişi (her ürün için)
- [x] Hareketler sekmesi (tüm zimmet logları)
- [x] Pagination desteği
- [x] Mali Bellek özelliği (POS cihazları için aylık rapor takibi)

### Muhasebe (Tamamlandı)
- [x] Hareketler sekmesinde açıklama ile arama
- [x] Hareketler kartı tam ekran yükseklik ve iç kaydırma
- [x] Tüm sekmelerde gerçek backend pagination ile "Daha Fazla Yükle"
- [x] PDF Türkçe karakter sorunu ÇÖZÜLDÜ - styles.font ile Roboto font eklendi
- [x] Üç alt sekme: Kuryeler, İşletmeler, Cariler + Hareketler (Activity Log)
- [x] **Inline form ile ödeme işlemleri (Modal kaldırıldı)**
- [x] Ödeme Al (payment_in) ve Ödeme Yap (payment_out)
- [x] **Butonlar alt kısımda yan yana hizalı (Verilen/Alınan)**
- [x] Bakiye takibi (yeşil/kırmızı renk kodlaması)
- [x] İşlem geçmişi tablosu (infinite scroll, arama/filtreleme)
- [x] **Hakediş checkbox'ı (sadece Kuryeler tabında)**
- [x] Hakediş etiketi işlem geçmişinde görünüyor
- [x] İşletme ekleme/silme/arşivleme
- [x] Cari ekleme/silme/arşivleme
- [x] Kurye arşivleme (bakiye kontrolü ile)
- [x] **İşlem silme** (onay ile, Activity Log'a kaydedilir)
- [x] **Özel tarih seçimi** ("Şimdi" butonu + datetime-local input)
- [x] **PDF Export** (jspdf-autotable ile tablo formatında, beyaz başlık)
- [x] **PDF'e şirket logosu ekleme** (sağ üst köşe, 30x30)
- [x] **Tarih seçici timezone düzeltmesi** (yerel saat gösterimi)
- [x] **Tutar input scroll engelleme** (onWheel blur)
- [x] **PDF'de Türkçe karakter desteği** (Unicode escape ile)

### Backend Refactoring (Tamamlandı - 17 Ocak 2026)
- [x] **server.py modülerleştirme tamamlandı** - 697 satırdan 109 satıra düşürüldü
- [x] 9 ayrı router modülü oluşturuldu:
  - `auth.py` - Kimlik doğrulama
  - `companies.py` - Şirket yönetimi
  - `couriers.py` - Kurye yönetimi
  - `admins.py` - Admin yönetimi
  - `profile.py` - Profil ve oturum yönetimi
  - `accounting.py` - Muhasebe işlemleri
  - `shifts.py` - Vardiya yönetimi
  - `zimmet.py` - Zimmet yönetimi
  - `mali_bellek.py` - Mali bellek takibi
- [x] **Kurye silme kontrolü düzeltildi** - Bakiye kontrolü önce yapılıyor

### UI/UX
- [x] Türkçe karakter desteği (Montserrat font)
- [x] Footer tüm sayfalarda
- [x] Collapsible fixed sidebar
- [x] Responsive tasarım
- [x] Data-testid'ler testing için
- [x] Zimmet sayfası kompakt UI (SN: ve TRM: etiketleri)
- [x] Mali Bellek arama ve filtreleme özellikleri

## Prioritized Backlog

### P1 - Sıradaki
- [ ] **Toplu Hakediş Girişi** (3. parti cevap bekleniyor - ON HOLD)
- [ ] Güncel Durum sayfasına ek bilgi kartları
- [ ] Hakediş checkbox'ının backend mantığı (örn. haftalık rapor)

### P2 - Gelecek
- [ ] **AdminDashboard.jsx refactoring** - Büyük bileşeni küçük parçalara ayır
- [ ] **Muhasebe tab'ları refactoring** - Custom hook ile kod tekrarını azalt
- [ ] Kurye profil düzenleme
- [ ] Şifre sıfırlama
- [ ] Raporlama özellikleri
- [ ] SMS/E-posta bildirimleri

## Tech Stack
- Backend: FastAPI + MongoDB (modüler router yapısı)
- Frontend: React + Tailwind CSS + Shadcn UI
- Auth: JWT (session duration based on "Remember Me")

## Test Credentials
- **Sistem Yöneticisi**: `systemadmin` / `System123!`
- **Süper Admin**: `onurertas` / `Delivery32..`
- **Test Kurye**: `05321234567` / `Test123!`

## Code Architecture
```
/app/
├── backend/
│   ├── server.py          # 109 satır - Sadece router include ve startup
│   ├── routers/           # 9 modül
│   │   ├── auth.py        # 101 satır
│   │   ├── companies.py   # 80 satır
│   │   ├── couriers.py    # 278 satır
│   │   ├── admins.py      # 183 satır
│   │   ├── profile.py     # 101 satır
│   │   ├── accounting.py  # 337 satır
│   │   ├── shifts.py      # 190 satır
│   │   ├── zimmet.py      # 382 satır
│   │   └── mali_bellek.py # 146 satır
│   └── utils/
│       ├── database.py    # DB bağlantısı
│       └── helpers.py     # hash_password, format_name
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── AdminDashboard.jsx
│       │   ├── ZimmetPage.jsx
│       │   └── muhasebe/
│       └── components/ui/  # Shadcn components
└── memory/
    └── PRD.md
```

## Key Files
- `/app/backend/server.py` - Main app ve router includes
- `/app/backend/routers/` - Tüm API modülleri
- `/app/frontend/src/pages/AdminDashboard.jsx` - Admin layout ve routing
- `/app/frontend/src/pages/ZimmetPage.jsx` - Zimmet ve Mali Bellek

## DB Schema
- **companies**: `{id, name, logo_url, created_at}`
- **admins**: `{id, name, username, password, role, permissions, company_id, created_at}`
- **couriers**: `{id, name, phone, address, iban, plate, password, status, created_at}`
- **company_couriers**: `{id, company_id, courier_id, status, is_archived, created_at}`
- **shifts**: `{id, company_id, name, start_time, end_time, created_at}`
- **shift_assignments**: `{id, shift_id, courier_id, day, created_at}`
- **businesses**: `{id, company_id, name, phone, address, is_archived, created_at}`
- **vendors**: `{id, company_id, name, phone, address, is_archived, created_at}`
- **transactions**: `{id, company_id, entity_id, entity_type, amount, type, description, is_hakedis, created_at}`
- **products**: `{id, company_id, product_type_id, name, serial_number, pos_serial, pos_terminal, status, assigned_to_courier_id, created_at}`
- **mali_bellek_status**: `{id, product_id, year_month, is_collected, collected_at, collected_by_admin_id}`
- **mali_bellek_logs**: `{id, product_id, year_month, action, admin_id, admin_name, created_at, details}`

## Changelog

### 17 Ocak 2026
- **Major Refactoring**: `server.py` tamamen modülerleştirildi (697 → 109 satır)
- **Bug Fix**: Kurye silme kontrolünde bakiye önceliği düzeltildi
- **9 router modülü** oluşturuldu ve test edildi

### 16 Ocak 2026
- Mali Bellek özelliği eklendi
- Zimmet sayfası UI iyileştirmeleri (SN:, TRM: etiketleri)
- Tüm Hareketler filtreleme özellikleri
