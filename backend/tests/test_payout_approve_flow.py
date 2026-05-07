"""
Test: Payout request onay flow + taksit kesintisi
"""
import asyncio
import uuid
from datetime import datetime, timedelta
from utils.database import db
from utils.helpers import TURKEY_TZ
from services.courier_earning_service import credit_courier_earning
from services.accounting_service import calculate_total_balance
from routers.payout_requests import approve_payout_request


async def cleanup(company_id, courier_id):
    await db.transactions.delete_many({"entity_id": courier_id})
    await db.invoices.delete_many({"courier_id": courier_id})
    await db.payout_requests.delete_many({"courier_id": courier_id})
    await db.installment_products.delete_many({"courier_id": courier_id})
    await db.couriers.delete_many({"id": courier_id})
    await db.companies.delete_many({"id": company_id})


async def main():
    company_id = f"test-c-{uuid.uuid4()}"
    courier_id = f"test-k-{uuid.uuid4()}"
    
    await cleanup(company_id, courier_id)
    
    try:
        await db.companies.insert_one({"id": company_id, "name": "Test"})
        await db.couriers.insert_one({
            "id": courier_id, "name": "Test Kurye",
            "phone": "555", "company_id": company_id,
            "created_at": (datetime.now(TURKEY_TZ) - timedelta(days=1)).isoformat()
        })
        
        # 200 sipariş × 50 = 10000 TL alacak
        for i in range(200):
            await credit_courier_earning({
                "id": f"order-{i}-{uuid.uuid4()}",
                "courier_id": courier_id,
                "company_id": company_id,
                "courier_fee": 50.0,
                "courier_name": "Test", "restaurant_name": "R",
                "order_number": f"ORD{i}"
            })
        balance = await calculate_total_balance("courier", [courier_id])
        assert balance == -10000.0
        print(f"✅ Setup: 10000 TL alacak (balance={balance})")
        
        # Yüzdeli taksit ekle (5000 TL borç, %25)
        installment_id = str(uuid.uuid4())
        await db.installment_products.insert_one({
            "id": installment_id, "courier_id": courier_id, "company_id": company_id,
            "name": "Motor borcu", "installment_type": "percent",
            "total_amount": 5000.0, "withdrawal_percent": 25.0,
            "paid_amount": 0, "remaining_amount": 5000.0,
            "is_completed": False, "created_at": datetime.now(TURKEY_TZ).isoformat()
        })
        
        # Manuel olarak payout_request oluştur (file upload skip etmek için)
        invoice_id = str(uuid.uuid4())
        await db.invoices.insert_one({
            "id": invoice_id, "courier_id": courier_id, "company_id": company_id,
            "file_name": "test.pdf", "is_payout_invoice": True,
            "storage_type": "r2", "r2_key": "fake/key",
            "uploaded_at": datetime.now(TURKEY_TZ).isoformat(),
            "created_at": datetime.now(TURKEY_TZ).isoformat()
        })
        request_id = str(uuid.uuid4())
        await db.payout_requests.insert_one({
            "id": request_id, "company_id": company_id, "courier_id": courier_id,
            "courier_name": "Test", "courier_phone": "555",
            "requested_amount": 4000.0, "approved_amount": None,
            "expected_installment_deduction": 1000.0,
            "installment_product_id": installment_id, "invoice_id": invoice_id,
            "status": "pending", "created_at": datetime.now(TURKEY_TZ).isoformat()
        })
        
        # === TEST: Admin onaylar (4000 TL onay) ===
        result = await approve_payout_request(
            request_id=request_id,
            approved_amount=4000.0,
            payload={"sub": "admin1", "name": "Admin", "role": "admin"}
        )
        
        # Beklenenler:
        # - approved_amount = 4000
        # - deduction = 4000 × 25% = 1000
        # - cash_payout = 3000
        # - 2 transaction yazılır
        # - installment.paid_amount = 1000, remaining = 4000
        # - balance = -10000 + 4000 (cash) + ... wait
        # Balance hesabı:  in - out
        # Önce: in=10000 (earning), out=0 → balance = -10000 (alacak 10000)
        # Sonra: in=10000 (earning) + 3000 (payment_in cash) + 1000 (payment_in deduction) = 14000
        #        out = 0
        # balance = total_out - total_in = 0 - 14000 = -14000
        # Hmm, ama bizim semantikte:
        # `calculate_total_balance` returns `total_out - total_in` = 0 - 14000 = -14000
        # Bu kuryenin alacağının arttığını gösterir, yanlış!
        
        # Aslında payment_in = "kuryeye verildi" yani borcu azaltır.
        # Alacak (yeşil) tarafına kayıt olur, "in" ona giden ödeme.
        # Kontrol edelim:
        balance = await calculate_total_balance("courier", [courier_id])
        print(f"  After approve: balance={balance}")
        # Bu balance'ın 0 olması gerekiyor mu?
        # Mantık: Şirket kuryeye 10000 borçluydu (earning). 
        # 4000 ödedi (3000 cash + 1000 taksit kapatma)
        # Kalan: şirket kuryeye 6000 borçlu
        # balance = -6000 olmalı
        assert balance == -6000.0, f"Beklenen -6000, gelen {balance}"
        print(f"✅ Onay sonrası bakiye doğru: {balance} (alacak=6000)")
        
        # Transaction'ları kontrol et
        txs = await db.transactions.find(
            {"entity_id": courier_id, "payout_request_id": request_id},
            {"_id": 0}
        ).to_list(10)
        assert len(txs) == 2
        amounts = sorted([t["amount"] for t in txs])
        assert amounts == [1000.0, 3000.0], f"Beklenen [1000, 3000], gelen {amounts}"
        print(f"✅ 2 transaction yazıldı: {amounts}")
        
        # Installment güncellendi mi?
        inst = await db.installment_products.find_one({"id": installment_id}, {"_id": 0})
        assert inst["paid_amount"] == 1000.0
        assert inst["remaining_amount"] == 4000.0
        assert inst["is_completed"] is False
        print(f"✅ Taksit güncellendi: paid=1000, remaining=4000")
        
        # Request güncellendi mi?
        req = await db.payout_requests.find_one({"id": request_id}, {"_id": 0})
        assert req["status"] == "approved"
        assert req["approved_amount"] == 4000.0
        assert req["actual_installment_deduction"] == 1000.0
        assert req["cash_payout_amount"] == 3000.0
        print(f"✅ Request status=approved, snapshot doğru")
        
        # Invoice verified mi?
        inv = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
        assert inv.get("verified") is True
        assert inv.get("verified_amount") == 4000.0
        print(f"✅ Fatura verified=True, amount=4000")
        
        # === TEST: 2. kez onay reddedilir ===
        try:
            await approve_payout_request(request_id, 1000.0, payload={"sub": "admin1", "name": "Admin", "role": "admin"})
            assert False, "Çift onay geçti"
        except Exception as e:
            assert "zaten" in str(e)
            print(f"✅ Çift onay reddedildi")
        
        # === TEST: Onay > talep tutarı reddedilir ===
        # Yeni request
        request2_id = str(uuid.uuid4())
        await db.payout_requests.insert_one({
            "id": request2_id, "company_id": company_id, "courier_id": courier_id,
            "courier_name": "Test", "courier_phone": "555",
            "requested_amount": 1500.0, "approved_amount": None,
            "expected_installment_deduction": 0,
            "installment_product_id": None, "invoice_id": None,
            "status": "pending", "created_at": datetime.now(TURKEY_TZ).isoformat()
        })
        try:
            await approve_payout_request(request2_id, 2000.0, payload={"sub": "admin1", "name": "Admin", "role": "admin"})
            assert False, "Onay > talep geçti"
        except Exception as e:
            assert "büyük olamaz" in str(e) or "talepten" in str(e)
            print(f"✅ Onay > talep reddedildi")
        
        print("\n🎉 Tüm onay testleri geçti")
        
    finally:
        await cleanup(company_id, courier_id)


if __name__ == "__main__":
    asyncio.run(main())
