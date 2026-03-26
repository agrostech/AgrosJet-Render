# AgrosJet Delivery Management System - PRD

## Problem Statement
Teslimat yönetim sistemi: Restoran, Admin ve Kurye panelleri. Migros, Getir, Trendyol, Adisyo, Yemeksepeti entegrasyonları ile sipariş yönetimi, kurye takip, muhasebe ve raporlama.

## Architecture
- Frontend: React + Tailwind + Shadcn UI
- Backend: FastAPI + MongoDB
- Push: Expo (iOS) + FCM (Android)
- External: Migros, Getir, Trendyol, Adisyo, Yemeksepeti, SepetTakip, AgrosJet API

## Panels
- **Admin Panel**: Sipariş Yönetimi (canlı harita), Vardiya, Muhasebe, Raporlar, Zimmet, Market, Akademi, Kuryeler, Restoranlar, Başvurular, Yöneticiler, Sistem
- **Restoran Panel**: Sipariş Yönetimi, Raporlar, Muhasebe, Ürünler, Müşteriler, Entegrasyonlar, Ayarlar
- **Kurye Panel (Rider)**: Siparişler, Muhasebe, Raporlar + Sidebar: Vardiyalar, Evraklar, Motosiklet, Akademi, JetPuan, Zimmet

## Completed (March 2026 - Latest Session)
- Ödeme onay modalından sipariş no kaldırıldı, sadece müşteri ismi + tutar
- Online teslimat onay modalında müşteri ismi gösterimi
- Alt bar seçili sekme rengi lacivert (slate-900) + üst çizgi indicator
- Alt bar siparişler sekmesinde aktif sipariş sayı badge'i (kırmızı)
- Header: Logo sağda, statü dropdown ortada, menü sol
- Header yükseklik optimize (py-0.5)
- Sidebar header: Şirket logosu + kurye ismi + şirket adı
- Menü ikonu boyut ayarları (!w-5 !h-5)
- Muhasebe işlem geçmişi: text-xs + line-clamp-2
- Başvurular sayfasına doğum tarihi sütunu eklendi (D.Tarihi - dd.mm.yyyy)

## Completed (Previous Sessions)
- Migros V2 iptal sebepleri, opsiyon fiyat/adet, toplam tutar, ödeme yöntemi
- Kurye paneli: Sticky header, kompakt sipariş kartları, gecikme uyarıları, renkli ödeme badge'leri
- Rota oluşturmada otomatik konum (lastLocationRef)
- Platform-aware push notifications (Expo + FCM)
- Kurye session management (push_session_id + auto-logout)
- Native-first location tracking
- Başvuru bildirimleri (sidebar badge + popover)

## P0 - Critical (Next)
1. Kurye oturum düzeltmelerinin native app ile doğrulanması

## P1 - Important
1. Migros "Reddet" fonksiyonalitesi
2. VatanSMS entegrasyonu
3. Kurye Rota Fallback doğrulaması

## P2 - Nice to Have
1. Migros 30 saniye kuralı

## Future/Backlog
- Yemeksepeti Chrome extension
- Stop Count capacity mantığı
- Technical security gereksinimleri
- restaurant_fee hesaplaması
- Scheduled job refactoring
- Yeni raporlar
- Restoran Kurye Sistemi
- Caller ID entegrasyonu
- Native Courier App

## Credentials
- System Admin: `onurertas` / `Delivery32..`
- Company Admin: `admin` / `123456`
- Courier: `05550003201` / `123456`
