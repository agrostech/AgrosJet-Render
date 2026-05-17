"""
Hakediş window match regression test.

Aşağıdaki senaryolar `_hakedis_window_match` filtresinin doğru çalıştığını doğrular:

1. business_date < hafta başlangıcı, created_at hafta penceresi içinde → DIŞARIDA
   (Eski created_at-only filter bu kayıtları yanlışlıkla dahil ediyordu.)
2. business_date > hafta sonu, created_at hafta penceresi dışında → İÇERİDE
   (Eski filter bunları yanlışlıkla DIŞARIDA bırakıyordu — son günün hakedişi kayıp.)
3. business_date hafta içinde → İÇERİDE
4. Manuel hakediş (daily_hakedis_meta yok), created_at hafta içinde → İÇERİDE
5. Manuel hakediş, created_at hafta dışında → DIŞARIDA
"""
import asyncio
import pytest
import sys
sys.path.insert(0, "/app/backend")

from utils.database import db
from routers.courier_invoice_obligations import _hakedis_window_match


@pytest.mark.asyncio
async def test_business_date_window_excludes_off_by_one():
    company_id = "_test_obligation_window_pytest"
    await db.transactions.delete_many({"company_id": company_id})

    txs = [
        # business_date=10 May (geçen hafta), created_at=11 May 06:00 (yeni hafta başlangıcı)
        {"id": "tx1", "company_id": company_id, "entity_type": "courier", "entity_id": "c1",
         "is_hakedis": True, "amount": 100,
         "daily_hakedis_meta": {"business_date": "2026-05-10"},
         "created_at": "2026-05-11T06:00:00+03:00"},
        # business_date=17 May (hafta sonu), created_at=18 May 06:00 (window dışı)
        {"id": "tx2", "company_id": company_id, "entity_type": "courier", "entity_id": "c1",
         "is_hakedis": True, "amount": 200,
         "daily_hakedis_meta": {"business_date": "2026-05-17"},
         "created_at": "2026-05-18T06:00:00+03:00"},
        # business_date=14 May (hafta ortası)
        {"id": "tx3", "company_id": company_id, "entity_type": "courier", "entity_id": "c1",
         "is_hakedis": True, "amount": 300,
         "daily_hakedis_meta": {"business_date": "2026-05-14"},
         "created_at": "2026-05-15T06:00:00+03:00"},
        # Manuel (meta yok), created_at=12 May → fallback ile dahil
        {"id": "tx4", "company_id": company_id, "entity_type": "courier", "entity_id": "c2",
         "is_hakedis": True, "amount": 50,
         "created_at": "2026-05-12T12:00:00+03:00"},
        # Manuel (meta yok), created_at=10 May → fallback ile dışarıda
        {"id": "tx5", "company_id": company_id, "entity_type": "courier", "entity_id": "c2",
         "is_hakedis": True, "amount": 999,
         "created_at": "2026-05-10T12:00:00+03:00"},
        # Legacy weekly hakediş: dönem 4-11 May (geçen hafta), created_at 15 May (içeride!)
        # weekly_hakedis_meta.week_start ile filtrelenmeli → DIŞARIDA
        {"id": "tx6", "company_id": company_id, "entity_type": "courier", "entity_id": "c3",
         "is_hakedis": True, "amount": 3100,
         "weekly_hakedis_meta": {"week_start": "2026-05-04T06:00:00+03:00",
                                  "week_end": "2026-05-11T06:00:00+03:00"},
         "created_at": "2026-05-15T07:00:00+03:00"},
        # Legacy weekly hakediş: dönem 11-18 May (bu hafta) → İÇERDE
        {"id": "tx7", "company_id": company_id, "entity_type": "courier", "entity_id": "c3",
         "is_hakedis": True, "amount": 400,
         "weekly_hakedis_meta": {"week_start": "2026-05-11T06:00:00+03:00",
                                  "week_end": "2026-05-18T06:00:00+03:00"},
         "created_at": "2026-05-19T07:00:00+03:00"},
    ]
    await db.transactions.insert_many(txs)

    match = _hakedis_window_match(
        company_id,
        week_start_date="2026-05-11",
        week_end_date="2026-05-17",
        week_start_iso="2026-05-11T06:00:00+03:00",
        week_end_iso="2026-05-18T06:00:00+03:00",
    )
    rows = await db.transactions.aggregate([
        {"$match": match},
        {"$group": {"_id": "$entity_id", "total": {"$sum": "$amount"}}},
    ]).to_list(100)
    totals = {r["_id"]: r["total"] for r in rows}

    assert totals.get("c1") == 500, f"c1 expected 500 (tx2+tx3) got {totals.get('c1')}"
    assert totals.get("c2") == 50, f"c2 expected 50 (tx4 only) got {totals.get('c2')}"
    assert totals.get("c3") == 400, f"c3 expected 400 (tx7 only; tx6 is for prev week) got {totals.get('c3')}"

    await db.transactions.delete_many({"company_id": company_id})


if __name__ == "__main__":
    asyncio.run(test_business_date_window_excludes_off_by_one())
    print("PASS")
