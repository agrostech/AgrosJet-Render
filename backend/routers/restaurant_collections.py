"""
Restoran Kurye Tahsilat API
Restoranın kuryelerden nakit/kart hesap almasını sağlar.
Paket bazlı "Al" butonu — her sipariş tek tek alındı işaretlenir.
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from datetime import datetime, timedelta
from utils.database import db
from utils.helpers import get_turkey_now, TURKEY_TZ
from utils.jwt_utils import require_auth
import uuid
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/restaurant-collections", tags=["Restaurant Collections"])


class CollectOrderRequest(BaseModel):
    order_id: str
    courier_id: str
    date: str


def parse_date(date_str: str, opening_time: str = "06:00", closing_time: str = "06:00") -> tuple[datetime, datetime]:
    """
    İş günü aralığı: seçili gün açılış saati → ertesi gün kapanış saati.
    Örn: opening=06:00, closing=06:00 → 7 Nisan 06:00 - 8 Nisan 06:00
    """
    dt = datetime.strptime(date_str, "%Y-%m-%d")
    
    oh, om = (int(x) for x in opening_time.split(":"))
    ch, cm = (int(x) for x in closing_time.split(":"))
    
    start = dt.replace(hour=oh, minute=om, second=0, tzinfo=TURKEY_TZ)
    end = (dt + timedelta(days=1)).replace(hour=ch, minute=cm, second=0, tzinfo=TURKEY_TZ)
    
    return start, end


async def get_company_hours(restaurant_id: str) -> tuple[str, str]:
    """Restoranın bağlı olduğu şirketin açılış/kapanış saatlerini getir"""
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id}, {"_id": 0, "company_id": 1}
    )
    if not restaurant or not restaurant.get("company_id"):
        return "06:00", "06:00"
    
    company = await db.companies.find_one(
        {"id": restaurant["company_id"]}, {"_id": 0, "opening_time": 1, "closing_time": 1}
    )
    if not company:
        return "06:00", "06:00"
    
    return company.get("opening_time", "06:00"), company.get("closing_time", "06:00")


def filter_orders_by_date(orders, start_dt, end_dt):
    filtered = []
    for order in orders:
        order_date = order.get("delivered_at") or order.get("created_at")
        if not order_date:
            continue
        if isinstance(order_date, str):
            try:
                order_dt = datetime.fromisoformat(order_date.replace('Z', '+00:00'))
            except (ValueError, TypeError):
                continue
        elif isinstance(order_date, datetime):
            order_dt = order_date
        else:
            continue
        if order_dt.tzinfo is None:
            order_dt = order_dt.replace(tzinfo=TURKEY_TZ)
        if start_dt <= order_dt <= end_dt:
            filtered.append(order)
    return filtered


@router.get("/{restaurant_id}/courier-balances")
async def get_courier_balances(restaurant_id: str, date: str, user=Depends(require_auth)):
    """Belirli bir gün için kurye bazında paketleri listele. Her paketin alındı durumu ayrı."""
    opening, closing = await get_company_hours(restaurant_id)
    start_dt, end_dt = parse_date(date, opening, closing)

    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0, "id": 1, "collection_settings": 1}
    )
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")

    cs = restaurant.get("collection_settings", {})
    cash_by_restaurant = cs.get("cash_collection", "courier") == "restaurant"
    card_by_restaurant = cs.get("card_collection", "courier") == "restaurant"

    if not cash_by_restaurant and not card_by_restaurant:
        return {"couriers": [], "message": "Bu restoran için kurye tahsilatı ayarlanmamış"}

    payment_methods = []
    if cash_by_restaurant:
        payment_methods.append("cash")
    if card_by_restaurant:
        payment_methods.append("card")

    orders = await db.orders.find(
        {
            "restaurant_id": restaurant_id,
            "status": {"$in": ["delivered", "completed"]},
            "payment_method": {"$in": payment_methods},
            "courier_id": {"$exists": True, "$ne": None}
        },
        {"_id": 0, "id": 1, "courier_id": 1, "payment_method": 1, "total_amount": 1,
         "delivered_at": 1, "created_at": 1, "customer_name": 1, "customer_address": 1,
         "delivery_address": 1, "platform": 1}
    ).to_list(5000)

    filtered = filter_orders_by_date(orders, start_dt, end_dt)

    # Alınmış sipariş ID'lerini çek
    collected_records = await db.restaurant_courier_collections.find(
        {"restaurant_id": restaurant_id, "date": date},
        {"_id": 0, "order_id": 1}
    ).to_list(5000)
    collected_order_ids = set(r["order_id"] for r in collected_records if "order_id" in r)

    # Kurye bazında grupla
    courier_map = {}
    for order in filtered:
        cid = order["courier_id"]
        if cid not in courier_map:
            courier_map[cid] = {"orders": [], "cash_total": 0, "card_total": 0}

        address = order.get("customer_address") or order.get("delivery_address") or ""
        if isinstance(address, dict):
            address = address.get("address", "") or address.get("detail", "")

        courier_map[cid]["orders"].append({
            "id": order["id"],
            "payment_method": order.get("payment_method", ""),
            "total_amount": order.get("total_amount", 0) or 0,
            "customer_name": order.get("customer_name", ""),
            "address": address,
            "platform": order.get("platform", ""),
            "is_collected": order["id"] in collected_order_ids,
        })
        amount = order.get("total_amount", 0) or 0
        if order.get("payment_method") == "cash":
            courier_map[cid]["cash_total"] += amount
        elif order.get("payment_method") == "card":
            courier_map[cid]["card_total"] += amount

    if not courier_map:
        return {"couriers": [], "date": date}

    # Kurye bilgilerini çek
    courier_ids = list(courier_map.keys())
    couriers_data = await db.couriers.find(
        {"id": {"$in": courier_ids}},
        {"_id": 0, "id": 1, "name": 1}
    ).to_list(100)
    courier_info = {c["id"]: c for c in couriers_data}

    result = []
    for cid, data in courier_map.items():
        info = courier_info.get(cid, {})
        all_collected = all(o["is_collected"] for o in data["orders"])
        total = round(data["cash_total"] + data["card_total"], 2)
        result.append({
            "courier_id": cid,
            "courier_name": info.get("name", "Bilinmeyen Kurye"),
            "order_count": len(data["orders"]),
            "orders": data["orders"],
            "cash_total": round(data["cash_total"], 2),
            "card_total": round(data["card_total"], 2),
            "total": total,
            "all_collected": all_collected,
        })

    result.sort(key=lambda x: (x["all_collected"], -x["total"]))

    return {"couriers": result, "date": date}


@router.post("/{restaurant_id}/collect")
async def collect_order(restaurant_id: str, data: CollectOrderRequest, user=Depends(require_auth)):
    """Tek bir siparişi alındı olarak işaretle"""
    existing = await db.restaurant_courier_collections.find_one(
        {"restaurant_id": restaurant_id, "order_id": data.order_id, "date": data.date}
    )
    if existing:
        raise HTTPException(status_code=400, detail="Bu sipariş zaten alınmış")

    # Kullanıcı adını bul
    created_by = ""
    user_id = user.get("user_id", "")
    if user_id:
        ru = await db.restaurant_users.find_one({"id": user_id}, {"_id": 0, "name": 1, "username": 1})
        if ru:
            created_by = ru.get("name", ru.get("username", ""))
        else:
            admin = await db.admins.find_one({"id": user_id}, {"_id": 0, "name": 1, "username": 1})
            if admin:
                created_by = admin.get("name", admin.get("username", ""))

    await db.restaurant_courier_collections.insert_one({
        "id": str(uuid.uuid4()),
        "restaurant_id": restaurant_id,
        "order_id": data.order_id,
        "courier_id": data.courier_id,
        "date": data.date,
        "created_at": get_turkey_now(),
        "created_by": created_by,
    })

    return {"success": True, "message": "Tahsilat alındı"}


@router.get("/{restaurant_id}/week-status")
async def get_week_status(restaurant_id: str, week_start: str, user=Depends(require_auth)):
    """Haftanın her günü için tahsilat durumunu döndür."""
    start = datetime.strptime(week_start, "%Y-%m-%d")
    opening, closing = await get_company_hours(restaurant_id)

    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id}, {"_id": 0, "collection_settings": 1}
    )
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")

    cs = restaurant.get("collection_settings", {})
    cash_by_restaurant = cs.get("cash_collection", "courier") == "restaurant"
    card_by_restaurant = cs.get("card_collection", "courier") == "restaurant"
    payment_methods = []
    if cash_by_restaurant:
        payment_methods.append("cash")
    if card_by_restaurant:
        payment_methods.append("card")

    empty_days = [{"date": (start + timedelta(days=i)).strftime("%Y-%m-%d"),
                   "day_name": ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"][(start + timedelta(days=i)).weekday()],
                   "has_orders": False, "all_completed": False, "courier_count": 0}
                  for i in range(7)]

    if not payment_methods:
        return {"days": empty_days, "week_start": week_start}

    # Tüm hafta aralığı: ilk günün açılışı → son günün kapanışı (ertesi gün)
    oh, om = (int(x) for x in opening.split(":"))
    ch, cm = (int(x) for x in closing.split(":"))
    week_start_dt = start.replace(hour=oh, minute=om, second=0, tzinfo=TURKEY_TZ)
    week_end_dt = (start + timedelta(days=7)).replace(hour=ch, minute=cm, second=0, tzinfo=TURKEY_TZ)

    orders = await db.orders.find(
        {
            "restaurant_id": restaurant_id,
            "status": {"$in": ["delivered", "completed"]},
            "payment_method": {"$in": payment_methods},
            "courier_id": {"$exists": True, "$ne": None},
        },
        {"_id": 0, "id": 1, "delivered_at": 1, "created_at": 1}
    ).to_list(5000)

    filtered = filter_orders_by_date(orders, week_start_dt, week_end_dt)

    # Gün bazında sipariş ID setleri — şirket saatlerine göre hangi güne ait
    day_orders = {}
    for order in filtered:
        order_date = order.get("delivered_at") or order.get("created_at")
        if isinstance(order_date, str):
            try:
                dt = datetime.fromisoformat(order_date.replace('Z', '+00:00')).astimezone(TURKEY_TZ)
            except (ValueError, TypeError):
                continue
        elif isinstance(order_date, datetime):
            dt = order_date.astimezone(TURKEY_TZ) if order_date.tzinfo else order_date.replace(tzinfo=TURKEY_TZ)
        else:
            continue
        
        # Sipariş hangi iş gününe ait? Her gün için aralık kontrol et
        for i in range(7):
            day = start + timedelta(days=i)
            day_start = day.replace(hour=oh, minute=om, second=0, tzinfo=TURKEY_TZ)
            day_end = (day + timedelta(days=1)).replace(hour=ch, minute=cm, second=0, tzinfo=TURKEY_TZ)
            if day_start <= dt < day_end:
                day_str = day.strftime("%Y-%m-%d")
                if day_str not in day_orders:
                    day_orders[day_str] = set()
                day_orders[day_str].add(order["id"])
                break

    # Hafta için tüm tahsilatları çek
    week_end_str = (start + timedelta(days=6)).strftime("%Y-%m-%d")
    collections = await db.restaurant_courier_collections.find(
        {"restaurant_id": restaurant_id, "date": {"$gte": week_start, "$lte": week_end_str}},
        {"_id": 0, "order_id": 1, "date": 1}
    ).to_list(5000)

    collected_by_day = {}
    for col in collections:
        d = col["date"]
        if d not in collected_by_day:
            collected_by_day[d] = set()
        collected_by_day[d].add(col["order_id"])

    result = []
    for i in range(7):
        day = start + timedelta(days=i)
        day_str = day.strftime("%Y-%m-%d")
        order_set = day_orders.get(day_str, set())
        collected_set = collected_by_day.get(day_str, set())
        has_orders = len(order_set) > 0
        all_completed = has_orders and order_set.issubset(collected_set)

        result.append({
            "date": day_str,
            "day_name": ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"][day.weekday()],
            "has_orders": has_orders,
            "all_completed": all_completed,
            "courier_count": len(order_set),
        })

    return {"days": result, "week_start": week_start}
