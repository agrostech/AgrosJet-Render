# Fleet Order System - PRD

## Original Problem Statement
Multi-panel (Admin, Restaurant, Courier) delivery management application with integrations for third-party platforms (Adisyo, Getir, Trendyol, etc.)

## Completed Features (as of 2026-02-28)

### Latest Session - Kademeli Paket Başı Ücretlendirme
- [x] **Kurye bazlı kademeli ücretlendirme** - Mevcut ücretlendirme modalına eklendi
  - 3 seçenek: Paket Başı / KM Aralığı / Kademeli Paket Başı
  - 5-tier pricing system based on active package count
  - Price shifting only on unassign (not on delivery/cancel)
  - Hourly rate option included
  - Backend: `couriers.py` (tier_prices field), `orders.py` (fee calculation)
  - Frontend: KuryelerPage.jsx pricing modal updated

### Previous Sessions
- [x] RestoranlarPage loading icon fixed - uses `PageLoading` component
- [x] Push notification simplified - only shows restaurant name in body
- [x] Persistent Integration Logging System
- [x] Restaurant Groups CRUD feature
- [x] Admin Panel Mobile UI Overhaul
- [x] Restaurant Panel Mobile UI Overhaul
- [x] Courier Panel Mobile UI Overhaul
- [x] Deprecated features removed (Entegrasyon Testleri, Gelen İstek Logları)
- [x] Rate limiting for auth endpoints

## Key Technical Details - Tiered Pricing

### Database Schema
```javascript
// couriers collection - tier_prices field
{
  pricing_type: "tiered" | "per_package" | "per_km",
  tier_prices: [float, float, float, float, float], // 5 tiers - kurye bazlı
  hourly_rate: float | null
}

// orders collection - new fields
{
  tiered_position: int | null, // 1-5
  fee_history: [{
    timestamp: string,
    old_fee: float,
    new_fee: float,
    reason: string,
    new_position: int
  }]
}
```

### API Endpoints
- `GET /api/couriers/{courier_id}/pricing` - Get courier pricing (includes tier_prices)
- `PUT /api/couriers/{courier_id}/pricing` - Update courier pricing (pricing_type can be "tiered")

### Logic Flow
1. When courier gets package assigned → Check pricing_type
2. If pricing_type == "tiered" → Get active package count → Use tier_prices[active_count]
3. On unassign → Recalculate remaining packages' fees using courier's tier_prices

## Backlog

### P1 - High Priority
- [ ] `restaurant_fee` calculation in integrations (Getir, Trendyol, etc.)
- [ ] Refactor scheduled jobs in `jobs.py`

### P2 - Medium Priority
- [ ] API request monitor/logger in admin panel
- [ ] orders.py refactoring

### P3 - Future
- [ ] Native Courier App
- [ ] Chat System re-enable
- [ ] Google Maps Integration
- [ ] Dark Mode theme

## Key Files
- `/app/backend/routers/couriers.py` - Courier pricing with tiered support
- `/app/backend/routers/orders.py` - Modified assign_courier_core for tiered fee
- `/app/backend/services/tiered_pricing_service.py` - Fee recalculation on unassign
- `/app/frontend/src/pages/admin/KuryelerPage.jsx` - Pricing modal with tiered option

## Test Credentials
- Admin: `superadmin` / `123456`
- Courier: `5555555555` / `123456`
