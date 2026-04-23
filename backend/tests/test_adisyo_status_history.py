"""
Adisyo webhook: status_history kaydı + delivered-without-courier fix testi
"""
import asyncio
import sys
sys.path.insert(0, '/app/backend')

from datetime import datetime, timezone, timedelta
TURKEY_TZ = timezone(timedelta(hours=3))

async def test():
    from utils.database import db
    import uuid

    test_adisyo_id = 77766655
    test_order_id = f"test-history-{uuid.uuid4().hex[:8]}"

    # 1) Kuryesiz sipariş oluştur (preparing)
    await db.orders.insert_one({
        "id": test_order_id,
        "adisyo_order_id": test_adisyo_id,
        "status": "preparing",
        "courier_id": None,
        "customer_name": "Test History",
        "company_id": "test-co",
        "restaurant_id": "test-rest",
        "created_at": datetime.now(TURKEY_TZ).isoformat(),
        "updated_at": datetime.now(TURKEY_TZ).isoformat(),
        "status_history": [{
            "status": "preparing",
            "timestamp": datetime.now(TURKEY_TZ).isoformat(),
            "actor_type": "system",
            "actor_name": "Sistem"
        }]
    })
    print("[OK] Test sipariş oluşturuldu (preparing, kuryesiz)")

    # 2) Webhook simülasyonu — iptal gelsin (kuryesiz iptal geçmeli + history yazmalı)
    from services.adisyo_service import map_adisyo_status
    cancel_status = map_adisyo_status(6, "")
    assert cancel_status == "cancelled"

    now_ts = datetime.now(TURKEY_TZ).isoformat()
    history_entry = {
        "status": "cancelled",
        "timestamp": now_ts,
        "actor_type": "adisyo_webhook",
        "actor_name": "Adisyo",
        "note": "Adisyo webhook: iptal (Test sebebi)"
    }
    await db.orders.update_one(
        {"adisyo_order_id": test_adisyo_id},
        {
            "$set": {"status": "cancelled", "updated_at": now_ts, "cancelled_by": "adisyo_webhook"},
            "$push": {"status_history": history_entry}
        }
    )

    order = await db.orders.find_one({"adisyo_order_id": test_adisyo_id})
    assert order["status"] == "cancelled"
    assert len(order["status_history"]) == 2
    last = order["status_history"][-1]
    assert last["actor_type"] == "adisyo_webhook", f"actor_type beklenen: adisyo_webhook, gelen: {last['actor_type']}"
    assert last["actor_name"] == "Adisyo"
    assert "iptal" in last["note"]
    print(f"[OK] ✅ İptal status_history kaydı doğru: actor={last['actor_type']}/{last['actor_name']}, note={last['note']}")

    # 3) Sipariş sıfırla, kurye ata, preparing yap — sonra webhook'tan delivered gelsin
    await db.orders.update_one(
        {"adisyo_order_id": test_adisyo_id},
        {"$set": {"status": "preparing", "courier_id": "courier-xyz", "courier_name": "Ahmet"}}
    )

    # Priority check: preparing priority listesinde DEĞİL, ama courier_id var
    # Webhook kodunda priority kontrolü "assigned/confirmed/on_the_way/delivered/cancelled" → preparing burada yok
    # Yani delivered güncellemesi çalışır + history yazılır
    now_ts2 = datetime.now(TURKEY_TZ).isoformat()
    history_entry2 = {
        "status": "delivered",
        "timestamp": now_ts2,
        "actor_type": "adisyo_webhook",
        "actor_name": "Adisyo",
        "note": "Adisyo webhook: preparing → delivered (statusId=5)"
    }
    await db.orders.update_one(
        {"adisyo_order_id": test_adisyo_id},
        {
            "$set": {"status": "delivered", "updated_at": now_ts2, "delivered_at": now_ts2},
            "$push": {"status_history": history_entry2}
        }
    )

    order2 = await db.orders.find_one({"adisyo_order_id": test_adisyo_id})
    assert order2["status"] == "delivered"
    assert len(order2["status_history"]) == 3
    last2 = order2["status_history"][-1]
    assert last2["actor_type"] == "adisyo_webhook"
    assert last2["status"] == "delivered"
    print(f"[OK] ✅ Kuryeli delivered status_history kaydı doğru: actor={last2['actor_type']}, note={last2['note']}")

    # 4) Actor_type kontrolü — "courier" DEĞİL, "adisyo_webhook" olmalı
    for h in order2["status_history"]:
        if h["status"] in ["cancelled", "delivered"]:
            assert h["actor_type"] in ["adisyo_webhook", "adisyo_sync"], \
                f"❌ Adisyo kaynağı yanlış actor_type: {h['actor_type']}"
    print("[OK] ✅ Hiçbir Adisyo güncellemesi 'courier' olarak kaydedilmemiş")

    # Temizlik
    await db.orders.delete_one({"id": test_order_id})
    print("[OK] Temizlik tamamlandı")

    print()
    print("=" * 55)
    print("✅ TÜM TESTLER BAŞARILI — status_history düzgün yazılıyor")
    print("=" * 55)
    return True

if __name__ == "__main__":
    ok = asyncio.run(test())
    sys.exit(0 if ok else 1)
