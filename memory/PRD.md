# Kurye Yönetim Sistemi PRD

## Problem Statement
Multi-tenant kurye yönetim sistemi. Birden fazla şirket tek platformda yönetilebilir. Her şirketin kendi süper admini, adminleri ve kuryeleri vardır.

## User Personas
1. **Sistem Yöneticisi**: Tüm şirketleri yönetir, süper admin atar (systemadmin / System123!)
2. **Süper Admin**: Bir şirkete ait, adminleri ve kuryeleri yönetir
3. **Admin**: Yetkilere göre çalışır
4. **Kurye**: Kendi paneli (vardiya, muhasebe, zimmet)

## Core Requirements
- Multi-tenant yapı (birden fazla şirket)
- Şirket bazlı logo ve isim
- Türkçe karakter desteği (İ, Ş, Ğ, Ü, Ö, Ç)
- Hiyerarşik yetki sistemi
- Mobile-first responsive tasarım

## What's Been Implemented (Dec 2025)
### Phase 1 - MVP
- [x] Kurye kayıt ve giriş sistemi
- [x] Admin/Süper Admin giriş sistemi
- [x] Kurye Dashboard (Vardiya, Muhasebe, Zimmet placeholder)
- [x] Admin Dashboard (+ Kuryeler, Yöneticiler)
- [x] Mobile responsive tasarım

### Phase 2 - Multi-Tenant
- [x] Sistem Yöneticisi Dashboard
- [x] Şirket oluşturma/düzenleme/silme
- [x] Şirket bazlı süper admin atama
- [x] Şirket seçimli login
- [x] Şirket logosu ve ismi tüm dashboardlarda
- [x] Türkçe karakter desteği

## Prioritized Backlog
### P0 - Next Phase (Kullanıcı detay bekliyor)
- [ ] Vardiya içeriği
- [ ] Muhasebe içeriği
- [ ] Zimmet içeriği

### P1 - Future
- [ ] Kurye profil düzenleme
- [ ] Şifre sıfırlama
- [ ] Dashboard istatistikleri

## System Credentials
- Sistem Yöneticisi: `systemadmin` / `System123!`

## Tech Stack
- Backend: FastAPI + MongoDB
- Frontend: React + Tailwind CSS + Shadcn UI
