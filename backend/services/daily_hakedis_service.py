"""
Günlük Hakediş Modülü

Haftalık hakediş ile aynı hesaplama mantığını kullanır ancak periyot günlük.
- Şirketin açılış-kapanış saatine göre "iş günü" (Pazartesi 06:00 → Salı 06:00)
- description'a iş günü tarihi yazılır → idempotent kontrol
- Otomatik işleme: gün-bazlı toggle (Pazartesi/Salı/.../Pazar her biri ayrı)
- Superadmin gün-bazlı geri alabilir
"""
from datetime import datetime, timedelta, timezone
import uuid
import re

from utils.database import db
from utils.helpers import get_turkey_now

TR_TZ = timezone(timedelta(hours=3))
WEEKDAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


def parse_hhmm(s: str, default_h: int = 6, default_m: int = 0):
    try:
        h, m = [int(x) for x in s.split(":")]
        return h, m
    except Exception:
        return default_h, default_m


def business_day_window(business_date: str, opening_time: str, closing_time: str):
    """
    business_date: "YYYY-MM-DD" — bu iş gününün başlangıç tarihi.
    İş günü: business_date opening_time → next-day opening_time (closing kullanılmaz,
    çünkü çoğu şirket gece açılır gece kapanır; opening→opening 24 saat penceresi en güvenli).
    Returns (start_iso, end_iso) TR-TZ +03:00 ISO formatında.
    """
    oh, om = parse_hhmm(opening_time, 6, 0)
    start = datetime.strptime(business_date, "%Y-%m-%d").replace(hour=oh, minute=om, tzinfo=TR_TZ)
    end = start + timedelta(days=1)
    return start, end


def day_description(business_date: str, start_dt: datetime, end_dt: datetime) -> str:
    """transaction description'ında kullanılır; idempotency anahtarı."""
    return f"Günlük Hakediş {business_date} ({start_dt.strftime('%H:%M')}-{end_dt.strftime('%H:%M')})"


async def calculate_day_hakedis(company_id: str, business_date: str):
    """Tek bir iş günü için tüm kuryelerin hakediş listesi."""
    company = await db.companies.find_one({"id": company_id}, {"_id": 0, "opening_time": 1, "closing_time": 1})
    opening = (company or {}).get("opening_time") or "06:00"
    closing = (company or {}).get("closing_time") or "06:00"
    start_dt, end_dt = business_day_window(business_date, opening, closing)
    start_iso, end_iso = start_dt.isoformat(), end_dt.isoformat()

    couriers = await db.couriers.find(
        {
            "$or": [{"company_ids": company_id}, {"company_id": company_id}],
            "is_archived": {"$ne": True},
        },
        {"_id": 0, "id": 1, "name": 1, "phone": 1, "hourly_rate": 1, "is_admin_linked": 1, "linked_admin_id": 1},
    ).to_list(2000)
    courier_map = {c["id"]: c for c in couriers}
    courier_ids = list(courier_map.keys())
    if not courier_ids:
        return {
            "couriers": [],
            "summary": {"total_amount": 0, "total_orders": 0},
            "description": day_description(business_date, start_dt, end_dt),
            "business_date": business_date,
            "window": {"start": start_iso, "end": end_iso},
        }

    pipeline = [
        {"$match": {
            "company_id": company_id, "status": "delivered",
            "courier_id": {"$in": courier_ids},
            "delivered_at": {"$gte": start_iso, "$lte": end_iso},
        }},
        {"$group": {
            "_id": "$courier_id",
            "total_amount": {"$sum": {"$ifNull": ["$courier_fee", 0]}},
            "total_orders": {"$sum": 1},
            "total_distance": {"$sum": {"$ifNull": ["$distance_km", 0]}},
        }},
    ]
    results = await db.orders.aggregate(pipeline).to_list(2000)
    hakedis_map = {r["_id"]: r for r in results}

    # Saatlik kazanç: courier_daily_active.date == business_date
    active_minutes_map = {}
    cursor = db.courier_daily_active.find(
        {"courier_id": {"$in": courier_ids}, "date": business_date},
        {"_id": 0, "courier_id": 1, "active_minutes": 1},
    )
    async for r in cursor:
        active_minutes_map[r["courier_id"]] = r.get("active_minutes", 0)

    desc = day_description(business_date, start_dt, end_dt)
    desc_escaped = re.escape(desc)
    processed = await db.transactions.find(
        {"company_id": company_id, "entity_type": "courier", "is_hakedis": True,
         "description": {"$regex": desc_escaped, "$options": "i"}},
        {"_id": 0, "entity_id": 1, "amount": 1, "id": 1},
    ).to_list(2000)
    processed_map = {p["entity_id"]: p for p in processed}

    courier_list, total_amount, total_orders = [], 0.0, 0
    for cid, courier in courier_map.items():
        h = hakedis_map.get(cid, {})
        package_amount = round(h.get("total_amount", 0), 2)
        orders = h.get("total_orders", 0)
        distance = round(h.get("total_distance", 0), 2)
        active_minutes = active_minutes_map.get(cid, 0)
        active_hours = round(active_minutes / 60, 2)
        hourly_rate = courier.get("hourly_rate") or 0
        hourly_earnings = round(active_hours * hourly_rate, 2)
        amount = round(package_amount + hourly_earnings, 2)

        is_processed = False
        tx_id = None
        p = processed_map.get(cid)
        if p and abs(p["amount"] - amount) < 0.01:
            is_processed = True
            tx_id = p["id"]

        courier_list.append({
            "courier_id": cid,
            "courier_name": courier.get("name", ""),
            "amount": amount,
            "package_amount": package_amount,
            "order_count": orders,
            "distance_km": distance,
            "active_hours": active_hours,
            "hourly_rate": hourly_rate,
            "hourly_earnings": hourly_earnings,
            "is_processed": is_processed,
            "transaction_id": tx_id,
            "is_admin_linked": courier.get("is_admin_linked", False),
            "linked_admin_id": courier.get("linked_admin_id"),
        })
        total_amount += amount
        total_orders += orders

    courier_list.sort(key=lambda x: x["amount"], reverse=True)
    return {
        "couriers": courier_list,
        "summary": {"total_amount": round(total_amount, 2), "total_orders": total_orders},
        "description": desc,
        "business_date": business_date,
        "window": {"start": start_iso, "end": end_iso},
    }


async def apply_day_hakedis(company_id: str, business_date: str, items: list, admin_id: str, admin_name: str, add_jetpuan: bool = True):
    """Tek gün için listelenen kuryelere bakiye yazar (idempotent)."""
    from routers.jetpuan import calculate_and_credit_points
    company = await db.companies.find_one({"id": company_id}, {"_id": 0, "opening_time": 1, "closing_time": 1})
    opening = (company or {}).get("opening_time") or "06:00"
    closing = (company or {}).get("closing_time") or "06:00"
    start_dt, end_dt = business_day_window(business_date, opening, closing)
    desc_root = day_description(business_date, start_dt, end_dt)
    created_at = get_turkey_now()
    processed, skipped = [], []
    desc_escaped = re.escape(desc_root)

    for it in items:
        amount = float(it.get("amount") or 0)
        if amount <= 0:
            skipped.append({"courier_id": it.get("courier_id"), "reason": "Tutar 0 veya negatif"})
            continue
        existing = await db.transactions.find_one({
            "company_id": company_id, "entity_type": "courier", "entity_id": it["courier_id"],
            "is_hakedis": True, "description": {"$regex": desc_escaped, "$options": "i"},
        })
        if existing:
            skipped.append({"courier_id": it["courier_id"], "reason": "Bu gün için zaten işlenmiş"})
            continue
        parts = [desc_root]
        if it.get("order_count"):
            parts.append(f"{it['order_count']} Sipariş")
        if it.get("distance_km"):
            parts.append(f"{it['distance_km']:.1f} km")
        description = " | ".join(parts)
        tx = {
            "id": str(uuid.uuid4()),
            "entity_type": "courier",
            "entity_id": it["courier_id"],
            "company_id": company_id,
            "type": "payment_in",
            "amount": amount,
            "description": description,
            "is_hakedis": True,
            "requires_invoice": False,  # Günlük hakedişler artık her transaction'a fatura aramayacak
            "admin_id": admin_id,
            "admin_name": admin_name,
            "created_at": created_at,
            "daily_hakedis_meta": {
                "business_date": business_date,
                "window_start": start_dt.isoformat(),
                "window_end": end_dt.isoformat(),
                "order_count": it.get("order_count", 0),
                "distance_km": it.get("distance_km", 0),
            },
        }
        await db.transactions.insert_one(tx)
        if add_jetpuan:
            try:
                await calculate_and_credit_points(it["courier_id"], amount)
            except Exception as e:
                print(f"JetPuan credit failed ({it.get('courier_id')}): {e}")
        processed.append({"courier_id": it["courier_id"], "amount": amount, "transaction_id": tx["id"]})

    return {"processed": processed, "skipped": skipped, "total_amount": sum(p["amount"] for p in processed)}


async def revert_day_hakedis(company_id: str, business_date: str, courier_ids: list = None):
    """Bir günün hakediş transaction'larını geri alır (sadece superadmin)."""
    from routers.jetpuan import calculate_and_debit_points
    company = await db.companies.find_one({"id": company_id}, {"_id": 0, "opening_time": 1, "closing_time": 1})
    opening = (company or {}).get("opening_time") or "06:00"
    closing = (company or {}).get("closing_time") or "06:00"
    start_dt, end_dt = business_day_window(business_date, opening, closing)
    desc_root = day_description(business_date, start_dt, end_dt)
    desc_escaped = re.escape(desc_root)
    q = {"company_id": company_id, "entity_type": "courier", "is_hakedis": True,
         "description": {"$regex": desc_escaped, "$options": "i"}}
    if courier_ids:
        q["entity_id"] = {"$in": courier_ids}
    txs = await db.transactions.find(q, {"_id": 0}).to_list(2000)
    reverted = []
    for tx in txs:
        await db.transactions.delete_one({"id": tx["id"]})
        try:
            await calculate_and_debit_points(tx["entity_id"], tx["amount"])
        except Exception as e:
            print(f"JetPuan debit failed ({tx['entity_id']}): {e}")
        reverted.append({"courier_id": tx["entity_id"], "amount": tx["amount"], "transaction_id": tx["id"]})
    return {"reverted": reverted, "total": sum(r["amount"] for r in reverted)}


def yesterday_business_date() -> str:
    """Şu anki TR-TZ saatine göre 'dün'."""
    now = datetime.now(TR_TZ)
    return (now - timedelta(days=1)).strftime("%Y-%m-%d")


def weekday_key_for_date(date_str: str) -> str:
    return WEEKDAY_KEYS[datetime.strptime(date_str, "%Y-%m-%d").weekday()]


async def process_auto_daily_for_company(company_id: str):
    """Scheduler tarafından çağrılır. Açılış saati penceresinde dün'ü işler.
    Sadece o günün haftalık toggle'ı (weekday) açıksa çalışır."""
    settings = await db.daily_hakedis_settings.find_one({"company_id": company_id})
    if not settings:
        return {"skipped": "no_settings"}
    biz_date = yesterday_business_date()
    weekday = weekday_key_for_date(biz_date)
    days_enabled = settings.get("days_enabled") or {}
    if not days_enabled.get(weekday, False):
        return {"skipped": f"day_disabled:{weekday}"}
    data = await calculate_day_hakedis(company_id, biz_date)
    items = [c for c in data["couriers"] if not c["is_processed"] and c["amount"] > 0]
    if not items:
        return {"skipped": "no_items"}
    return await apply_day_hakedis(company_id, biz_date, items, "system", "Sistem", add_jetpuan=True)
