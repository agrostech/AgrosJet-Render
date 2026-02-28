# Fleet Order System - PRD

## Original Problem Statement
Multi-panel (Admin, Restaurant, Courier) delivery management application with integrations for third-party platforms (Adisyo, Getir, Trendyol, etc.)

## Completed Features (as of 2026-02-28)

### Latest Session
- [x] **Kademeli Paket Başı Ücretlendirme** - Company-wide tiered pricing for couriers
  - 5-tier pricing system based on active package count
  - Price shifting only on unassign (not on delivery/cancel)
  - Hourly rate option included
  - Backend: `tiered_pricing_service.py`, `tiered_pricing.py`
  - Frontend: Modal in KuryelerPage.jsx

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
// companies collection - tiered_pricing field
{
  tiered_pricing: {
    enabled: boolean,
    tier_prices: [float, float, float, float, float], // 5 tiers
    hourly_rate: float | null
  }
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
- `GET /api/tiered-pricing/{company_id}` - Get tiered pricing settings
- `PUT /api/tiered-pricing/{company_id}` - Update tiered pricing settings

### Logic Flow
1. When courier gets package assigned → Check active package count
2. If tiered pricing enabled → Use tier_prices[active_count] (max index 4)
3. On unassign → Recalculate remaining packages' fees

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
- `/app/backend/services/tiered_pricing_service.py` - Tiered pricing logic
- `/app/backend/routers/tiered_pricing.py` - API endpoints
- `/app/backend/routers/orders.py` - Modified assign_courier_core, unassign_courier
- `/app/frontend/src/pages/admin/KuryelerPage.jsx` - Tiered pricing modal

## Test Credentials
- Admin: `superadmin` / `123456`
- Courier: `5555555555` / `123456`
- Company ID: `0005ec2a-04ca-4250-9530-ecc6fde165f1`
