"""
Test: package_not_confirmed ihlali için ceza uygulanıyor mu?

Senaryo:
1. Test şirketi + kurye + penalty_settings (enabled, package_not_confirmed: 50 TL)
2. add_shift_violation çağır (dispatcher modülünden)
3. Beklentiler:
   - shift_violations koleksiyonuna kayıt düşer
   - transactions koleksiyonuna payment_out (50 TL) düşer
   - shift_violations kaydında penalty_amount ve penalty_transaction_id alanları olur
"""
import asyncio
import uuid
from utils.database import db
from services.auto_dispatch.dispatcher import add_shift_violation


async def main():
    company_id = f"test-company-{uuid.uuid4()}"
    courier_id = f"test-courier-{uuid.uuid4()}"
    courier_name = "Test Kurye"
    order_id = f"test-order-{uuid.uuid4()}"
    
    # Cleanup helper
    async def cleanup():
        await db.penalty_settings.delete_many({"company_id": company_id})
        await db.shift_violations.delete_many({"company_id": company_id})
        await db.transactions.delete_many({"company_id": company_id})
    
    await cleanup()
    
    try:
        # 1. Penalty settings oluştur (aktif, package_not_confirmed: 50 TL)
        await db.penalty_settings.insert_one({
            "company_id": company_id,
            "enabled": True,
            "penalties": {
                "package_not_confirmed": {"enabled": True, "amount": 50}
            }
        })
        
        # 2. add_shift_violation çağır
        violation = await add_shift_violation(
            company_id=company_id,
            courier_id=courier_id,
            courier_name=courier_name,
            violation_type="package_not_confirmed",
            description="Paketi onaylamadı, paket otomatik olarak üzerinden alındı",
            order_id=order_id
        )
        
        # 3. Doğrulamalar
        # 3a. shift_violations kaydı yazıldı mı?
        v_db = await db.shift_violations.find_one({"id": violation["id"]}, {"_id": 0})
        assert v_db, "shift_violations kaydı bulunamadı"
        assert v_db["violation_type"] == "package_not_confirmed"
        assert v_db["entity_id"] == courier_id
        print(f"✅ shift_violations kaydı yazıldı: {v_db['id']}")
        
        # 3b. transactions kaydı (ceza) düştü mü?
        tx = await db.transactions.find_one(
            {"penalty_violation_id": violation["id"]}, {"_id": 0}
        )
        assert tx, "Ceza transaction'ı oluşturulmadı"
        assert tx["type"] == "payment_out", f"Beklenen 'payment_out', gelen: {tx['type']}"
        assert tx["amount"] == 50, f"Beklenen 50, gelen: {tx['amount']}"
        assert tx["entity_id"] == courier_id
        print(f"✅ Ceza transaction'ı oluşturuldu: amount={tx['amount']} TL, id={tx['id']}")
        
        # 3c. Violation kaydında penalty bilgileri var mı?
        v_with_penalty = await db.shift_violations.find_one(
            {"id": violation["id"]}, {"_id": 0}
        )
        assert v_with_penalty.get("penalty_amount") == 50
        assert v_with_penalty.get("penalty_transaction_id") == tx["id"]
        print(f"✅ Violation kaydı penalty bilgisi içeriyor: {v_with_penalty['penalty_amount']} TL")
        
        # 3d. Return value'da da penalty bilgisi olmalı
        assert violation.get("penalty_amount") == 50
        assert violation.get("penalty_transaction_id") == tx["id"]
        print(f"✅ Return value penalty bilgisi içeriyor")
        
        # 4. Negative test: penalty disabled iken ceza uygulanmamalı
        await db.penalty_settings.update_one(
            {"company_id": company_id},
            {"$set": {"enabled": False}}
        )
        
        violation2 = await add_shift_violation(
            company_id=company_id,
            courier_id=courier_id,
            courier_name=courier_name,
            violation_type="package_not_confirmed",
            description="Test 2",
            order_id=f"test-order-2-{uuid.uuid4()}"
        )
        tx2 = await db.transactions.find_one(
            {"penalty_violation_id": violation2["id"]}, {"_id": 0}
        )
        assert tx2 is None, "Disabled iken ceza uygulanmamalıydı"
        assert violation2.get("penalty_amount") is None
        print(f"✅ Disabled iken ceza uygulanmadı (doğru davranış)")
        
        print("\n🎉 Tüm testler geçti — package_not_confirmed cezası çalışıyor")
        
    finally:
        await cleanup()


if __name__ == "__main__":
    asyncio.run(main())
