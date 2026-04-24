"""
Konum bildirimi servisi testi
"""
import asyncio
import sys
from datetime import datetime, timezone, timedelta
sys.path.insert(0, '/app/backend')

TURKEY_TZ = timezone(timedelta(hours=3))

async def test():
    from utils.database import db

    courier_id = "feae169f-222b-45df-b9e8-0664a186031a"  # Atakan Sarı
    now = datetime.now(TURKEY_TZ)

    # 1) Kuryeyi aktif yap, konumu 5dk eski yap
    old_time = (now - timedelta(minutes=5)).isoformat()
    await db.couriers.update_one(
        {"id": courier_id},
        {"$set": {
            "status": "active",
            "current_location.updated_at": old_time,
            "last_location_alert_at": None,
        }}
    )
    print(f"[OK] Kurye aktif, konum 5dk eski yapıldı")

    # 2) Servisi çalıştır
    from services.location_alert_service import check_stale_locations
    await check_stale_locations()

    # 3) last_location_alert_at güncellenmiş mi kontrol et
    courier = await db.couriers.find_one({"id": courier_id}, {"_id": 0, "last_location_alert_at": 1})
    alert_at = courier.get("last_location_alert_at")
    assert alert_at is not None, "last_location_alert_at güncellenmedi!"
    print(f"[OK] ✅ Bildirim gönderildi, last_location_alert_at = {alert_at}")

    # 4) Tekrar çalıştır - cooldown nedeniyle gönderilmemeli
    await check_stale_locations()
    courier2 = await db.couriers.find_one({"id": courier_id}, {"_id": 0, "last_location_alert_at": 1})
    assert courier2.get("last_location_alert_at") == alert_at, "Cooldown çalışmadı, tekrar gönderildi!"
    print(f"[OK] ✅ Spam engeli çalışıyor (10dk cooldown)")

    # 5) Permission kapalıyken gönderilmemeli
    await db.couriers.update_one(
        {"id": courier_id},
        {"$set": {
            "permissions.location_alert_enabled": False,
            "last_location_alert_at": None,
        }}
    )
    await check_stale_locations()
    courier3 = await db.couriers.find_one({"id": courier_id}, {"_id": 0, "last_location_alert_at": 1})
    assert courier3.get("last_location_alert_at") is None, "Toggle kapalı ama bildirim gönderildi!"
    print(f"[OK] ✅ Toggle kapalıyken bildirim gönderilmiyor")

    # 6) Konum güncel ise gönderilmemeli
    await db.couriers.update_one(
        {"id": courier_id},
        {"$set": {
            "permissions.location_alert_enabled": True,
            "current_location.updated_at": now.isoformat(),
            "last_location_alert_at": None,
        }}
    )
    await check_stale_locations()
    courier4 = await db.couriers.find_one({"id": courier_id}, {"_id": 0, "last_location_alert_at": 1})
    assert courier4.get("last_location_alert_at") is None, "Konum güncel ama bildirim gönderildi!"
    print(f"[OK] ✅ Konum güncel ise bildirim gönderilmiyor")

    # Temizlik
    await db.couriers.update_one(
        {"id": courier_id},
        {"$set": {"last_location_alert_at": None, "status": "active"}}
    )

    print()
    print("=" * 55)
    print("✅ TÜM KONUM BİLDİRİMİ TESTLERİ BAŞARILI")
    print("=" * 55)
    return True

if __name__ == "__main__":
    ok = asyncio.run(test())
    sys.exit(0 if ok else 1)
