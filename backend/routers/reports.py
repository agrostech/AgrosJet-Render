"""
Raporlar API Router
- Kurye raporları
- Restoran raporları
"""
from fastapi import APIRouter, Query
from typing import Optional
from utils.database import db

router = APIRouter(prefix="/api/reports", tags=["Reports"])


@router.get("/courier")
async def get_courier_report(
    company_id: str = Query(...),
    start_datetime: str = Query(...),
    end_datetime: str = Query(...),
    courier_id: Optional[str] = Query(None)
):
    """Kurye bazlı sipariş raporu"""
    # Tarih formatını düzelt (datetime-local'dan gelen format: 2026-02-15T09:00)
    # Veritabanındaki format: 2026-02-15T22:19:23.997
    # Karşılaştırma için :00 ekle
    if len(start_datetime) == 16:  # 2026-02-15T09:00
        start_datetime = start_datetime + ":00"
    if len(end_datetime) == 16:
        end_datetime = end_datetime + ":59"
    
    # Temel filtre
    match_filter = {
        "company_id": company_id,
        "status": "delivered",
        "created_at": {
            "$gte": start_datetime,
            "$lte": end_datetime
        }
    }
    
    # Kurye filtresi varsa ekle
    if courier_id:
        match_filter["courier_id"] = courier_id
    
    # Kurye bazlı aggregation
    pipeline = [
        {"$match": match_filter},
        {
            "$group": {
                "_id": "$courier_id",
                "courier_name": {"$first": "$courier_name"},
                "orderCount": {"$sum": 1},
                "earnings": {"$sum": {"$ifNull": ["$courier_fee", 0]}},
                "cash": {
                    "$sum": {
                        "$cond": [
                            {"$eq": ["$payment_method", "cash"]},
                            {"$ifNull": ["$total_amount", 0]},
                            0
                        ]
                    }
                },
                "card": {
                    "$sum": {
                        "$cond": [
                            {"$eq": ["$payment_method", "card"]},
                            {"$ifNull": ["$total_amount", 0]},
                            0
                        ]
                    }
                }
            }
        },
        {"$sort": {"courier_name": 1}}  # Alfabetik sıralama
    ]
    
    results = await db.orders.aggregate(pipeline).to_list(100)
    
    # Toplam hesapla
    total_orders = sum(r["orderCount"] for r in results)
    total_earnings = sum(r["earnings"] for r in results)
    total_cash = sum(r["cash"] for r in results)
    total_card = sum(r["card"] for r in results)
    
    # Kurye listesi
    couriers = []
    for r in results:
        courier_name = r["courier_name"]
        if r["_id"] is None:
            courier_name = "Kurye Atanmamış"
        couriers.append({
            "id": r["_id"],
            "name": courier_name or "Bilinmiyor",
            "orderCount": r["orderCount"],
            "earnings": r["earnings"],
            "cash": r["cash"],
            "card": r["card"]
        })
    
    # Alfabetik sırala (None olanları sona at)
    couriers.sort(key=lambda x: (x["name"] == "Kurye Atanmamış", x["name"].lower()))
    
    return {
        "summary": {
            "totalOrders": total_orders,
            "totalEarnings": total_earnings,
            "totalCash": total_cash,
            "totalCard": total_card
        },
        "couriers": couriers
    }


@router.get("/restaurant")
async def get_restaurant_report(
    company_id: str = Query(...),
    start_datetime: str = Query(...),
    end_datetime: str = Query(...),
    restaurant_id: Optional[str] = Query(None)
):
    """Restoran bazlı sipariş raporu"""
    # Tarih formatını düzelt
    if len(start_datetime) == 16:
        start_datetime = start_datetime + ":00"
    if len(end_datetime) == 16:
        end_datetime = end_datetime + ":59"
    
    # Temel filtre
    match_filter = {
        "company_id": company_id,
        "status": "delivered",
        "created_at": {
            "$gte": start_datetime,
            "$lte": end_datetime
        }
    }
    
    # Restoran filtresi varsa ekle
    if restaurant_id:
        match_filter["restaurant_id"] = restaurant_id
    
    # Restoran bazlı aggregation
    pipeline = [
        {"$match": match_filter},
        {
            "$group": {
                "_id": "$restaurant_id",
                "restaurant_name": {"$first": "$restaurant_name"},
                "orderCount": {"$sum": 1},
                "transportFee": {"$sum": {"$ifNull": ["$restaurant_fee", 0]}},
                "transportKdv": {"$sum": {"$ifNull": ["$restaurant_kdv", 0]}},
                "posCommission": {"$sum": {"$ifNull": ["$pos_commission", 0]}},
                "cash": {
                    "$sum": {
                        "$cond": [
                            {"$eq": ["$payment_method", "cash"]},
                            {"$ifNull": ["$total_amount", 0]},
                            0
                        ]
                    }
                },
                "card": {
                    "$sum": {
                        "$cond": [
                            {"$eq": ["$payment_method", "card"]},
                            {"$ifNull": ["$total_amount", 0]},
                            0
                        ]
                    }
                }
            }
        },
        {"$sort": {"restaurant_name": 1}}  # Alfabetik sıralama
    ]
    
    results = await db.orders.aggregate(pipeline).to_list(100)
    
    # Toplam hesapla
    total_orders = sum(r["orderCount"] for r in results)
    total_transport_fee = sum(r["transportFee"] for r in results)
    total_transport_kdv = sum(r["transportKdv"] for r in results)
    total_pos_commission = sum(r["posCommission"] for r in results)
    total_cash = sum(r["cash"] for r in results)
    total_card = sum(r["card"] for r in results)
    
    # Restoran listesi
    restaurants = []
    for r in results:
        restaurants.append({
            "id": r["_id"],
            "name": r["restaurant_name"] or "Bilinmiyor",
            "orderCount": r["orderCount"],
            "transportFee": r["transportFee"],
            "transportKdv": r["transportKdv"],
            "posCommission": r["posCommission"],
            "cash": r["cash"],
            "card": r["card"]
        })
    
    # Alfabetik sırala
    restaurants.sort(key=lambda x: x["name"].lower())
    
    # Sonuç hesapla: (Toplam Taşıma Ücreti + POS Komisyonu) - (Nakit + Kredi Kartı)
    total_transport = total_transport_fee + total_transport_kdv
    result = (total_transport + total_pos_commission) - (total_cash + total_card)
    
    return {
        "summary": {
            "totalOrders": total_orders,
            "totalTransportFee": total_transport_fee,
            "totalTransportKdv": total_transport_kdv,
            "totalTransport": total_transport,
            "totalPosCommission": total_pos_commission,
            "totalCash": total_cash,
            "totalCard": total_card,
            "result": result
        },
        "restaurants": restaurants
    }


@router.get("/courier/payments")
async def get_courier_payment_report(
    courier_id: str = Query(...),
    start_datetime: str = Query(None),
    end_datetime: str = Query(None),
    start_date: str = Query(None),
    end_date: str = Query(None)
):
    """Kurye ödeme raporu - Nakit ve Kredi Kartı toplamları + sipariş listesi"""
    import math
    
    def calculate_distance(lat1, lon1, lat2, lon2):
        """Haversine formülü ile mesafe hesapla (km)"""
        if not all([lat1, lon1, lat2, lon2]):
            return None
        R = 6371  # Dünya yarıçapı (km)
        phi1 = math.radians(lat1)
        phi2 = math.radians(lat2)
        delta_phi = math.radians(lat2 - lat1)
        delta_lambda = math.radians(lon2 - lon1)
        a = math.sin(delta_phi/2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda/2)**2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
        return round(R * c, 1)
    
    # Tarih aralığı için filtre (datetime veya date formatını destekle)
    if start_datetime and end_datetime:
        start_dt = start_datetime.replace("T", " ") + ":00" if len(start_datetime) == 16 else start_datetime
        end_dt = end_datetime.replace("T", " ") + ":59" if len(end_datetime) == 16 else end_datetime
    else:
        start_dt = f"{start_date}T00:00:00" if start_date else None
        end_dt = f"{end_date}T23:59:59" if end_date else None
    
    if not start_dt or not end_dt:
        return {"cash_total": 0, "card_total": 0, "cash_orders": [], "card_orders": []}
    
    # Teslim edilmiş siparişleri al
    match_filter = {
        "courier_id": courier_id,
        "status": "delivered",
        "created_at": {
            "$gte": start_dt,
            "$lte": end_dt
        }
    }
    
    # Sipariş listesini al
    orders = await db.orders.find(
        match_filter,
        {
            "_id": 0,
            "order_no": 1,
            "order_number": 1,
            "restaurant_name": 1,
            "restaurant_location": 1,
            "customer_name": 1,
            "delivery_address": 1,
            "delivery_location": 1,
            "total_amount": 1,
            "payment_method": 1,
            "created_at": 1
        }
    ).sort("created_at", -1).to_list(500)
    
    # Nakit ve kart siparişlerini ayır
    cash_orders = []
    card_orders = []
    cash_total = 0
    card_total = 0
    
    for order in orders:
        # Mesafe hesapla
        distance = None
        rest_loc = order.get("restaurant_location", {})
        del_loc = order.get("delivery_location", {})
        if rest_loc and del_loc:
            distance = calculate_distance(
                rest_loc.get("latitude"), rest_loc.get("longitude"),
                del_loc.get("latitude"), del_loc.get("longitude")
            )
        
        order_data = {
            "order_no": order.get("order_number") or order.get("order_no", "-"),
            "restaurant": order.get("restaurant_name", "-"),
            "customer": order.get("customer_name", "-"),
            "address": order.get("delivery_address", "-"),
            "distance_km": distance,
            "amount": order.get("total_amount", 0),
            "date": order.get("created_at", "")[:16].replace("T", " ") if order.get("created_at") else ""
        }
        if order.get("payment_method") == "cash":
            cash_orders.append(order_data)
            cash_total += order.get("total_amount", 0) or 0
        elif order.get("payment_method") == "card":
            card_orders.append(order_data)
            card_total += order.get("total_amount", 0) or 0
    
    return {
        "cash_total": cash_total,
        "card_total": card_total,
        "cash_orders": cash_orders,
        "card_orders": card_orders
    }


@router.get("/courier/earnings")
async def get_courier_earnings_report(
    courier_id: str = Query(...),
    start_datetime: str = Query(None),
    end_datetime: str = Query(None),
    start_date: str = Query(None),
    end_date: str = Query(None)
):
    """Kurye kazanç raporu - Paket sayısı, hakediş toplamı + sipariş listesi"""
    import math
    
    def calculate_distance(lat1, lon1, lat2, lon2):
        """Haversine formülü ile mesafe hesapla (km)"""
        if not all([lat1, lon1, lat2, lon2]):
            return None
        R = 6371
        phi1 = math.radians(lat1)
        phi2 = math.radians(lat2)
        delta_phi = math.radians(lat2 - lat1)
        delta_lambda = math.radians(lon2 - lon1)
        a = math.sin(delta_phi/2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda/2)**2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
        return round(R * c, 1)
    
    # Tarih aralığı için filtre (datetime veya date formatını destekle)
    if start_datetime and end_datetime:
        start_dt = start_datetime.replace("T", " ") + ":00" if len(start_datetime) == 16 else start_datetime
        end_dt = end_datetime.replace("T", " ") + ":59" if len(end_datetime) == 16 else end_datetime
    else:
        start_dt = f"{start_date}T00:00:00" if start_date else None
        end_dt = f"{end_date}T23:59:59" if end_date else None
    
    if not start_dt or not end_dt:
        return {"package_count": 0, "total_earnings": 0, "orders": []}
    
    # Teslim edilmiş siparişleri al (kazanç detaylarıyla)
    orders = await db.orders.find(
        {
            "courier_id": courier_id,
            "status": "delivered",
            "created_at": {
                "$gte": start_dt,
                "$lte": end_dt
            }
        },
        {
            "_id": 0,
            "order_no": 1,
            "order_number": 1,
            "restaurant_name": 1,
            "restaurant_location": 1,
            "customer_name": 1,
            "delivery_address": 1,
            "delivery_location": 1,
            "courier_fee": 1,
            "total_amount": 1,
            "payment_method": 1,
            "created_at": 1
        }
    ).sort("created_at", -1).to_list(500)
    
    # Sipariş listesini oluştur
    order_list = []
    total_courier_fee = 0
    
    for order in orders:
        courier_fee = order.get("courier_fee", 0) or 0
        total_courier_fee += courier_fee
        
        # Mesafe hesapla
        distance = None
        rest_loc = order.get("restaurant_location", {})
        del_loc = order.get("delivery_location", {})
        if rest_loc and del_loc:
            distance = calculate_distance(
                rest_loc.get("latitude"), rest_loc.get("longitude"),
                del_loc.get("latitude"), del_loc.get("longitude")
            )
        
        order_list.append({
            "order_no": order.get("order_number") or order.get("order_no", "-"),
            "restaurant": order.get("restaurant_name", "-"),
            "customer": order.get("customer_name", "-"),
            "address": order.get("delivery_address", "-"),
            "distance_km": distance,
            "total_amount": order.get("total_amount", 0),
            "courier_fee": courier_fee,
            "payment_method": order.get("payment_method", "-"),
            "date": order.get("created_at", "")[:16].replace("T", " ") if order.get("created_at") else ""
        })
    
    return {
        "package_count": len(orders),
        "total_earnings": total_courier_fee,
        "orders": order_list
    }

