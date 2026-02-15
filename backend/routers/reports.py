"""
Raporlar API Router
- Kurye raporları
- Restoran raporları
"""
from fastapi import APIRouter, Query
from typing import Optional
from datetime import datetime, timezone
from utils.database import db

router = APIRouter(prefix="/reports", tags=["Reports"])


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
        {"$match": {"_id": {"$ne": None}}},  # Kurye atanmamış siparişleri hariç tut
        {"$sort": {"orderCount": -1}}
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
        couriers.append({
            "id": r["_id"],
            "name": r["courier_name"] or "Bilinmiyor",
            "orderCount": r["orderCount"],
            "earnings": r["earnings"],
            "cash": r["cash"],
            "card": r["card"]
        })
    
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
        {"$sort": {"orderCount": -1}}
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
    
    return {
        "summary": {
            "totalOrders": total_orders,
            "totalTransportFee": total_transport_fee,
            "totalTransportKdv": total_transport_kdv,
            "totalPosCommission": total_pos_commission,
            "totalCash": total_cash,
            "totalCard": total_card
        },
        "restaurants": restaurants
    }
