# Fleet Order System - PRD

## Original Problem Statement
Multi-panel (Admin, Restaurant, Courier) delivery management application with integrations for third-party platforms.

## Completed Features (as of 2026-03-01)

### Latest Session - Otomatik Atama Sistemi
- [x] **Auto Dispatch System** - Modüler yapı ile implement edildi
  - Sipariş sıralama: FIFO (ready_at ASC)
  - Kurye seçimi: Boş vs 1-yolda karşılaştırması
  - Mesafe hesaplama: Haversine (metre)
  - Bekleme modu ve fallback mantığı
  - Adalet sistemi (opsiyonel)
  - Backend: `/app/backend/services/auto_dispatch/`
  - Scheduler: Her 30 saniyede çalışır
  
- [x] **Kurye Maksimum Paket Kapasitesi**
  - Kuryeler sayfasında "Maks. Paket" butonu ve modal
  - API: GET/PUT `/api/couriers/{id}/max-packages`
  
- [x] **Panel Ayarları**
  - Sistem Ayarları > Otomatik Atama kartı
  - Mesafe Toleransı, Maks. Bekleme Süresi, Adalet Sistemi

### Previous Sessions
- [x] Kurye bazlı kademeli ücretlendirme (tiered pricing)
- [x] RestoranlarPage loading icon fix
- [x] Push notification simplification
- [x] Persistent Integration Logging System
- [x] Restaurant Groups CRUD feature
- [x] Mobile UI Overhaul (Admin, Restaurant, Courier panels)

## Auto Dispatch Technical Details

### Files Structure
```
/app/backend/services/auto_dispatch/
├── __init__.py         # Exports
├── config.py           # Constants, defaults
├── distance.py         # Haversine calculation
├── courier_selection.py # Courier filtering/selection
└── dispatcher.py       # Main dispatch logic
```

### Database Fields
```javascript
// companies collection
{
  auto_dispatch_settings: {
    enabled: boolean,
    distance_tolerance: int,    // metre
    max_wait_time: int,         // dakika
    fairness_threshold: int,    // metre
    fairness_enabled: boolean
  }
}

// couriers collection
{
  max_packages: int  // default: 5
}

// orders collection
{
  dispatch_waiting: boolean,
  dispatch_waiting_courier_id: string,
  dispatch_waiting_started: datetime
}
```

### API Endpoints
- `GET /api/auto-dispatch/settings/{company_id}`
- `PUT /api/auto-dispatch/settings/{company_id}`
- `POST /api/auto-dispatch/run/{company_id}` (manual trigger)
- `GET /api/couriers/{id}/max-packages`
- `PUT /api/couriers/{id}/max-packages`

### Decision Logic
```
1. Get ready orders (FIFO by ready_at)
2. For each order:
   a. Get eligible couriers (idle + 1-on-way)
   b. Calculate D_idle_min and D_return_min
   c. If D_return_min ≤ D_idle_min + tolerance:
      → Wait for 1-on-way courier
   d. Else:
      → Assign to idle courier
3. Check waiting orders:
   a. If courier became idle → assign
   b. If wait time expired → fallback to idle
```

## Backlog

### P1 - High Priority
- [ ] `restaurant_fee` calculation in integrations
- [ ] Refactor scheduled jobs in `jobs.py`

### P2 - Medium Priority
- [ ] API request monitor/logger
- [ ] orders.py refactoring

### P3 - Future
- [ ] Native Courier App
- [ ] Chat System re-enable
- [ ] Google Maps Integration
- [ ] Dark Mode theme

## Test Credentials
- Admin: `superadmin` / `123456`
- Courier: `5555555555` / `123456`
