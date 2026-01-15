# Kurye Yönetim Sistemi PRD

## Problem Statement
Kurye Dashboard, Admin Dashboard ve Süper Admin Dashboard'dan oluşan bir kurye yönetim sistemi. Kuryeler telefon numarası ile üye olur, üyelikleri süper admin tarafından onaylanır.

## User Personas
1. **Kurye**: Telefon ile kayıt olur, onay bekler, kendi dashboard'unda vardiya/muhasebe/zimmet görür
2. **Admin**: Yönetici panelinde kuryeleri yönetir, yetkilere göre sekmelere erişir
3. **Süper Admin**: Tüm yetkilere sahip, adminleri ve yetkilerini yönetir (onurertas / Delivery32..)

## Core Requirements
- Kurye kayıt: İsim, Telefon, Adres, IBAN, Plaka, Şifre
- İsim/Soyisim baş harfleri büyük formatlanır
- Süper admin onay sistemi
- Yetki bazlı sekme görünürlüğü
- Mobile-first responsive tasarım
- Business dil, emoji yok, text-based UI

## What's Been Implemented (Dec 2025)
- [x] Kurye kayıt ve giriş sistemi
- [x] Admin/Süper Admin giriş sistemi
- [x] Kurye Dashboard (Vardiya, Muhasebe, Zimmet placeholder)
- [x] Admin Dashboard (Vardiya, Muhasebe, Zimmet, Kuryeler)
- [x] Süper Admin Dashboard (+ Yöneticiler sekmesi)
- [x] Kurye onaylama/reddetme
- [x] Yönetici ekleme ve yetki yönetimi
- [x] Mobile responsive tasarım
- [x] Swiss & High-Contrast tasarım (Oswald/Inter/JetBrains Mono)

## Prioritized Backlog
### P0 - Next Phase
- [ ] Vardiya içeriği (kullanıcıdan detay bekleniyor)
- [ ] Muhasebe içeriği (kullanıcıdan detay bekleniyor)
- [ ] Zimmet içeriği (kullanıcıdan detay bekleniyor)

### P1 - Future
- [ ] Kurye profil düzenleme
- [ ] Şifre sıfırlama
- [ ] Dashboard istatistikleri

### P2 - Nice to Have
- [ ] Excel/PDF export
- [ ] Bildirim sistemi

## Tech Stack
- Backend: FastAPI + MongoDB
- Frontend: React + Tailwind CSS + Shadcn UI
- Auth: Simple hash-based (no JWT)
