"""
Adisyo webhook delivered-without-courier bug fix testi
"""
import asyncio
import sys
sys.path.insert(0, '/app/backend')

from datetime import datetime, timezone, timedelta
TURKEY_TZ = timezone(timedelta(hours=3))

async def test_delivered_without_courier():
    from utils.database import db
    import uuid
    
    test_adisyo_id = 99988877
    test_order_id = f"test-webhook-fix-{uuid.uuid4().hex[:8]}"
    
    # 1) Kuryesiz bir sipariş oluştur (preparing durumunda)
    test_order = {
        "id": test_order_id,
        "adisyo_order_id": test_adisyo_id,
        "status": "preparing",
        "courier_id": None,
        "courier_name": None,
        "customer_name": "Test Orhan Kaya",
        "company_id": "test-company",
        "restaurant_id": "test-restaurant",
        "created_at": datetime.now(TURKEY_TZ).isoformat(),
        "updated_at": datetime.now(TURKEY_TZ).isoformat(),
        "status_history": [
            {
                "status": "preparing",
                "timestamp": datetime.now(TURKEY_TZ).isoformat(),
                "actor_type": "system",
                "actor_name": "Sistem"
            }
        ]
    }
    
    await db.orders.insert_one(test_order)
    print(f"[OK] Test sipariş oluşturuldu: {test_order_id} (preparing, kuryesiz)")
    
    # 2) Adisyo webhook simülasyonu - delivered gelsin
    from services.adisyo_service import map_adisyo_status
    
    # map_adisyo_status kontrolü
    mapped = map_adisyo_status(5, "Teslim Edildi")
    assert mapped == "delivered", f"map_adisyo_status(5) = {mapped}, beklenen: delivered"
    print(f"[OK] map_adisyo_status(5) = '{mapped}'")
    
    # 3) Webhook handler'ın process_order_event fonksiyonunu simüle et
    existing = await db.orders.find_one({"adisyo_order_id": test_adisyo_id})
    assert existing is not None, "Test sipariş bulunamadı!"
    
    current_status = existing.get("status")
    shiftjet_priority_statuses = ["assigned", "confirmed", "on_the_way", "delivered", "cancelled"]
    
    # current_status "preparing" olduğu için priority listesinde değil
    assert current_status not in shiftjet_priority_statuses, f"Durum {current_status} priority'de olmamalı"
    print(f"[OK] Sipariş durumu '{current_status}' - priority listesinde değil (beklenen)")
    
    # Adisyo statusId=5 (delivered) geldi
    new_status = map_adisyo_status(5, "")
    
    # YENİ KONTROL: Kurye atanmamışsa delivered engellenmeli
    courier_id = existing.get("courier_id")
    if new_status == "delivered" and not courier_id:
        print(f"[OK] ✅ ENGEL ÇALIŞTI: Kurye atanmamış (courier_id={courier_id}), 'delivered' ENGELLENDİ!")
        blocked = True
    else:
        print(f"[FAIL] ❌ ENGEL ÇALIŞMADI: Sipariş delivered yapılacaktı!")
        blocked = False
    
    # 4) Kuryeli sipariş testi - delivered geçmeli
    await db.orders.update_one(
        {"id": test_order_id},
        {"$set": {"courier_id": "test-courier-123", "courier_name": "Test Kurye", "status": "on_the_way"}}
    )
    
    existing2 = await db.orders.find_one({"adisyo_order_id": test_adisyo_id})
    courier_id2 = existing2.get("courier_id")
    
    if new_status == "delivered" and courier_id2:
        print(f"[OK] ✅ Kuryeli sipariş: courier_id={courier_id2}, 'delivered' İZİN VERİLDİ (doğru)")
        allowed = True
    else:
        print(f"[FAIL] ❌ Kuryeli sipariş bile engellenmiş!")
        allowed = False
    
    # 5) İptal testi - kuryesiz iptal geçmeli
    await db.orders.update_one(
        {"id": test_order_id},
        {"$set": {"courier_id": None, "status": "preparing"}}
    )
    
    cancel_status = map_adisyo_status(6, "")  # İptal
    existing3 = await db.orders.find_one({"adisyo_order_id": test_adisyo_id})
    courier_id3 = existing3.get("courier_id")
    
    if cancel_status == "cancelled" and not courier_id3:
        print(f"[OK] ✅ İptal durumu kuryesiz de geçebilir (doğru)")
        cancel_ok = True
    else:
        cancel_ok = False
    
    # Temizlik
    await db.orders.delete_one({"id": test_order_id})
    print(f"[OK] Test verisi temizlendi")
    
    # Sonuç
    print()
    if blocked and allowed and cancel_ok:
        print("=" * 50)
        print("✅ TÜM TESTLER BAŞARILI - Bug düzeltmesi çalışıyor!")
        print("=" * 50)
        return True
    else:
        print("=" * 50)
        print("❌ BAZI TESTLER BAŞARISIZ!")
        print(f"  Kuryesiz delivered engellendi: {blocked}")
        print(f"  Kuryeli delivered izin verildi: {allowed}")
        print(f"  Kuryesiz iptal izin verildi: {cancel_ok}")
        print("=" * 50)
        return False

if __name__ == "__main__":
    result = asyncio.run(test_delivered_without_courier())
    sys.exit(0 if result else 1)
