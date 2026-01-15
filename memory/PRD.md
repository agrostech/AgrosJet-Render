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

## What's Been Implemented (Jan 2026)
- [x] Global kurye kayıt sistemi (validasyon ile)
- [x] Telefon ve plaka formatı doğrulama
- [x] Telefon ile kurye arama ve şirkete ekleme
- [x] Otomatik şirket bağlantılı admin girişi
- [x] Sistem Yöneticisi Dashboard (şirket yönetimi)
- [x] Admin/Süper Admin Dashboard
- [x] Kurye Dashboard (şirket bekleme durumu, çoklu şirket desteği)
- [x] Türkçe karakter desteği (Montserrat font)
- [x] Vardiya, Muhasebe, Zimmet sekmeleri (placeholder)
- [x] "Beni Hatırla" özelliği ve oturum süresi yönetimi
- [x] Footer tüm sayfalarda
- [x] Super Admin düzenleme ve silme
- [x] **Kuryeler sayfası yenilendi (15 Ocak 2026):**
  - [x] İsim veya plaka ile arama/filtreleme
  - [x] Detay modal (tüm kurye bilgileri: İsim, Telefon, Plaka, Adres, İban, Kayıt Tarihi)
  - [x] Eski onay sistemi kaldırıldı
  - [x] Kurye ekleme ve çıkarma işlevleri

## Prioritized Backlog
### P0 - Next Phase (Kullanıcı detay bekliyor)
- [ ] Vardiya Yönetimi içeriği
- [ ] Muhasebe içeriği
- [ ] Zimmet içeriği

### P1 - Future
- [ ] Kurye profil düzenleme
- [ ] Şifre sıfırlama
- [ ] Raporlama özellikleri

## Tech Stack
- Backend: FastAPI + MongoDB
- Frontend: React + Tailwind CSS + Shadcn UI
- Auth: JWT (session duration based on "Remember Me")

## Test Credentials
- **Sistem Yöneticisi**: `systemadmin` / `System123!`
- **Süper Admin**: `onurertas` / `Delivery32..`
- **Test Kurye**: `05321234567` / `Test123!`

## Key Files
- `/app/backend/server.py` - Tüm backend API
- `/app/frontend/src/pages/AdminDashboard.jsx` - Admin/Süper Admin dashboard
- `/app/frontend/src/pages/LoginPage.jsx` - Login sayfası
- `/app/frontend/src/pages/RegisterPage.jsx` - Kurye kayıt
- `/app/frontend/src/pages/SystemDashboard.jsx` - Sistem yöneticisi dashboard
