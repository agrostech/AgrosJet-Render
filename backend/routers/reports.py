"""
Raporlar API Router
- Kurye raporları
- Restoran raporları
"""
from fastapi import APIRouter, Query, HTTPException
from typing import Optional
from datetime import datetime, timezone, timedelta
from utils.database import db
from utils.helpers import get_turkey_now, ensure_turkey_timezone, TURKEY_TZ

router = APIRouter(prefix="/api/reports", tags=["Reports"])


@router.get("/courier")
async def get_courier_report(
    company_id: str = Query(...),
    start_datetime: str = Query(...),
    end_datetime: str = Query(...),
    courier_id: Optional[str] = Query(None)
):
    """Kurye bazlı sipariş raporu - parçalı ödeme ve saatlik kazanç desteği ile"""
    from datetime import datetime, timezone, timedelta
    
    # Tarih formatını düzelt - Türkiye timezone (+03:00) ekle
    if len(start_datetime) == 16:
        start_datetime = start_datetime + ":00+03:00"
    elif "+03:00" not in start_datetime and "+00:00" not in start_datetime:
        start_datetime = start_datetime + "+03:00"
    
    if len(end_datetime) == 16:
        end_datetime = end_datetime + ":59+03:00"
    elif "+03:00" not in end_datetime and "+00:00" not in end_datetime:
        end_datetime = end_datetime + "+03:00"
    
    # Tarih string'lerini date formatına çevir (log sorgusu için)
    try:
        start_dt = datetime.fromisoformat(start_datetime.replace('Z', '+00:00'))
        end_dt = datetime.fromisoformat(end_datetime.replace('Z', '+00:00'))
        start_date = start_dt.strftime("%Y-%m-%d")
        end_date = end_dt.strftime("%Y-%m-%d")
    except (ValueError, TypeError):
        start_date = start_datetime[:10]
        end_date = end_datetime[:10]
    
    # Şirkete ait restoranların meal_card ayarlarını kontrol et
    # Eğer herhangi bir restoranda meal_card_collection == "courier" ise yemek kartı gösterilecek
    restaurants_with_meal_card = await db.restaurants.find(
        {
            "company_id": company_id,
            "is_archived": {"$ne": True}
        },
        {"_id": 0, "id": 1, "collection_settings": 1}
    ).to_list(500)
    
    has_meal_card_collection = any(
        r.get("collection_settings", {}).get("meal_card_collection") == "courier"
        for r in restaurants_with_meal_card
    )
    
    # Temel filtre - delivered_at ile (teslim tarihi)
    match_filter = {
        "company_id": company_id,
        "status": "delivered",
        "delivered_at": {
            "$gte": start_datetime,
            "$lte": end_datetime
        }
    }
    
    if courier_id:
        match_filter["courier_id"] = courier_id
    
    # Siparişleri getir
    orders = await db.orders.find(
        match_filter,
        {
            "_id": 0,
            "courier_id": 1,
            "courier_name": 1,
            "courier_fee": 1,
            "total_amount": 1,
            "payment_method": 1,
            "payment_details": 1
        }
    ).to_list(5000)
    
    # Şirketteki kuryelerin hourly_rate bilgilerini al
    courier_ids = list(set(o.get("courier_id") for o in orders if o.get("courier_id")))
    couriers_info = {}
    if courier_ids:
        couriers_cursor = db.couriers.find(
            {"id": {"$in": courier_ids}},
            {"_id": 0, "id": 1, "hourly_rate": 1, "availability_status": 1, "last_active_at": 1}
        )
        async for c in couriers_cursor:
            couriers_info[c["id"]] = {
                "hourly_rate": c.get("hourly_rate") or 0,
                "availability_status": c.get("availability_status"),
                "last_active_at": c.get("last_active_at")
            }
    
    # Aktif süreleri courier_daily_active tablosundan al
    # Türkiye saatine göre bugün
    turkey_tz = timezone(timedelta(hours=3))
    now_turkey = datetime.now(turkey_tz)
    now_utc = datetime.now(TURKEY_TZ)
    today = now_turkey.strftime("%Y-%m-%d")
    
    active_hours_map = {}
    if courier_ids:
        active_pipeline = [
            {
                "$match": {
                    "courier_id": {"$in": courier_ids},
                    "date": {"$gte": start_date, "$lte": end_date}
                }
            },
            {
                "$group": {
                    "_id": "$courier_id",
                    "total_active_minutes": {"$sum": "$active_minutes"}
                }
            }
        ]
        active_results = await db.courier_daily_active.aggregate(active_pipeline).to_list(1000)
        active_hours_map = {r["_id"]: r["total_active_minutes"] for r in active_results}
        
        # Şu an aktif kuryeler için anlık süre ekle
        if start_date <= today <= end_date:
            for cid, info in couriers_info.items():
                if info.get("availability_status") == "active" and info.get("last_active_at"):
                    try:
                        last_active = datetime.fromisoformat(info["last_active_at"].replace('Z', '+00:00'))
                        current_minutes = int((now_utc - last_active).total_seconds() / 60)
                        active_hours_map[cid] = active_hours_map.get(cid, 0) + current_minutes
                    except (ValueError, TypeError):
                        pass
    
    # Kurye bazlı hesaplama
    courier_data = {}
    
    for order in orders:
        cid = order.get("courier_id")
        if cid not in courier_data:
            info = couriers_info.get(cid, {})
            hourly_rate = info.get("hourly_rate", 0) if isinstance(info, dict) else info
            active_minutes = active_hours_map.get(cid, 0)
            active_hours = round(active_minutes / 60, 2)
            hourly_earnings = round(active_hours * hourly_rate, 2)
            
            courier_data[cid] = {
                "id": cid,
                "name": order.get("courier_name") or "Bilinmiyor",
                "orderCount": 0,
                "earnings": 0,
                "cash": 0,
                "card": 0,
                "meal_card": 0,
                "modified_count": 0,
                "active_hours": active_hours,
                "hourly_rate": hourly_rate,
                "hourly_earnings": hourly_earnings
            }
        
        c = courier_data[cid]
        c["orderCount"] += 1
        c["earnings"] += order.get("courier_fee", 0) or 0
        
        payment_method = order.get("payment_method", "")
        payment_details = order.get("payment_details", {})
        total_amount = order.get("total_amount", 0) or 0
        
        # Parçalı ödeme kontrolü
        if payment_method == "mixed" or (payment_details.get("cash_amount", 0) > 0 and payment_details.get("card_amount", 0) > 0):
            c["cash"] += payment_details.get("cash_amount", 0) or 0
            c["card"] += payment_details.get("card_amount", 0) or 0
            c["meal_card"] += payment_details.get("meal_card_amount", 0) or 0
            if payment_details.get("original_method"):
                c["modified_count"] += 1
        elif payment_method == "cash":
            c["cash"] += total_amount
            if payment_details.get("original_method"):
                c["modified_count"] += 1
        elif payment_method == "card":
            c["card"] += total_amount
            if payment_details.get("original_method"):
                c["modified_count"] += 1
        elif payment_method == "meal_card" or "yemek" in payment_method.lower():
            c["meal_card"] += total_amount
            if payment_details.get("original_method"):
                c["modified_count"] += 1
    
    # Toplam hakediş hesapla (paket + saatlik)
    for c in courier_data.values():
        c["total_earnings"] = round(c["earnings"] + c["hourly_earnings"], 2)
    
    # Kurye atanmamış olanları işaretle
    if None in courier_data:
        courier_data[None]["name"] = "Kurye Atanmamış"
    
    # Listeye çevir ve sırala
    couriers = list(courier_data.values())
    couriers.sort(key=lambda x: (x["name"] == "Kurye Atanmamış", x["name"].lower()))
    
    # Toplamlar
    total_orders = sum(c["orderCount"] for c in couriers)
    total_earnings = sum(c["earnings"] for c in couriers)
    total_cash = sum(c["cash"] for c in couriers)
    total_card = sum(c["card"] for c in couriers)
    total_meal_card = sum(c["meal_card"] for c in couriers)
    total_modified = sum(c["modified_count"] for c in couriers)
    total_hourly_earnings = sum(c["hourly_earnings"] for c in couriers)
    total_combined = sum(c["total_earnings"] for c in couriers)
    total_active_hours = sum(c["active_hours"] for c in couriers)
    
    return {
        "summary": {
            "totalOrders": total_orders,
            "totalEarnings": total_earnings,
            "totalCash": total_cash,
            "totalCard": total_card,
            "totalMealCard": total_meal_card,
            "totalModified": total_modified,
            "totalHourlyEarnings": total_hourly_earnings,
            "totalCombined": total_combined,
            "totalActiveHours": total_active_hours
        },
        "couriers": couriers,
        "hasMealCardCollection": has_meal_card_collection
    }


@router.get("/restaurant")
async def get_restaurant_report(
    company_id: str = Query(...),
    start_datetime: str = Query(...),
    end_datetime: str = Query(...),
    restaurant_id: Optional[str] = Query(None)
):
    """Restoran bazlı sipariş raporu - parçalı ödeme ve tahsilat ayarları desteği ile"""
    import math
    
    # Mesafe hesaplama fonksiyonu
    def calculate_distance(loc1, loc2):
        if not loc1 or not loc2:
            return 0.0
        lat1 = loc1.get("latitude") or loc1.get("lat") or 0
        lng1 = loc1.get("longitude") or loc1.get("lng") or 0
        lat2 = loc2.get("latitude") or loc2.get("lat") or 0
        lng2 = loc2.get("longitude") or loc2.get("lng") or 0
        if not all([lat1, lng1, lat2, lng2]):
            return 0.0
        R = 6371
        dLat = math.radians(lat2 - lat1)
        dLon = math.radians(lng2 - lng1)
        a = math.sin(dLat/2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dLon/2) ** 2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
        return R * c
    
    # Ücret hesaplama fonksiyonu
    def calculate_fee_from_pricing(pricing_type, per_package_price, km_ranges, distance_km):
        if pricing_type == "per_package":
            return per_package_price or 0.0
        elif pricing_type == "per_km" and km_ranges:
            for km_range in km_ranges:
                min_km = km_range.get("min_km", 0)
                max_km = km_range.get("max_km")
                price = km_range.get("price", 0)
                if max_km is None:
                    if distance_km >= min_km:
                        return price
                else:
                    if min_km <= distance_km < max_km:
                        return price
        return 0.0
    
    # Tarih formatını düzelt
    if len(start_datetime) == 16:
        start_datetime = start_datetime + ":00"
    if len(end_datetime) == 16:
        end_datetime = end_datetime + ":59"
    
    # Türkiye saati olarak filtrele (DB'de Türkiye saati kaydediliyor)
    turkey_tz = timezone(timedelta(hours=3))
    try:
        # Önce datetime'a çevir
        start_dt = datetime.fromisoformat(start_datetime.replace('Z', '+00:00'))
        end_dt = datetime.fromisoformat(end_datetime.replace('Z', '+00:00'))
        
        # Eğer timezone bilgisi yoksa, Türkiye saati olarak kabul et
        if start_dt.tzinfo is None:
            start_dt = start_dt.replace(tzinfo=turkey_tz)
        if end_dt.tzinfo is None:
            end_dt = end_dt.replace(tzinfo=turkey_tz)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Tarih formatı hatalı: {str(e)}")
    
    # Restoranların tahsilat ve pricing ayarlarını çek
    restaurants_cursor = db.restaurants.find(
        {"company_id": company_id, "is_archived": {"$ne": True}},
        {"_id": 0, "id": 1, "name": 1, "collection_settings": 1, "pricing_type": 1, "per_package_price": 1, "km_ranges": 1, "kdv_rate": 1}
    )
    restaurant_settings = {}
    async for r in restaurants_cursor:
        settings = r.get("collection_settings", {})
        restaurant_settings[r["id"]] = {
            "name": r.get("name", "Bilinmiyor"),
            "cash_included": settings.get("cash_collection", "courier") == "courier",
            "card_included": settings.get("card_collection", "courier") == "courier",
            "meal_card_included": settings.get("meal_card_collection", "courier") == "courier",
            "pricing_type": r.get("pricing_type", "per_package"),
            "per_package_price": r.get("per_package_price", 0),
            "km_ranges": r.get("km_ranges", []),
            "kdv_rate": r.get("kdv_rate", 10)
        }
    
    # Temel filtre (restoran teslimatı hariç) - tarih filtresi Python'da yapılacak
    match_filter = {
        "company_id": company_id,
        "status": "delivered",
        "is_restaurant_delivery": {"$ne": True}
    }
    
    # Restoran filtresi varsa ekle
    if restaurant_id:
        match_filter["restaurant_id"] = restaurant_id
    
    # Siparişleri getir (tarih filtresi olmadan)
    all_orders = await db.orders.find(
        match_filter,
        {
            "_id": 0,
            "restaurant_id": 1,
            "restaurant_name": 1,
            "restaurant_fee": 1,
            "restaurant_kdv": 1,
            "pos_commission": 1,
            "total_amount": 1,
            "payment_method": 1,
            "payment_details": 1,
            "restaurant_location": 1,
            "delivery_location": 1,
            "delivered_at": 1
        }
    ).to_list(10000)
    
    # Python'da tarih filtrelemesi yap
    orders = []
    for order in all_orders:
        delivered_at = order.get("delivered_at")
        if not delivered_at:
            continue
        
        try:
            # String'i datetime'a çevir
            if isinstance(delivered_at, str):
                order_dt = datetime.fromisoformat(delivered_at.replace('Z', '+00:00'))
            else:
                order_dt = delivered_at
            
            # Türkiye saati olarak kabul et (eğer timezone yoksa)
            if order_dt.tzinfo is None:
                order_dt = order_dt.replace(tzinfo=turkey_tz)
            
            # Tarih aralığında mı kontrol et
            if start_dt <= order_dt <= end_dt:
                orders.append(order)
        except:
            continue  # Parse edilemeyen siparişleri atla
    
    # Restoran bazlı hesaplama
    restaurant_data = {}
    
    for order in orders:
        rid = order.get("restaurant_id")
        settings = restaurant_settings.get(rid, {
            "name": order.get("restaurant_name") or "Bilinmiyor", 
            "cash_included": True, 
            "card_included": True,
            "meal_card_included": True,
            "pricing_type": "per_package",
            "per_package_price": 0,
            "km_ranges": [],
            "kdv_rate": 10
        })
        
        if rid not in restaurant_data:
            restaurant_data[rid] = {
                "id": rid,
                "name": settings["name"],
                "orderCount": 0,
                "transportFee": 0,
                "transportKdv": 0,
                "posCommission": 0,
                "cash": 0,
                "card": 0,
                "online": 0,
                "mealCard": 0,
                "modified_count": 0,
                "cash_included": settings["cash_included"],
                "card_included": settings["card_included"],
                "meal_card_included": settings["meal_card_included"]
            }
        
        r = restaurant_data[rid]
        r["orderCount"] += 1
        
        # Taşıma ücreti - önce siparişte kayıtlı değere bak
        order_fee = order.get("restaurant_fee") or 0
        order_kdv = order.get("restaurant_kdv") or 0
        
        # Eğer siparişte ücret yoksa, restoran ayarlarından hesapla
        if order_fee == 0 and (settings.get("per_package_price", 0) > 0 or settings.get("km_ranges")):
            distance_km = calculate_distance(
                order.get("restaurant_location"),
                order.get("delivery_location")
            )
            order_fee = calculate_fee_from_pricing(
                settings.get("pricing_type", "per_package"),
                settings.get("per_package_price", 0),
                settings.get("km_ranges", []),
                distance_km
            )
            # KDV hesapla
            kdv_rate = settings.get("kdv_rate", 10)
            order_kdv = order_fee * (kdv_rate / 100)
        
        r["transportFee"] += order_fee
        r["transportKdv"] += order_kdv
        r["posCommission"] += order.get("pos_commission", 0) or 0
        
        payment_method = (order.get("payment_method") or "").lower()
        payment_details = order.get("payment_details") or {}
        total_amount = order.get("total_amount", 0) or 0
        
        # Parçalı ödeme kontrolü
        cash_amt = payment_details.get("cash_amount", 0) or 0
        card_amt = payment_details.get("card_amount", 0) or 0
        
        if payment_method == "mixed" or (cash_amt > 0 and card_amt > 0):
            r["cash"] += cash_amt
            r["card"] += card_amt
            if payment_details.get("original_method") or payment_details.get("original_payment_method"):
                r["modified_count"] += 1
        elif "meal_card" in payment_method or "yemek" in payment_method:
            # Yemek kartı ödemeleri
            r["mealCard"] += total_amount
            if payment_details.get("original_method") or payment_details.get("original_payment_method"):
                r["modified_count"] += 1
        elif "cash" in payment_method or "nakit" in payment_method:
            r["cash"] += total_amount
            if payment_details.get("original_method") or payment_details.get("original_payment_method"):
                r["modified_count"] += 1
        elif payment_method == "online":
            r["online"] += total_amount
            if payment_details.get("original_method") or payment_details.get("original_payment_method"):
                r["modified_count"] += 1
        elif "card" in payment_method or "kart" in payment_method:
            r["card"] += total_amount
            if payment_details.get("original_method") or payment_details.get("original_payment_method"):
                r["modified_count"] += 1
    
    # Listeye çevir ve sırala
    restaurants = list(restaurant_data.values())
    restaurants.sort(key=lambda x: x["name"].lower())
    
    # Toplamlar - tahsilat ayarlarına göre
    total_orders = sum(r["orderCount"] for r in restaurants)
    total_transport_fee = sum(r["transportFee"] for r in restaurants)
    total_transport_kdv = sum(r["transportKdv"] for r in restaurants)
    total_pos_commission = sum(r["posCommission"] if r["card_included"] else 0 for r in restaurants)
    
    # Nakit, kart, online ve yemek kartı toplamları (sadece dahil edilenler)
    total_cash = sum(r["cash"] if r["cash_included"] else 0 for r in restaurants)
    total_card = sum(r["card"] if r["card_included"] else 0 for r in restaurants)
    total_online = sum(r["online"] for r in restaurants)
    total_meal_card = sum(r["mealCard"] if r["meal_card_included"] else 0 for r in restaurants)  # Kurye tahsilatlı
    total_meal_card_all = sum(r["mealCard"] for r in restaurants)  # Tüm yemek kartı toplamı
    total_modified = sum(r["modified_count"] for r in restaurants)
    
    # Sonuç hesapla (online dahil edilmiyor - restoran tahsil ediyor)
    total_transport = total_transport_fee + total_transport_kdv
    result = (total_transport + total_pos_commission) - (total_cash + total_card + total_meal_card)
    
    return {
        "summary": {
            "totalOrders": total_orders,
            "totalTransportFee": total_transport_fee,
            "totalTransportKdv": total_transport_kdv,
            "totalTransport": total_transport,
            "totalPosCommission": total_pos_commission,
            "totalCash": total_cash,
            "totalCard": total_card,
            "totalOnline": total_online,
            "totalMealCard": total_meal_card,
            "totalMealCardAll": total_meal_card_all,
            "totalModified": total_modified,
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
    # delivered_at ISO formatında saklanıyor: 2026-02-23T06:52:26.51
    if start_datetime and end_datetime:
        start_dt = start_datetime + ":00" if len(start_datetime) == 16 else start_datetime
        end_dt = end_datetime + ":59" if len(end_datetime) == 16 else end_datetime
    else:
        start_dt = f"{start_date}T00:00:00" if start_date else None
        end_dt = f"{end_date}T23:59:59" if end_date else None
    
    if not start_dt or not end_dt:
        return {"cash_total": 0, "card_total": 0, "cash_orders": [], "card_orders": []}
    
    # Teslim edilmiş siparişleri al - delivered_at ile (teslim tarihi)
    match_filter = {
        "courier_id": courier_id,
        "status": "delivered",
        "delivered_at": {
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
            "payment_details": 1,
            "created_at": 1
        }
    ).sort("created_at", -1).to_list(500)
    
    # Nakit, kart, yemek kartı ve online siparişlerini ayır
    cash_orders = []
    card_orders = []
    meal_card_orders = []
    online_orders = []
    cash_total = 0
    card_total = 0
    meal_card_total = 0
    online_total = 0
    
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
        
        base_order_data = {
            "order_no": order.get("order_number") or order.get("order_no", "-"),
            "restaurant": order.get("restaurant_name", "-"),
            "customer": order.get("customer_name", "-"),
            "address": order.get("delivery_address", "-"),
            "distance_km": distance,
            "date": order.get("created_at", "")[:16].replace("T", " ") if order.get("created_at") else ""
        }
        
        # Parçalı ödeme kontrolü
        payment_details = order.get("payment_details") or {}
        payment_method = order.get("payment_method", "")
        
        cash_amt = payment_details.get("cash_amount", 0) or 0
        card_amt = payment_details.get("card_amount", 0) or 0
        
        if payment_method == "mixed" or (cash_amt > 0 and card_amt > 0):
            # Parçalı ödeme - her iki listeye de ekle
            if cash_amt > 0:
                cash_order = {**base_order_data, "amount": cash_amt, "is_split": True}
                cash_orders.append(cash_order)
                cash_total += cash_amt
            
            if card_amt > 0:
                card_order = {**base_order_data, "amount": card_amt, "is_split": True}
                card_orders.append(card_order)
                card_total += card_amt
        elif payment_method == "cash":
            is_modified = payment_details.get("original_method") and payment_details.get("original_method") != "cash"
            order_data = {**base_order_data, "amount": order.get("total_amount", 0), "is_modified": is_modified}
            cash_orders.append(order_data)
            cash_total += order.get("total_amount", 0) or 0
        elif payment_method == "card":
            is_modified = payment_details.get("original_method") and payment_details.get("original_method") != "card"
            order_data = {**base_order_data, "amount": order.get("total_amount", 0), "is_modified": is_modified}
            card_orders.append(order_data)
            card_total += order.get("total_amount", 0) or 0
        elif payment_method == "meal_card":
            is_modified = payment_details.get("original_method") and payment_details.get("original_method") != "meal_card"
            order_data = {**base_order_data, "amount": order.get("total_amount", 0), "is_modified": is_modified}
            meal_card_orders.append(order_data)
            meal_card_total += order.get("total_amount", 0) or 0
        elif payment_method in ["online", "online_meal_card"]:
            is_modified = payment_details.get("original_method") and payment_details.get("original_method") not in ["online", "online_meal_card"]
            order_data = {**base_order_data, "amount": order.get("total_amount", 0), "is_modified": is_modified}
            online_orders.append(order_data)
            online_total += order.get("total_amount", 0) or 0
    
    return {
        "cash_total": cash_total,
        "card_total": card_total,
        "meal_card_total": meal_card_total,
        "online_total": online_total,
        "cash_orders": cash_orders,
        "card_orders": card_orders,
        "meal_card_orders": meal_card_orders,
        "online_orders": online_orders
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
    
    # Tarih aralığı için filtre - Türkiye timezone (+03:00) formatında
    # Frontend'den gelen tarihler zaten Türkiye saatinde
    if start_datetime and end_datetime:
        # +03:00 ekle
        start_dt = f"{start_datetime}:00+03:00" if len(start_datetime) == 16 else f"{start_datetime}+03:00"
        end_dt = f"{end_datetime}:59+03:00" if len(end_datetime) == 16 else f"{end_datetime}+03:00"
    elif start_date and end_date:
        start_dt = f"{start_date}T00:00:00+03:00"
        end_dt = f"{end_date}T23:59:59+03:00"
    else:
        return {"package_count": 0, "total_earnings": 0, "orders": []}
    
    # Teslim edilmiş siparişleri al - delivered_at ile (tüm tarihler +03:00 formatında)
    orders = await db.orders.find(
        {
            "courier_id": courier_id,
            "status": "delivered",
            "delivered_at": {
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
            "payment_details": 1,
            "created_at": 1,
            "status_history": 1,
            "delivered_at": 1
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
        
        # Teslimat süresini hesapla (on_the_way -> delivered arası)
        delivery_duration_minutes = 0
        status_history = order.get("status_history", [])
        delivered_at_str = order.get("delivered_at")
        
        if status_history and delivered_at_str:
            # on_the_way timestamp'ini bul
            on_the_way_time = None
            for entry in status_history:
                if entry.get("status") == "on_the_way" and entry.get("timestamp"):
                    on_the_way_time = entry.get("timestamp")
                    break
            
            if on_the_way_time:
                try:
                    otw_dt = datetime.fromisoformat(on_the_way_time.replace('Z', '+00:00'))
                    del_dt = datetime.fromisoformat(delivered_at_str.replace('Z', '+00:00'))
                    diff = (del_dt - otw_dt).total_seconds() / 60
                    if diff > 0:
                        delivery_duration_minutes = round(diff, 1)
                except:
                    pass
        
        payment_details = order.get("payment_details", {})
        order_list.append({
            "order_no": order.get("order_number") or order.get("order_no", "-"),
            "restaurant": order.get("restaurant_name", "-"),
            "customer": order.get("customer_name", "-"),
            "address": order.get("delivery_address", "-"),
            "distance_km": distance,
            "total_amount": order.get("total_amount", 0),
            "courier_fee": courier_fee,
            "payment_method": order.get("payment_method", "-"),
            "delivery_duration_minutes": delivery_duration_minutes,
            "payment_details": {
                "cash_amount": payment_details.get("cash_amount"),
                "card_amount": payment_details.get("card_amount"),
                "original_method": payment_details.get("original_method")
            } if payment_details else None,
            "date": order.get("created_at", "")[:16].replace("T", " ") if order.get("created_at") else ""
        })
    
    # Çalışma süresi hesapla - courier_daily_active tablosundan (performans raporuyla aynı)
    total_active_minutes = 0
    try:
        from datetime import datetime as dt
        
        # Tarih formatını çıkar (YYYY-MM-DD)
        start_date_str = start_dt[:10]
        end_date_str = end_dt[:10]
        
        # courier_daily_active tablosundan oku
        daily_records = await db.courier_daily_active.find(
            {
                "courier_id": courier_id,
                "date": {"$gte": start_date_str, "$lte": end_date_str}
            },
            {"_id": 0, "date": 1, "active_minutes": 1}
        ).to_list(100)
        
        total_active_minutes = sum(r.get("active_minutes", 0) for r in daily_records)
        
        # Admin-linked kurye ise, admin aktiflik süresini de ekle
        courier = await db.couriers.find_one(
            {"id": courier_id}, 
            {"_id": 0, "availability_status": 1, "last_active_at": 1, "is_admin_linked": 1, "hourly_rate": 1}
        )
        
        if courier and courier.get("is_admin_linked"):
            admin = await db.admins.find_one(
                {"linked_courier_id": courier_id},
                {"_id": 0, "id": 1}
            )
            if admin:
                admin_daily_records = await db.admin_daily_active.find(
                    {
                        "admin_id": admin["id"],
                        "date": {"$gte": start_date_str, "$lte": end_date_str}
                    },
                    {"_id": 0, "active_minutes": 1}
                ).to_list(100)
                total_active_minutes += sum(r.get("active_minutes", 0) for r in admin_daily_records)
        
        # Eğer bugün aralıkta ve kurye aktif ise, anlık süreyi ekle
        now = datetime.now(TURKEY_TZ)
        today = now.strftime("%Y-%m-%d")
        
        if start_date_str <= today <= end_date_str:
            if courier and courier.get("availability_status") == "active" and courier.get("last_active_at"):
                try:
                    last_active = dt.fromisoformat(courier["last_active_at"].replace('Z', '+00:00'))
                    current_active_minutes = int((now - last_active).total_seconds() / 60)
                    if current_active_minutes > 0:
                        total_active_minutes += current_active_minutes
                except (ValueError, TypeError):
                    pass
    except Exception as e:
        print(f"Çalışma süresi hesaplama hatası: {e}")
        courier = None
    
    # Kurye hourly_rate'i yoksa çek
    if not courier:
        courier = await db.couriers.find_one(
            {"id": courier_id}, 
            {"_id": 0, "hourly_rate": 1}
        )
    
    work_hours = int(total_active_minutes // 60)
    work_minutes = int(total_active_minutes % 60)
    
    # Saatlik hakediş = çalışma süresi * kurye hourly_rate
    hourly_rate = (courier.get("hourly_rate") or 0) if courier else 0
    total_work_hours = total_active_minutes / 60
    hourly_earnings = round(total_work_hours * hourly_rate, 2)
    
    return {
        "package_count": len(orders),
        "total_earnings": total_courier_fee,
        "work_hours": work_hours,
        "work_minutes": work_minutes,
        "hourly_rate": hourly_rate,
        "hourly_earnings": hourly_earnings,
        "orders": order_list
    }




@router.get("/restaurant/{restaurant_id}/performance")
async def get_restaurant_performance(
    restaurant_id: str,
    start_datetime: str = Query(...),
    end_datetime: str = Query(...)
):
    """Restoran performans raporu - teslimat süreleri ve ısı haritası"""
    turkey_tz = timezone(timedelta(hours=3))

    # Tarih formatını düzelt
    if len(start_datetime) == 16:
        start_datetime = start_datetime + ":00"
    if len(end_datetime) == 16:
        end_datetime = end_datetime + ":59"

    try:
        start_dt = datetime.fromisoformat(start_datetime.replace('Z', '+00:00'))
        end_dt = datetime.fromisoformat(end_datetime.replace('Z', '+00:00'))
        if start_dt.tzinfo is None:
            start_dt = start_dt.replace(tzinfo=turkey_tz)
        if end_dt.tzinfo is None:
            end_dt = end_dt.replace(tzinfo=turkey_tz)
    except Exception:
        return {"error": "Tarih formatı hatalı"}

    # Restoran bilgisini al (company_id lazım)
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0, "company_id": 1}
    )
    company_id = restaurant["company_id"] if restaurant else None

    # Company bilgisini al (harita merkezi için)
    company = None
    if company_id:
        company = await db.companies.find_one(
            {"id": company_id},
            {"_id": 0, "city_lat": 1, "city_lng": 1, "city": 1}
        )

    # Teslim edilmiş siparişleri getir
    all_orders = await db.orders.find(
        {
            "restaurant_id": restaurant_id,
            "status": "delivered",
            "is_restaurant_delivery": {"$ne": True}
        },
        {
            "_id": 0,
            "created_at": 1,
            "delivered_at": 1,
            "status_history": 1,
            "delivery_location": 1
        }
    ).to_list(10000)

    # Python'da tarih filtrelemesi
    orders = []
    for order in all_orders:
        delivered_at = order.get("delivered_at")
        if not delivered_at:
            continue
        try:
            if isinstance(delivered_at, str):
                order_dt = datetime.fromisoformat(delivered_at.replace('Z', '+00:00'))
            else:
                order_dt = delivered_at
            if order_dt.tzinfo is None:
                order_dt = order_dt.replace(tzinfo=turkey_tz)
            if start_dt <= order_dt <= end_dt:
                orders.append(order)
        except:
            continue

    total_orders = len(orders)
    prep_times = []
    delivery_times = []
    total_times = []
    heatmap_points = []
    daily_over_45 = {}

    for order in orders:
        created_at_str = order.get("created_at")
        delivered_at_str = order.get("delivered_at")
        status_history = order.get("status_history") or []

        created_dt = None
        delivered_dt = None
        on_the_way_dt = None

        # Parse created_at
        if created_at_str:
            try:
                created_dt = datetime.fromisoformat(str(created_at_str).replace('Z', '+00:00'))
                if created_dt.tzinfo is None:
                    created_dt = created_dt.replace(tzinfo=turkey_tz)
            except:
                pass

        # Parse delivered_at
        if delivered_at_str:
            try:
                delivered_dt = datetime.fromisoformat(str(delivered_at_str).replace('Z', '+00:00'))
                if delivered_dt.tzinfo is None:
                    delivered_dt = delivered_dt.replace(tzinfo=turkey_tz)
            except:
                pass

        # Parse on_the_way from status_history
        for entry in status_history:
            if entry.get("status") == "on_the_way" and entry.get("timestamp"):
                try:
                    on_the_way_dt = datetime.fromisoformat(str(entry["timestamp"]).replace('Z', '+00:00'))
                    if on_the_way_dt.tzinfo is None:
                        on_the_way_dt = on_the_way_dt.replace(tzinfo=turkey_tz)
                except:
                    pass
                break

        # Hazırlık süresi: created_at -> on_the_way
        if created_dt and on_the_way_dt:
            prep_min = (on_the_way_dt - created_dt).total_seconds() / 60
            if 0 < prep_min < 480:  # max 8 saat
                prep_times.append(prep_min)

        # Teslimat süresi: on_the_way -> delivered_at
        if on_the_way_dt and delivered_dt:
            del_min = (delivered_dt - on_the_way_dt).total_seconds() / 60
            if 0 < del_min < 480:
                delivery_times.append(del_min)

        # Toplam süre: created_at -> delivered_at
        if created_dt and delivered_dt:
            total_min = (delivered_dt - created_dt).total_seconds() / 60
            if 0 < total_min < 480:
                total_times.append(total_min)
                # Günlük 45dk üzeri sayısı
                if total_min > 45:
                    day_key = delivered_dt.strftime("%Y-%m-%d")
                    daily_over_45[day_key] = daily_over_45.get(day_key, 0) + 1

        # Harita noktaları
        loc = order.get("delivery_location") or {}
        lat = loc.get("latitude")
        lng = loc.get("longitude")
        if lat and lng:
            heatmap_points.append({"lat": lat, "lng": lng})

    # Süre aralıkları hesapla
    under_15 = sum(1 for t in total_times if t < 15)
    between_15_30 = sum(1 for t in total_times if 15 <= t < 30)
    between_30_45 = sum(1 for t in total_times if 30 <= t < 45)
    over_45 = sum(1 for t in total_times if t >= 45)

    # Günlük ortalama 45dk üzeri
    if daily_over_45:
        total_days_in_range = max((end_dt - start_dt).days, 1)
        daily_avg_over_45 = over_45 / total_days_in_range
    else:
        daily_avg_over_45 = 0

    show_over_45 = daily_avg_over_45 > 5

    avg_prep = round(sum(prep_times) / len(prep_times), 1) if prep_times else None
    avg_delivery = round(sum(delivery_times) / len(delivery_times), 1) if delivery_times else None

    return {
        "total_orders": total_orders,
        "avg_prep_minutes": avg_prep,
        "avg_delivery_minutes": avg_delivery,
        "calculable_orders": len(total_times),
        "under_15": under_15,
        "between_15_30": between_15_30,
        "between_30_45": between_30_45,
        "over_45": over_45,
        "show_over_45": show_over_45,
        "daily_avg_over_45": round(daily_avg_over_45, 1),
        "heatmap_points": heatmap_points,
        "map_center": {
            "lat": company.get("city_lat") if company else None,
            "lng": company.get("city_lng") if company else None,
            "city": company.get("city") if company else None
        }
    }


# ============ KAR / ZARAR RAPORU ============

@router.get("/profit-loss")
async def get_profit_loss_report(
    company_id: str = Query(...),
    start_datetime: str = Query(...),  # YYYY-MM-DDTHH:mm
    end_datetime: str = Query(...),    # YYYY-MM-DDTHH:mm
):
    """
    Kar/Zarar raporu
    Gelir: Tüm teslim edilmiş siparişlerin restaurant_fee toplamı
    Gider: Kurye hakedişleri + Yönetici hakedişleri
    """
    start_str = start_datetime.replace("T", "T") + ":00"
    end_str = end_datetime.replace("T", "T") + ":59"

    # --- Admin-kurye ayrımı: linked_courier_id'leri al ---
    admin_couriers = await db.admins.find(
        {"company_id": company_id, "linked_courier_id": {"$exists": True, "$ne": None}},
        {"_id": 0, "linked_courier_id": 1}
    ).to_list(500)
    admin_courier_ids = [a["linked_courier_id"] for a in admin_couriers]

    # --- Toplam gelir (tüm delivered siparişler) ---
    total_pipeline = [
        {
            "$match": {
                "company_id": company_id,
                "status": "delivered",
                "created_at": {"$gte": start_str, "$lte": end_str}
            }
        },
        {
            "$group": {
                "_id": None,
                "total_revenue": {"$sum": {"$ifNull": ["$restaurant_fee", 0]}},
                "order_count": {"$sum": 1}
            }
        }
    ]
    total_results = await db.orders.aggregate(total_pipeline).to_list(1)

    # --- Kurye siparişleri (admin olmayan) ---
    courier_orders_pipeline = [
        {
            "$match": {
                "company_id": company_id,
                "status": "delivered",
                "created_at": {"$gte": start_str, "$lte": end_str},
                "courier_id": {"$nin": admin_courier_ids}
            }
        },
        {
            "$group": {
                "_id": None,
                "total_fee": {"$sum": {"$ifNull": ["$courier_fee", 0]}},
                "count": {"$sum": 1}
            }
        }
    ]
    courier_orders_result = await db.orders.aggregate(courier_orders_pipeline).to_list(1)

    # --- Yönetici siparişleri (admin-kurye) ---
    admin_orders_pipeline = [
        {
            "$match": {
                "company_id": company_id,
                "status": "delivered",
                "created_at": {"$gte": start_str, "$lte": end_str},
                "courier_id": {"$in": admin_courier_ids}
            }
        },
        {
            "$group": {
                "_id": None,
                "total_fee": {"$sum": {"$ifNull": ["$courier_fee", 0]}},
                "count": {"$sum": 1}
            }
        }
    ]
    admin_orders_result = await db.orders.aggregate(admin_orders_pipeline).to_list(1)

    # --- Saatlik ücret: Tüm kuryeler, admin/kurye ayrımıyla ---
    all_couriers = await db.couriers.find(
        {"company_id": company_id},
        {"_id": 0, "id": 1, "hourly_rate": 1}
    ).to_list(500)

    courier_hourly_expense = 0
    admin_hourly_expense = 0
    for courier in all_couriers:
        rate = courier.get("hourly_rate", 0) or 0
        if rate <= 0:
            continue
        h_pipeline = [
            {
                "$match": {
                    "courier_id": courier["id"],
                    "company_id": company_id,
                    "old_status": "active",
                    "timestamp": {"$gte": start_str, "$lte": end_str},
                    "duration_minutes": {"$gt": 0}
                }
            },
            {
                "$group": {
                    "_id": None,
                    "total_minutes": {"$sum": "$duration_minutes"}
                }
            }
        ]
        h_result = await db.courier_status_logs.aggregate(h_pipeline).to_list(1)
        if h_result:
            hours = h_result[0]["total_minutes"] / 60
            cost = hours * rate
            if courier["id"] in admin_courier_ids:
                admin_hourly_expense += cost
            else:
                courier_hourly_expense += cost

    # Hesapla
    total_revenue = round(total_results[0]["total_revenue"], 2) if total_results else 0
    order_count = total_results[0]["order_count"] if total_results else 0

    courier_pkg_fee = round(courier_orders_result[0]["total_fee"], 2) if courier_orders_result else 0
    courier_order_count = courier_orders_result[0]["count"] if courier_orders_result else 0
    courier_expense = round(courier_pkg_fee + courier_hourly_expense, 2)

    admin_pkg_fee = round(admin_orders_result[0]["total_fee"], 2) if admin_orders_result else 0
    admin_order_count = admin_orders_result[0]["count"] if admin_orders_result else 0
    admin_expense = round(admin_pkg_fee + admin_hourly_expense, 2)

    total_expense = round(courier_expense + admin_expense, 2)
    profit = round(total_revenue - total_expense, 2)

    # Ortalamalar
    avg_revenue_per_order = round(total_revenue / order_count, 2) if order_count > 0 else 0
    avg_cost_per_order = round(total_expense / order_count, 2) if order_count > 0 else 0
    avg_profit_per_order = round(avg_revenue_per_order - avg_cost_per_order, 2)

    return {
        "total_revenue": total_revenue,
        "order_count": order_count,
        "courier_expense": courier_expense,
        "courier_order_count": courier_order_count,
        "admin_expense": admin_expense,
        "admin_order_count": admin_order_count,
        "total_expense": total_expense,
        "profit": profit,
        "avg_revenue_per_order": avg_revenue_per_order,
        "avg_cost_per_order": avg_cost_per_order,
        "avg_profit_per_order": avg_profit_per_order
    }


# ============ PERFORMANS RAPORU ============

@router.get("/performance")
async def get_performance_report(
    company_id: str = Query(...),
    start_datetime: str = Query(...),
    end_datetime: str = Query(...),
):
    """
    Performans raporu - Kurye ve Yönetici bazlı
    """
    start_str = start_datetime + ":00"
    end_str = end_datetime + ":59"

    # Admin-kurye ayrımı
    admin_docs = await db.admins.find(
        {"company_id": company_id, "linked_courier_id": {"$exists": True, "$ne": None}},
        {"_id": 0, "linked_courier_id": 1}
    ).to_list(500)
    admin_courier_ids = set(a["linked_courier_id"] for a in admin_docs)

    # Tüm kuryeler
    all_couriers = await db.couriers.find(
        {"company_id": company_id},
        {"_id": 0, "id": 1, "name": 1}
    ).to_list(500)

    results = []

    for courier in all_couriers:
        cid = courier["id"]
        is_admin = cid in admin_courier_ids

        # 1. Teslimat sayısı
        delivery_count = await db.orders.count_documents({
            "company_id": company_id,
            "status": "delivered",
            "courier_id": cid,
            "created_at": {"$gte": start_str, "$lte": end_str}
        })

        # 2. Ortalama teslimat süresi (status_history: assigned -> delivered)
        delivery_time_pipeline = [
            {
                "$match": {
                    "company_id": company_id,
                    "status": "delivered",
                    "courier_id": cid,
                    "created_at": {"$gte": start_str, "$lte": end_str}
                }
            },
            {"$unwind": "$status_history"},
            {
                "$group": {
                    "_id": "$id",
                    "first_ts": {"$min": "$status_history.timestamp"},
                    "last_ts": {"$max": "$status_history.timestamp"}
                }
            }
        ]
        time_results = await db.orders.aggregate(delivery_time_pipeline).to_list(1000)
        total_delivery_minutes = 0
        valid_delivery_count = 0
        for tr in time_results:
            try:
                first = datetime.fromisoformat(tr["first_ts"])
                last = datetime.fromisoformat(tr["last_ts"])
                diff = (last - first).total_seconds() / 60
                if 0 < diff < 600:  # 10 saatten kısa
                    total_delivery_minutes += diff
                    valid_delivery_count += 1
            except Exception:
                pass
        avg_delivery_minutes = round(total_delivery_minutes / valid_delivery_count, 1) if valid_delivery_count > 0 else 0

        # 3. Aktif çalışma saati
        active_pipeline = [
            {
                "$match": {
                    "courier_id": cid,
                    "company_id": company_id,
                    "old_status": "active",
                    "timestamp": {"$gte": start_str, "$lte": end_str},
                    "duration_minutes": {"$gt": 0}
                }
            },
            {"$group": {"_id": None, "total": {"$sum": "$duration_minutes"}}}
        ]
        active_result = await db.courier_status_logs.aggregate(active_pipeline).to_list(1)
        active_minutes = active_result[0]["total"] if active_result else 0
        active_hours = round(active_minutes / 60, 1)

        # 4. Saatlik teslimat ortalaması
        hourly_delivery_avg = round(delivery_count / active_hours, 1) if active_hours > 0 else 0

        # 5. İhlal sayısı
        violation_count = await db.shift_violations.count_documents({
            "company_id": company_id,
            "entity_id": cid,
            "created_at": {"$gte": start_str, "$lte": end_str}
        })

        # 6. Mola süresi
        break_pipeline = [
            {
                "$match": {
                    "courier_id": cid,
                    "company_id": company_id,
                    "old_status": "on_break",
                    "timestamp": {"$gte": start_str, "$lte": end_str},
                    "duration_minutes": {"$gt": 0}
                }
            },
            {"$group": {"_id": None, "total": {"$sum": "$duration_minutes"}}}
        ]
        break_result = await db.courier_status_logs.aggregate(break_pipeline).to_list(1)
        break_minutes = round(break_result[0]["total"], 0) if break_result else 0

        results.append({
            "courier_id": cid,
            "name": courier["name"],
            "is_admin": is_admin,
            "delivery_count": delivery_count,
            "avg_delivery_minutes": avg_delivery_minutes,
            "active_hours": active_hours,
            "hourly_delivery_avg": hourly_delivery_avg,
            "violation_count": violation_count,
            "break_minutes": int(break_minutes)
        })

    # Kurye ve yönetici ayrımı
    courier_results = [r for r in results if not r["is_admin"]]
    admin_results = [r for r in results if r["is_admin"]]

    # Kurye ortalaması (yöneticiler hariç)
    active_couriers = [c for c in courier_results if c["delivery_count"] > 0 or c["active_hours"] > 0]
    if active_couriers:
        avg = {
            "delivery_count": round(sum(c["delivery_count"] for c in active_couriers) / len(active_couriers), 1),
            "avg_delivery_minutes": round(sum(c["avg_delivery_minutes"] for c in active_couriers if c["avg_delivery_minutes"] > 0) / max(len([c for c in active_couriers if c["avg_delivery_minutes"] > 0]), 1), 1),
            "active_hours": round(sum(c["active_hours"] for c in active_couriers) / len(active_couriers), 1),
            "hourly_delivery_avg": round(sum(c["hourly_delivery_avg"] for c in active_couriers if c["hourly_delivery_avg"] > 0) / max(len([c for c in active_couriers if c["hourly_delivery_avg"] > 0]), 1), 1),
            "violation_count": round(sum(c["violation_count"] for c in active_couriers) / len(active_couriers), 1),
            "break_minutes": round(sum(c["break_minutes"] for c in active_couriers) / len(active_couriers))
        }
    else:
        avg = None

    # Şirket açılış/kapanış saatleri
    company = await db.companies.find_one({"id": company_id}, {"_id": 0, "opening_time": 1, "closing_time": 1})
    opening_hour = int((company or {}).get("opening_time", "09:00").split(":")[0])
    closing_hour = int((company or {}).get("closing_time", "23:00").split(":")[0])

    # Saatlik sipariş dağılımı (açılıştan kapanışa)
    hourly_pipeline = [
        {
            "$match": {
                "company_id": company_id,
                "status": "delivered",
                "created_at": {"$gte": start_str, "$lte": end_str}
            }
        },
        {
            "$addFields": {
                "_parsed": {"$dateFromString": {"dateString": "$created_at", "onError": None}}
            }
        },
        {"$match": {"_parsed": {"$ne": None}}},
        {
            "$group": {
                "_id": {"$hour": "$_parsed"},
                "count": {"$sum": 1}
            }
        },
        {"$sort": {"_id": 1}}
    ]
    hourly_results = await db.orders.aggregate(hourly_pipeline).to_list(24)
    hourly_map = {r["_id"]: r["count"] for r in hourly_results}
    
    # Açılıştan kapanışa saat listesi (gece geçişini destekler)
    if opening_hour <= closing_hour:
        hour_range = list(range(opening_hour, closing_hour + 1))
    else:
        hour_range = list(range(opening_hour, 24)) + list(range(0, closing_hour + 1))
    
    hourly_distribution = [{"hour": h, "count": hourly_map.get(h, 0)} for h in hour_range]

    return {
        "couriers": courier_results,
        "admins": admin_results,
        "courier_average": avg,
        "hourly_distribution": hourly_distribution
    }
