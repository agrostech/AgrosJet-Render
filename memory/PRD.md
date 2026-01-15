# Kurye Yönetim Sistemi PRD

## Problem Statement
Multi-tenant kurye yönetim sistemi. Kuryeler global kayıt olur (telefon eşsiz), şirketler kuryeleri telefon ile kendi sistemlerine ekler.

## User Personas & Hiyerarşi
1. **Sistem Yöneticisi** (`systemadmin` / `System123!`): Şirketleri yönetir, süper admin atar
2. **Süper Admin**: Şirkete bağlı, otomatik login, adminleri/kuryeleri yönetir
3. **Admin**: Yetkilere göre çalışır
4. **Kurye**: Global kayıt, şirketlere bağlanabilir

## Core Requirements
- Kuryeler şirket bağımsız kayıt olur (telefon unique)
- Şirketler kuryeleri telefon ile ekler
- Admin/Süper Admin girişte otomatik şirketine bağlanır
- Login'de şirket seçimi YOK
- Türkçe karakter desteği (İ, Ş, Ğ, Ü, Ö, Ç)
- Mobile-first responsive tasarım

## What's Been Implemented (Dec 2025)
- [x] Global kurye kayıt sistemi
- [x] Telefon ile kurye arama ve şirkete ekleme
- [x] Otomatik şirket bağlantılı admin girişi
- [x] Sistem Yöneticisi Dashboard (şirket yönetimi)
- [x] Admin/Süper Admin Dashboard
- [x] Kurye Dashboard (şirket bekleme durumu, çoklu şirket desteği)
- [x] Türkçe karakter desteği
- [x] Vardiya, Muhasebe, Zimmet sekmeleri (placeholder)

## Prioritized Backlog
### P0 - Next Phase (Kullanıcı detay bekliyor)
- [ ] Vardiya içeriği
- [ ] Muhasebe içeriği
- [ ] Zimmet içeriği

### P1 - Future
- [ ] Kurye profil düzenleme
- [ ] Şifre sıfırlama

## Tech Stack
- Backend: FastAPI + MongoDB
- Frontend: React + Tailwind CSS + Shadcn UI
