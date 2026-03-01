# Fleet Order System - PRD

## Completed Features (as of 2026-03-01)

### Otomatik Atama Sistemi - TAMAMLANDI

**İki Katmanlı Model:**

| Aşama | Model | Açıklama |
|-------|-------|----------|
| **Pickup** | Detour | Yolda paketi olmayan kurye - sipariş birleştirme |
| **On-the-way** | D_return vs D_idle | 1 yolda paketi olan kurye - bekleme/atama |

**Panel Ayarları:**
1. Mesafe Toleransı (metre) - D_return vs D_idle karşılaştırması
2. Maksimum Bekleme Süresi (dk) - Yolda kurye beklerken timeout
3. Adalet Sistemi + Eşik - Son 1 saat sipariş dağılımı
4. Maksimum Rota Sapması (metre) - Pickup birleştirme detour limiti

**Detour Formülü:**
```
AyrıToplam = (R→A) + (R→B)
D1 = (R→A) + (A→B)
D2 = (R→B) + (B→A)
BirleşikMesafe = min(D1, D2)
Detour = BirleşikMesafe - AyrıToplam

Detour ≤ max_detour → Birleştir
Detour > max_detour → Ayrı kurye
```

**Kısıtlar (Her Zaman Geçerli):**
- FIFO korunur (ready_at ASC)
- Restoran grubu kontrolü
- Kapasite kontrolü (max_packages)
- Yolda max 1 sipariş

**Dosya Yapısı:**
```
/app/backend/services/auto_dispatch/
├── config.py           # Ayarlar ve sabitler
├── distance.py         # Haversine mesafe
├── detour.py           # Rota sapması hesaplama
├── courier_selection.py # Kurye filtreleme + grup + detour
└── dispatcher.py       # Ana dispatch mantığı
```

### Diğer Tamamlanan Özellikler:
- [x] Kurye kademeli ücretlendirme
- [x] Kurye maksimum paket kapasitesi
- [x] Restaurant Groups CRUD
- [x] Mobile UI Overhaul

## Backlog
- [ ] `restaurant_fee` calculation
- [ ] `jobs.py` refactor
- [ ] Native Courier App

## Test Credentials
- Admin: `superadmin` / `123456`
