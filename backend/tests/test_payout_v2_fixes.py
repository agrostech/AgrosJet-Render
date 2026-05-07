"""
Test: Yeni eklemeler:
- Cancel endpoint (kurye iptal)
- Race condition (atomic claim)
- Category filter (transactions)
- is_hakedis: False değişikliği (earning ve onay payment_out)
"""
import asyncio
import uuid
from datetime import datetime, timedelta
from utils.database import db
from utils.helpers import TURKEY_TZ
from services.courier_earning_service import credit_courier_earning
from services.accounting_service import get_entity_transactions
from routers.payout_requests import (
    cancel_payout_request,
    approve_payout_request,
)


async def cleanup(company_id, courier_id):
    await db.transactions.delete_many({"entity_id": courier_id})
    await db.invoices.delete_many({"courier_id": courier_id})
    await db.payout_requests.delete_many({"courier_id": courier_id})
    await db.installment_products.delete_many({"courier_id": courier_id})
    await db.couriers.delete_many({"id": courier_id})
    await db.companies.delete_many({"id": company_id})
    await db.notifications.delete_many({"company_id": company_id})


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

        # 30 sipariş × 50 = 1500 TL alacak
        for i in range(30):
            tx = await credit_courier_earning({
                "id": f"order-{i}-{uuid.uuid4()}",
                "courier_id": courier_id,
                "company_id": company_id,
                "courier_fee": 50.0,
                "courier_name": "Test", "restaurant_name": "Migros",
                "order_number": f"ORD{i}"
            })
        
        # === Test 1: Earning is_hakedis=False ve description=restoran ===
        sample = await db.transactions.find_one({"entity_id": courier_id, "type": "earning"}, {"_id": 0})
        assert sample.get("is_hakedis") is False, f"is_hakedis False olmalı, {sample.get('is_hakedis')}"
        assert sample.get("description") == "Migros", f"Description=Migros olmalı, {sample.get('description')}"
        print(f"✅ Test 1: Earning is_hakedis=False, description='{sample.get('description')}'")

        # === Test 2: Cancel endpoint ===
        # Mock invoice + request
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
            "requested_amount": 1100.0, "approved_amount": None,
            "expected_installment_deduction": 0,
            "installment_product_id": None, "invoice_id": invoice_id,
            "status": "pending", "created_at": datetime.now(TURKEY_TZ).isoformat()
        })
        
        # Sahibi olmayan iptal edemez
        try:
            await cancel_payout_request(request_id, payload={"sub": "other-courier", "role": "courier"})
            assert False, "Sahibi olmayan iptal etti"
        except Exception as e:
            assert "yetki" in str(e).lower() or "forbid" in str(e).lower() or "403" in str(e), f"403 bekleniyordu, {str(e)}"
            print(f"✅ Test 2a: Sahip olmayan iptal edemez")

        # Sahibi iptal eder → fatura ve talep silinir
        result = await cancel_payout_request(request_id, payload={"sub": courier_id, "role": "courier"})
        assert "iptal" in result["message"].lower()
        deleted = await db.payout_requests.find_one({"id": request_id})
        assert deleted is None, "Talep silinmedi"
        deleted_inv = await db.invoices.find_one({"id": invoice_id})
        assert deleted_inv is None, "Fatura silinmedi"
        print(f"✅ Test 2b: Kurye iptal etti, talep ve fatura silindi")

        # === Test 3: Approved talep iptal edilemez ===
        request2_id = str(uuid.uuid4())
        await db.payout_requests.insert_one({
            "id": request2_id, "company_id": company_id, "courier_id": courier_id,
            "courier_name": "Test", "courier_phone": "555",
            "requested_amount": 1200.0, "status": "approved",
            "approved_amount": 1200.0,
            "created_at": datetime.now(TURKEY_TZ).isoformat()
        })
        try:
            await cancel_payout_request(request2_id, payload={"sub": courier_id, "role": "courier"})
            assert False, "Approved iptal edildi"
        except Exception as e:
            assert "bekleyen" in str(e).lower() or "pending" in str(e).lower()
            print(f"✅ Test 3: Approved talep iptal edilemez")
        await db.payout_requests.delete_one({"id": request2_id})

        # === Test 4: Race condition (atomic claim) ===
        # 2 admin aynı anda onaylamaya çalışır → 1'i geçer, 2.si reddedilir
        request3_id = str(uuid.uuid4())
        await db.payout_requests.insert_one({
            "id": request3_id, "company_id": company_id, "courier_id": courier_id,
            "courier_name": "Test", "courier_phone": "555",
            "requested_amount": 1100.0, "status": "pending",
            "installment_product_id": None,
            "created_at": datetime.now(TURKEY_TZ).isoformat()
        })
        admin_payload = {"sub": "admin1", "name": "Admin1", "role": "admin"}
        admin2_payload = {"sub": "admin2", "name": "Admin2", "role": "admin"}
        
        # Aynı anda 2 farklı admin onaylasın
        results = await asyncio.gather(
            approve_payout_request(request3_id, 1100.0, payload=admin_payload),
            approve_payout_request(request3_id, 1100.0, payload=admin2_payload),
            return_exceptions=True
        )
        successes = [r for r in results if isinstance(r, dict)]
        errors = [r for r in results if isinstance(r, Exception)]
        assert len(successes) == 1, f"Race fail: 1 başarı bekleniyordu, {len(successes)} geldi"
        assert len(errors) == 1, f"Race fail: 1 hata bekleniyordu, {len(errors)} geldi"
        print(f"✅ Test 4: Race condition fix çalışıyor (1 başarı, 1 hata)")

        # Onaylanan transaction kontrol — is_hakedis=False
        approved_tx = await db.transactions.find_one(
            {"entity_id": courier_id, "payout_request_id": request3_id},
            {"_id": 0}
        )
        assert approved_tx and approved_tx.get("is_hakedis") is False
        print(f"✅ Test 4b: Onay payment_out is_hakedis=False")

        # === Test 5: Category filter ===
        # Earning + payment_out (cash payout) + custom 'mütabakat eksik' transaction ekle
        await db.transactions.insert_one({
            "id": str(uuid.uuid4()),
            "entity_type": "courier", "entity_id": courier_id,
            "company_id": company_id,
            "type": "payment_out", "amount": 100,
            "description": "Mütabakat eksik nakit",
            "mutabakat_date": "2026-02-01",
            "created_at": datetime.now(TURKEY_TZ).isoformat()
        })
        
        # Earning filtresi
        result = await get_entity_transactions("courier", courier_id, 0, 100, "earning")
        assert len(result["transactions"]) == 30
        for tx in result["transactions"]:
            assert tx["type"] == "earning"
        print(f"✅ Test 5a: Earning filter — {len(result['transactions'])} sonuç (hepsi earning)")

        # Mutabakat filtresi
        result = await get_entity_transactions("courier", courier_id, 0, 100, "mutabakat")
        assert len(result["transactions"]) >= 1
        for tx in result["transactions"]:
            assert "mutabakat_date" in tx or "mütabakat" in tx.get("description", "").lower() or "mutabakat" in tx.get("description", "").lower() or "eksik" in tx.get("description", "").lower()
        print(f"✅ Test 5b: Mutabakat filter — {len(result['transactions'])} sonuç")

        # Payout filter
        result = await get_entity_transactions("courier", courier_id, 0, 100, "payout")
        # Test 4'te onay yapıldı, payment_out (cash payout) var, taksit yoksa filter geçer
        assert len(result["transactions"]) >= 1, f"Payout filter sonuç bulunamadı: {len(result['transactions'])}"
        print(f"✅ Test 5c: Payout filter — {len(result['transactions'])} sonuç")

        # Tümü (filter yok) — earning + payment_out + mutabakat = 30 + 1 + 1 = 32
        result = await get_entity_transactions("courier", courier_id, 0, 100)
        assert result["total_count"] == 32
        print(f"✅ Test 5d: Filter yok — toplam {result['total_count']} işlem")

        print("\n🎉 Tüm yeni özellik testleri geçti")

    finally:
        await cleanup(company_id, courier_id)


if __name__ == "__main__":
    asyncio.run(main())
