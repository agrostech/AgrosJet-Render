"""
Restoran Kurye Tahsilat API
Restoranın kuryelerden nakit/kart hesap almasını sağlar.
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


class CollectionRequest(BaseModel):
    courier_id: str
    amount: float
    payment_type: str  # "cash" or "card"
    date: str  # YYYY-MM-DD


def parse_date(date_str: str) -> tuple[datetime, datetime]:
    """Tarih string'inden gün başlangıç ve bitiş döndür (Turkey TZ)"""
    dt = datetime.strptime(date_str, "%Y-%m-%d")
    start = dt.replace(hour=0, minute=0, second=0, tzinfo=TURKEY_TZ)
    end = dt.replace(hour=23, minute=59, second=59, tzinfo=TURKEY_TZ)
    return start, end


@router.get("/{restaurant_id}/courier-balances")
async def get_courier_balances(restaurant_id: str, date: str, user=Depends(require_auth)):
    """
    Belirli bir gün için restoran adına tahsilat yapan kuryelerin bakiyelerini döndür.
    Sadece restoranın tahsil ettiği (collection_settings) nakit/kart siparişler.
    """
    start_dt, end_dt = parse_date(date)
    
    # Restoran bilgisini al
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0, "id": 1, "name": 1, "collection_settings": 1, "company_id": 1}
    )
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    cs = restaurant.get("collection_settings", {})
    cash_by_restaurant = cs.get("cash_collection", "courier") == "restaurant"
    card_by_restaurant = cs.get("card_collection", "courier") == "restaurant"
    
    if not cash_by_restaurant and not card_by_restaurant:
        return {"couriers": [], "message": "Bu restoran için kurye tahsilatı ayarlanmamış"}
    
    # Hangi ödeme yöntemlerini dahil edeceğiz
    payment_methods = []
    if cash_by_restaurant:
        payment_methods.append("cash")
    if card_by_restaurant:
        payment_methods.append("card")
    
    # O gün için teslim edilmiş siparişleri çek
    order_filter = {
        "restaurant_id": restaurant_id,
        "status": {"$in": ["delivered", "completed"]},
        "payment_method": {"$in": payment_methods},
        "courier_id": {"$exists": True, "$ne": None}
    }
    
    orders = await db.orders.find(
        order_filter,
        {"_id": 0, "id": 1, "courier_id": 1, "payment_method": 1, "total_amount": 1, 
         "delivered_at": 1, "created_at": 1}
    ).to_list(5000)
    
    # Tarihe göre filtrele (delivered_at veya created_at)
    filtered_orders = []
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
            order_dt = TURKEY_TZ.localize(order_dt)
        
        if start_dt <= order_dt <= end_dt:
            filtered_orders.append(order)
    
    # Kurye bazında grupla
    courier_map = {}
    for order in filtered_orders:
        cid = order["courier_id"]
        if cid not in courier_map:
            courier_map[cid] = {"cash_total": 0, "card_total": 0, "order_count": 0}
        
        amount = order.get("total_amount", 0) or 0
        pm = order.get("payment_method", "")
        
        if pm == "cash":
            courier_map[cid]["cash_total"] += amount
        elif pm == "card":
            courier_map[cid]["card_total"] += amount
        courier_map[cid]["order_count"] += 1
    
    if not courier_map:
        return {"couriers": [], "date": date}
    
    # O gün için yapılmış tahsilatları çek
    collections = await db.restaurant_courier_collections.find(
        {
            "restaurant_id": restaurant_id,
            "date": date
        },
        {"_id": 0}
    ).to_list(1000)
    
    # Tahsilat toplamlarını hesapla
    collection_map = {}
    for col in collections:
        cid = col["courier_id"]
        if cid not in collection_map:
            collection_map[cid] = {"cash_collected": 0, "card_collected": 0}
        if col.get("payment_type") == "cash":
            collection_map[cid]["cash_collected"] += col.get("amount", 0)
        elif col.get("payment_type") == "card":
            collection_map[cid]["card_collected"] += col.get("amount", 0)
    
    # Kurye bilgilerini çek
    courier_ids = list(courier_map.keys())
    couriers_data = await db.couriers.find(
        {"id": {"$in": courier_ids}},
        {"_id": 0, "id": 1, "name": 1, "phone": 1}
    ).to_list(100)
    courier_info = {c["id"]: c for c in couriers_data}
    
    # Sonuçları oluştur
    result = []
    for cid, totals in courier_map.items():
        collected = collection_map.get(cid, {"cash_collected": 0, "card_collected": 0})
        
        cash_balance = round(totals["cash_total"] - collected["cash_collected"], 2)
        card_balance = round(totals["card_total"] - collected["card_collected"], 2)
        
        info = courier_info.get(cid, {})
        
        result.append({
            "courier_id": cid,
            "courier_name": info.get("name", "Bilinmeyen Kurye"),
            "courier_phone": info.get("phone", ""),
            "order_count": totals["order_count"],
            "cash_total": round(totals["cash_total"], 2),
            "card_total": round(totals["card_total"], 2),
            "cash_collected": round(collected["cash_collected"], 2),
            "card_collected": round(collected["card_collected"], 2),
            "cash_balance": max(cash_balance, 0),
            "card_balance": max(card_balance, 0),
            "is_completed": cash_balance <= 0 and card_balance <= 0
        })
    
    # Bakiyesi olanlar önce, tamamlananlar sona
    result.sort(key=lambda x: (x["is_completed"], -x["cash_balance"] - x["card_balance"]))
    
    return {
        "couriers": result,
        "date": date,
        "cash_by_restaurant": cash_by_restaurant,
        "card_by_restaurant": card_by_restaurant
    }


@router.post("/{restaurant_id}/collect")
async def collect_from_courier(restaurant_id: str, data: CollectionRequest, user=Depends(require_auth)):
    """Kuryeden tahsilat kaydet"""
    if data.amount <= 0:
        raise HTTPException(status_code=400, detail="Tutar 0'dan büyük olmalıdır")
    
    if data.payment_type not in ("cash", "card"):
        raise HTTPException(status_code=400, detail="Geçersiz ödeme tipi")
    
    # Restoran kontrolü
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0, "id": 1, "name": 1, "collection_settings": 1}
    )
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    # Kurye kontrolü
    courier = await db.couriers.find_one(
        {"id": data.courier_id},
        {"_id": 0, "id": 1, "name": 1}
    )
    if not courier:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")
    
    now = get_turkey_now()
    
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
    
    collection_record = {
        "id": str(uuid.uuid4()),
        "restaurant_id": restaurant_id,
        "restaurant_name": restaurant.get("name", ""),
        "courier_id": data.courier_id,
        "courier_name": courier.get("name", ""),
        "amount": round(data.amount, 2),
        "payment_type": data.payment_type,
        "date": data.date,
        "created_at": now,
        "created_by": created_by
    }
    
    await db.restaurant_courier_collections.insert_one(collection_record)
    
    logger.info(f"Restoran tahsilat: {restaurant.get('name')} <- {courier.get('name')}: {data.amount} TL ({data.payment_type}), tarih={data.date}")
    
    return {
        "success": True,
        "message": f"{courier.get('name')} kuryesinden {data.amount:.2f} TL {('nakit' if data.payment_type == 'cash' else 'kart')} tahsilat kaydedildi"
    }


@router.get("/{restaurant_id}/week-status")
async def get_week_status(restaurant_id: str, week_start: str, user=Depends(require_auth)):
    """
    Haftanın her günü için tahsilat durumunu döndür.
    Tüm kuryelerin bakiyesi 0 ise o gün tamamlanmış sayılır.
    """
    start = datetime.strptime(week_start, "%Y-%m-%d")
    
    result = []
    for i in range(7):
        day = start + timedelta(days=i)
        day_str = day.strftime("%Y-%m-%d")
        
        # O gün için bakiye hesapla
        balances = await get_courier_balances(restaurant_id, day_str, user)
        couriers = balances.get("couriers", [])
        
        has_orders = len(couriers) > 0
        all_completed = has_orders and all(c["is_completed"] for c in couriers)
        total_balance = sum(c["cash_balance"] + c["card_balance"] for c in couriers)
        
        result.append({
            "date": day_str,
            "day_name": ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"][day.weekday()],
            "has_orders": has_orders,
            "all_completed": all_completed,
            "total_balance": round(total_balance, 2),
            "courier_count": len(couriers)
        })
    
    return {"days": result, "week_start": week_start}
