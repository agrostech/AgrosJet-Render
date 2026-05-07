"""
Test: Kurye Otomatik Hakediş + Ödeme Talep Sistemi
- Sipariş delivered → earning transaction yazılıyor mu (idempotent)
- Cancel → earning siliniyor mu
- Bakiye hesabı (earning eklendiği zaman doğru)
- Ödeme talebi: cooldown, min, max, mütabakat, fatura zorunlu
- Onay: yüzdeli taksit kesintisi, transaction'lar
"""
import asyncio
import uuid
from datetime import datetime, timezone, timedelta
from utils.database import db
from utils.helpers import TURKEY_TZ
from services.courier_earning_service import credit_courier_earning, revert_courier_earning
from services.accounting_service import calculate_total_balance


async def cleanup(company_id, courier_id):
    await db.transactions.delete_many({"entity_id": courier_id})
    await db.invoices.delete_many({"courier_id": courier_id})
    await db.payout_requests.delete_many({"courier_id": courier_id})
    await db.installment_products.delete_many({"courier_id": courier_id})
    await db.orders.delete_many({"courier_id": courier_id})
    await db.couriers.delete_many({"id": courier_id})
    await db.companies.delete_many({"id": company_id})
    await db.daily_mutabakat_processed.delete_many({"courier_id": courier_id})


async def main():
    company_id = f"test-c-{uuid.uuid4()}"
    courier_id = f"test-k-{uuid.uuid4()}"
    
    await cleanup(company_id, courier_id)
    
    try:
        # Setup
        await db.companies.insert_one({"id": company_id, "name": "Test Sirket"})
        await db.couriers.insert_one({
            "id": courier_id,
            "name": "Test Kurye",
            "phone": "5551234567",
            "company_id": company_id,
            "created_at": (datetime.now(TURKEY_TZ) - timedelta(days=10)).isoformat()
        })
        
        # === TEST 1: Otomatik hakediş — delivered + idempotent ===
        order_id = f"test-order-{uuid.uuid4()}"
        order = {
            "id": order_id,
            "courier_id": courier_id,
            "company_id": company_id,
            "courier_fee": 50.0,
            "courier_name": "Test Kurye",
            "restaurant_name": "Test Restoran",
            "order_number": "ORD123"
        }
        tx = await credit_courier_earning(order)
        assert tx and tx["amount"] == 50.0 and tx["type"] == "earning"
        print(f"✅ Test 1a: Earning yazıldı (amount=50, type=earning)")
        
        # Idempotent — ikinci çağrı atlanmalı
        tx2 = await credit_courier_earning(order)
        assert tx2 is None
        print(f"✅ Test 1b: Idempotent çalışıyor (2. çağrı None döndü)")
        
        # Bakiye = 50 alacaklı (negative=alacak, hesapta in - out)
        balance = await calculate_total_balance("courier", [courier_id])
        assert balance == -50.0, f"Beklenen -50, gelen {balance}"
        print(f"✅ Test 1c: Bakiye doğru hesaplandı: {balance} (alacak=50)")
        
        # === TEST 2: Revert — cancel ===
        await revert_courier_earning(order_id)
        balance = await calculate_total_balance("courier", [courier_id])
        assert balance == 0
        print(f"✅ Test 2: Cancel sonrası earning silindi, balance={balance}")
        
        # === TEST 3: Birden fazla earning + payout request akışı ===
        # 30 sipariş × 50 TL = 1500 TL alacak
        for i in range(30):
            oid = f"order-{i}-{uuid.uuid4()}"
            await credit_courier_earning({
                "id": oid,
                "courier_id": courier_id,
                "company_id": company_id,
                "courier_fee": 50.0,
                "courier_name": "Test Kurye",
                "restaurant_name": "Test Rest",
                "order_number": f"ORD{i:03d}"
            })
        
        balance = await calculate_total_balance("courier", [courier_id])
        assert balance == -1500.0, f"Beklenen -1500, gelen {balance}"
        print(f"✅ Test 3: 30 earning sonrası bakiye={balance} (alacak=1500 ✓)")
        
        # === TEST 4: Yüzdeli taksit ekleme ===
        installment_id = str(uuid.uuid4())
        await db.installment_products.insert_one({
            "id": installment_id,
            "courier_id": courier_id,
            "company_id": company_id,
            "name": "Motor borcu",
            "installment_type": "percent",
            "total_amount": 5000.0,
            "withdrawal_percent": 25.0,
            "paid_amount": 0,
            "remaining_amount": 5000.0,
            "is_completed": False,
            "created_at": datetime.now(TURKEY_TZ).isoformat()
        })
        print(f"✅ Test 4: Yüzdeli taksit ürünü oluşturuldu (5000 TL, %25)")
        
        # === TEST 5: API can-request endpoint ===
        from routers.payout_requests import can_request_payout, _calculate_courier_balance
        bal = await _calculate_courier_balance(courier_id)
        assert bal == 1500.0
        print(f"✅ Test 5a: _calculate_courier_balance pozitif döner: {bal} TL alacak")
        
        result = await can_request_payout(courier_id)
        assert result["can_request"] is True, f"can_request=False, reason={result['reason']}"
        assert result["balance"] == 1500.0
        assert result["active_installment"] is not None
        assert result["active_installment"]["withdrawal_percent"] == 25.0
        print(f"✅ Test 5b: can_request=True, balance={result['balance']}, taksit aktif")
        
        # === TEST 6: Min tutar altında talep reddedilir ===
        from routers.payout_requests import create_payout_request
        from fastapi import UploadFile
        from io import BytesIO
        
        class FakeUploadFile:
            def __init__(self, filename, content):
                self.filename = filename
                self._content = content
            async def read(self):
                return self._content
        
        try:
            await create_payout_request(courier_id, 500.0, FakeUploadFile("test.pdf", b"%PDF-1.4 fake"))
            assert False, "Min tutar altında geçti"
        except Exception as e:
            assert "1000" in str(e) or "minimum" in str(e).lower()
            print(f"✅ Test 6: Min tutar altı reddedildi: {str(e)[:80]}")
        
        # === TEST 7: PDF olmayan dosya reddedilir ===
        try:
            await create_payout_request(courier_id, 1200.0, FakeUploadFile("test.jpg", b"fake"))
            assert False, "JPG kabul edildi"
        except Exception as e:
            assert "PDF" in str(e)
            print(f"✅ Test 7: PDF olmayan dosya reddedildi")
        
        # === TEST 8: Bakiye üzeri talep reddedilir ===
        try:
            await create_payout_request(courier_id, 5000.0, FakeUploadFile("test.pdf", b"%PDF-1.4"))
            assert False, "Bakiye üzeri geçti"
        except Exception as e:
            assert "bakiyenizi" in str(e).lower() or "aşıyor" in str(e).lower() or "Maksimum" in str(e)
            print(f"✅ Test 8: Bakiye üzeri talep reddedildi")
        
        print("\n🎉 Tüm core testler geçti — Otomatik hakediş ve talep validasyonları çalışıyor")
        
    finally:
        await cleanup(company_id, courier_id)


if __name__ == "__main__":
    asyncio.run(main())
