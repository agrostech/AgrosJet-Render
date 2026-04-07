"""
Restoran Kurye Tahsilat API
Restoranın kuryelerden nakit/kart hesap almasını sağlar.
Kurye bazında paketler listelenir, "Al" ile toplu olarak alındı işaretlenir.
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


class CollectRequest(BaseModel):
    courier_id: str
    date: str  # YYYY-MM-DD


def parse_date(date_str: str) -> tuple[datetime, datetime]:
    dt = datetime.strptime(date_str, "%Y-%m-%d")
    start = dt.replace(hour=0, minute=0, second=0, tzinfo=TURKEY_TZ)
    end = dt.replace(hour=23, minute=59, second=59, tzinfo=TURKEY_TZ)
    return start, end


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
    """
    Belirli bir gün için kurye bazında paketleri listele.
    Alınmış kuryeler ayrı gösterilir.
    """
    start_dt, end_dt = parse_date(date)

    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0, "id": 1, "name": 1, "collection_settings": 1}
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
         "delivered_at": 1, "created_at": 1, "customer_name": 1, "platform": 1, "order_code": 1}
    ).to_list(5000)

    filtered = filter_orders_by_date(orders, start_dt, end_dt)

    # Kurye bazında grupla
    courier_map = {}
    for order in filtered:
        cid = order["courier_id"]
        if cid not in courier_map:
            courier_map[cid] = {"orders": [], "cash_total": 0, "card_total": 0}
        courier_map[cid]["orders"].append({
            "id": order["id"],
            "payment_method": order.get("payment_method", ""),
            "total_amount": order.get("total_amount", 0) or 0,
            "customer_name": order.get("customer_name", ""),
            "platform": order.get("platform", ""),
            "order_code": order.get("order_code", ""),
        })
        amount = order.get("total_amount", 0) or 0
        if order.get("payment_method") == "cash":
            courier_map[cid]["cash_total"] += amount
        elif order.get("payment_method") == "card":
            courier_map[cid]["card_total"] += amount

    if not courier_map:
        return {"couriers": [], "date": date}

    # Alınmış kuryeleri çek
    collected_records = await db.restaurant_courier_collections.find(
        {"restaurant_id": restaurant_id, "date": date},
        {"_id": 0, "courier_id": 1}
    ).to_list(500)
    collected_courier_ids = set(r["courier_id"] for r in collected_records)

    # Kurye bilgilerini çek
    courier_ids = list(courier_map.keys())
    couriers_data = await db.couriers.find(
        {"id": {"$in": courier_ids}},
        {"_id": 0, "id": 1, "name": 1, "phone": 1}
    ).to_list(100)
    courier_info = {c["id"]: c for c in couriers_data}

    result = []
    for cid, data in courier_map.items():
        info = courier_info.get(cid, {})
        is_collected = cid in collected_courier_ids
        total = round(data["cash_total"] + data["card_total"], 2)
        result.append({
            "courier_id": cid,
            "courier_name": info.get("name", "Bilinmeyen Kurye"),
            "courier_phone": info.get("phone", ""),
            "order_count": len(data["orders"]),
            "orders": data["orders"],
            "cash_total": round(data["cash_total"], 2),
            "card_total": round(data["card_total"], 2),
            "total": total,
            "is_collected": is_collected,
        })

    # Alınmamışlar önce
    result.sort(key=lambda x: (x["is_collected"], -x["total"]))

    return {
        "couriers": result,
        "date": date,
        "cash_by_restaurant": cash_by_restaurant,
        "card_by_restaurant": card_by_restaurant,
    }


@router.post("/{restaurant_id}/collect")
async def collect_from_courier(restaurant_id: str, data: CollectRequest, user=Depends(require_auth)):
    """Kuryeden toplu tahsilat — tüm bakiyeyi alındı olarak işaretle"""
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id}, {"_id": 0, "id": 1, "name": 1}
    )
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")

    courier = await db.couriers.find_one(
        {"id": data.courier_id}, {"_id": 0, "id": 1, "name": 1}
    )
    if not courier:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")

    # Zaten alınmış mı?
    existing = await db.restaurant_courier_collections.find_one(
        {"restaurant_id": restaurant_id, "courier_id": data.courier_id, "date": data.date}
    )
    if existing:
        raise HTTPException(status_code=400, detail="Bu kurye için tahsilat zaten alınmış")

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
        "restaurant_name": restaurant.get("name", ""),
        "courier_id": data.courier_id,
        "courier_name": courier.get("name", ""),
        "date": data.date,
        "created_at": get_turkey_now(),
        "created_by": created_by,
    })

    logger.info(f"Restoran tahsilat: {restaurant.get('name')} <- {courier.get('name')}, tarih={data.date}")

    return {
        "success": True,
        "message": f"{courier.get('name')} kuryesinden tahsilat alındı",
    }


@router.get("/{restaurant_id}/week-status")
async def get_week_status(restaurant_id: str, week_start: str, user=Depends(require_auth)):
    """Haftanın her günü için tahsilat durumunu döndür."""
    start = datetime.strptime(week_start, "%Y-%m-%d")

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

    if not payment_methods:
        return {"days": [{"date": (start + timedelta(days=i)).strftime("%Y-%m-%d"),
                          "day_name": ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"][(start + timedelta(days=i)).weekday()],
                          "has_orders": False, "all_completed": False, "courier_count": 0}
                         for i in range(7)], "week_start": week_start}

    # Tüm hafta için siparişleri tek sorguda çek
    week_start_dt = start.replace(hour=0, minute=0, second=0, tzinfo=TURKEY_TZ)
    week_end_dt = (start + timedelta(days=6)).replace(hour=23, minute=59, second=59, tzinfo=TURKEY_TZ)

    orders = await db.orders.find(
        {
            "restaurant_id": restaurant_id,
            "status": {"$in": ["delivered", "completed"]},
            "payment_method": {"$in": payment_methods},
            "courier_id": {"$exists": True, "$ne": None},
        },
        {"_id": 0, "courier_id": 1, "delivered_at": 1, "created_at": 1}
    ).to_list(5000)

    filtered = filter_orders_by_date(orders, week_start_dt, week_end_dt)

    # Gün bazında kurye setleri oluştur
    day_couriers = {}
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
        day_str = dt.strftime("%Y-%m-%d")
        if day_str not in day_couriers:
            day_couriers[day_str] = set()
        day_couriers[day_str].add(order["courier_id"])

    # Hafta için tüm tahsilatları çek
    collections = await db.restaurant_courier_collections.find(
        {"restaurant_id": restaurant_id, "date": {"$gte": week_start, "$lte": (start + timedelta(days=6)).strftime("%Y-%m-%d")}},
        {"_id": 0, "courier_id": 1, "date": 1}
    ).to_list(1000)

    collected_by_day = {}
    for col in collections:
        d = col["date"]
        if d not in collected_by_day:
            collected_by_day[d] = set()
        collected_by_day[d].add(col["courier_id"])

    result = []
    for i in range(7):
        day = start + timedelta(days=i)
        day_str = day.strftime("%Y-%m-%d")
        courier_set = day_couriers.get(day_str, set())
        collected_set = collected_by_day.get(day_str, set())
        has_orders = len(courier_set) > 0
        all_completed = has_orders and courier_set.issubset(collected_set)

        result.append({
            "date": day_str,
            "day_name": ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"][day.weekday()],
            "has_orders": has_orders,
            "all_completed": all_completed,
            "courier_count": len(courier_set),
        })

    return {"days": result, "week_start": week_start}
