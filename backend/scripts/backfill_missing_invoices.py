"""
Tek seferlik backfill scripti.

Mevcut tüm geçmiş `admin_mutabakat` transaction'larını tarar; kurye + iş günü
bazında nakit + kart eksiklerini toplar ve toplam ≥ 1000 TL olanlar için
`missing_invoices` koleksiyonuna kayıt yazar.

Çalıştırma:
    cd /app/backend && python -m scripts.backfill_missing_invoices

Idempotent: Aynı kurye + business_date için kayıt varsa atlar.
"""
import asyncio
import sys
import os
import uuid
from datetime import datetime, timedelta, timezone
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.database import db  # noqa: E402

TR_TZ = timezone(timedelta(hours=3))
MIN_THRESHOLD = 1000.0


def _business_date_from_iso(iso_str: str) -> str:
    """ISO datetime → YYYY-MM-DD (TR-TZ)."""
    try:
        dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
        return dt.astimezone(TR_TZ).strftime("%Y-%m-%d")
    except Exception:
        return ""


async def main():
    print("=" * 70)
    print("Backfill Missing Invoices")
    print("=" * 70)

    # Tüm admin_mutabakat transaction'larını çek
    cursor = db.transactions.find(
        {"is_admin_mutabakat": True, "courier_id": {"$exists": True, "$ne": None},
         "type": {"$in": ["cash", "card", "card_1", "card_10", "card_20"]}},
        {"_id": 0, "courier_id": 1, "type": 1, "amount": 1, "created_at": 1, "company_id": 1}
    )

    # Grup: (company_id, courier_id, business_date) → {cash, card}
    grouped = defaultdict(lambda: {"cash": 0.0, "card": 0.0})
    total_tx = 0
    async for tx in cursor:
        total_tx += 1
        cid = tx.get("courier_id")
        amt = float(tx.get("amount") or 0)
        if amt <= 0:
            continue
        biz = _business_date_from_iso(tx.get("created_at") or "")
        if not biz:
            continue
        comp = tx.get("company_id")
        key = (comp, cid, biz)
        ttype = tx.get("type")
        if ttype == "cash":
            grouped[key]["cash"] += amt
        else:
            grouped[key]["card"] += amt

    print(f"Toplam tx: {total_tx}, grup sayısı: {len(grouped)}")

    # Kurye bilgilerini ve şirket eşleşmelerini tek seferde çek
    courier_ids = list({k[1] for k in grouped.keys()})
    couriers = await db.couriers.find(
        {"id": {"$in": courier_ids}},
        {"_id": 0, "id": 1, "name": 1, "company_id": 1}
    ).to_list(2000)
    courier_map = {c["id"]: c for c in couriers}

    now_iso = datetime.now(TR_TZ).isoformat()
    created = 0
    skipped_under_threshold = 0
    skipped_existing = 0
    skipped_no_company = 0

    for (comp_id, courier_id, biz_date), sums in grouped.items():
        total = round(sums["cash"] + sums["card"], 2)
        if total < MIN_THRESHOLD:
            skipped_under_threshold += 1
            continue

        courier = courier_map.get(courier_id)
        if not courier:
            skipped_no_company += 1
            continue
        target_company = comp_id or courier.get("company_id")
        if not target_company:
            skipped_no_company += 1
            continue

        # Aynı iş günü için aynı kuryeye non-remainder kayıt var mı?
        exists = await db.missing_invoices.find_one({
            "company_id": target_company,
            "courier_id": courier_id,
            "business_date": biz_date,
            "is_remainder": {"$ne": True},
        }, {"_id": 0, "id": 1})
        if exists:
            skipped_existing += 1
            continue

        await db.missing_invoices.insert_one({
            "id": str(uuid.uuid4()),
            "company_id": target_company,
            "courier_id": courier_id,
            "courier_name": courier.get("name") or "",
            "business_date": biz_date,
            "expected_amount": total,
            "cash_amount": round(sums["cash"], 2),
            "card_amount": round(sums["card"], 2),
            "status": "pending",
            "is_remainder": False,
            "is_backfill": True,
            "created_at": now_iso,
        })
        created += 1

    print("-" * 70)
    print(f"Oluşturulan kayıt: {created}")
    print(f"Atlanmış (eşik altı <{MIN_THRESHOLD}): {skipped_under_threshold}")
    print(f"Atlanmış (zaten var): {skipped_existing}")
    print(f"Atlanmış (kurye/şirket bulunamadı): {skipped_no_company}")
    print("Tamamlandı.")


if __name__ == "__main__":
    asyncio.run(main())
