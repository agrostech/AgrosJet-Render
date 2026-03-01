# Fleet Order System - PRD

## Original Problem Statement
Multi-panel (Admin, Restaurant, Courier) delivery management application.

## Completed Features (as of 2026-03-01)

### Latest - Otomatik Atama Sistemi + Restoran Grubu Kuralı
- [x] **Auto Dispatch System** - Modüler yapı
- [x] **Restoran Grubu Kuralı (KRİTİK)**
  - Boş kurye → Tüm siparişlere atanabilir
  - Aktif siparişi olan kurye → Sadece AYNI restoran grubundan sipariş alabilir
  - Farklı grup → Kurye aday listesinden çıkarılır

### Auto Dispatch Logic
1. Sipariş sıralama: FIFO (ready_at ASC)
2. Kurye filtreleme:
   - Durum: active, mola değil
   - Kapasite: active_count < max_packages
   - Yolda: max 1 yolda sipariş
   - **GRUP: Aktif siparişin grubu == Yeni siparişin grubu**
3. Mesafe karşılaştırma: D_idle vs D_return + tolerance
4. Bekleme modu + Fallback

### Previous Sessions
- [x] Kurye bazlı kademeli ücretlendirme
- [x] Kurye maksimum paket kapasitesi
- [x] Restaurant Groups CRUD
- [x] Mobile UI Overhaul

## Key Files - Auto Dispatch
```
/app/backend/services/auto_dispatch/
├── config.py           # Constants
├── distance.py         # Haversine
├── courier_selection.py # Filtering + GROUP CHECK
└── dispatcher.py       # Main logic
```

## Database Collections Used
- `orders` - Siparişler
- `couriers` - Kuryeler (max_packages field)
- `restaurant_groups` - Restoran grupları
- `companies` - Şirket ayarları (auto_dispatch_settings)
- `dispatch_logs` - Dispatch logları

## Test Credentials
- Admin: `superadmin` / `123456`
- Courier: `5555555555` / `123456`

## Backlog
- [ ] `restaurant_fee` calculation
- [ ] `jobs.py` refactor
- [ ] Native Courier App
