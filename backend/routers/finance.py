"""
Finans API - Kurye ve Restoran finans logları
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from datetime import datetime, timezone

from utils.database import db
from utils.jwt_utils import require_admin

router = APIRouter(prefix="/api", tags=["Finance"], dependencies=[Depends(require_admin)])


# --- Kurye Finans Logları ---
@router.get("/couriers/{courier_id}/finance-logs")
async def get_courier_finance_logs(courier_id: str, company_id: str):
    """Kuryenin teslim ettiği siparişler ve kazançları"""
    
    # Kurye ücretlendirme ayarı
    courier = await db.couriers.find_one({"id": courier_id})
    pricing = await db.courier_pricing.find_one({"courier_id": courier_id})
    fee_per_package = pricing.get("per_package_price", 0) if pricing else 0
    
    # Teslim edilen siparişler
    delivered_orders = await db.orders.find({
        "courier_id": courier_id,
        "company_id": company_id,
        "status": "delivered"
    }, {"_id": 0}).sort("delivered_at", -1).to_list(100)
    
    # Taşıma kazançları hesapla
    delivery_orders = []
    total_earning = 0
    for o in delivered_orders:
        earning = fee_per_package
        delivery_orders.append({
            "id": o.get("id"),
            "restaurant_name": o.get("restaurant_name", ""),
            "customer_name": o.get("customer_name", ""),
            "delivered_at": o.get("delivered_at"),
            "courier_earning": earning
        })
        total_earning += earning
    
    # Nakit/Online ayrımı
    cash_methods = ["cash", "nakit", "Nakit", "CASH"]
    cash_orders = [o for o in delivered_orders if o.get("payment_method") in cash_methods]
    online_orders = [o for o in delivered_orders if o.get("payment_method") not in cash_methods]
    
    total_cash = sum(float(o.get("total_amount", 0)) for o in cash_orders)
    total_online = sum(float(o.get("total_amount", 0)) for o in online_orders)
    
    collection_orders = []
    for o in cash_orders:
        collection_orders.append({
            "id": o.get("id"),
            "restaurant_name": o.get("restaurant_name", ""),
            "customer_name": o.get("customer_name", ""),
            "delivered_at": o.get("delivered_at"),
            "total_amount": o.get("total_amount", 0)
        })
    
    return {
        "delivery": {
            "total_orders": len(delivered_orders),
            "total_earning": total_earning,
            "fee_per_package": fee_per_package,
            "orders": delivery_orders[:50]  # Son 50
        },
        "collection": {
            "total_cash": total_cash,
            "total_online": total_online,
            "cash_orders": len(cash_orders),
            "online_orders": len(online_orders),
            "orders": collection_orders[:50]
        }
    }


# --- Restoran Finans Logları ---
@router.get("/restaurants/{restaurant_id}/finance-logs")
async def get_restaurant_finance_logs(restaurant_id: str, company_id: str):
    """Restoranın teslim edilen siparişleri ve hizmet bedelleri"""
    
    # Restoran ücretlendirme ayarı
    pricing = await db.restaurant_pricing.find_one({"restaurant_id": restaurant_id})
    fee_per_package = pricing.get("per_package_price", 0) if pricing else 0
    
    # Teslim edilen siparişler
    delivered_orders = await db.orders.find({
        "restaurant_id": restaurant_id,
        "company_id": company_id,
        "status": "delivered"
    }, {"_id": 0}).sort("delivered_at", -1).to_list(100)
    
    # Hizmet bedeli hesapla
    delivery_orders = []
    total_service_fee = 0
    for o in delivered_orders:
        service_fee = fee_per_package
        # Kurye adını al
        courier_name = ""
        if o.get("courier_id"):
            courier = await db.couriers.find_one({"id": o.get("courier_id")})
            courier_name = courier.get("name", "") if courier else ""
        
        delivery_orders.append({
            "id": o.get("id"),
            "customer_name": o.get("customer_name", ""),
            "courier_name": courier_name,
            "delivered_at": o.get("delivered_at"),
            "service_fee": service_fee
        })
        total_service_fee += service_fee
    
    # Nakit/Online ayrımı
    cash_methods = ["cash", "nakit", "Nakit", "CASH"]
    cash_orders = [o for o in delivered_orders if o.get("payment_method") in cash_methods]
    online_orders = [o for o in delivered_orders if o.get("payment_method") not in cash_methods]
    
    total_cash = sum(float(o.get("total_amount", 0)) for o in cash_orders)
    total_online = sum(float(o.get("total_amount", 0)) for o in online_orders)
    
    collection_orders = []
    for o in delivered_orders:
        is_cash = o.get("payment_method") in cash_methods
        collection_orders.append({
            "id": o.get("id"),
            "customer_name": o.get("customer_name", ""),
            "delivered_at": o.get("delivered_at"),
            "total_amount": o.get("total_amount", 0),
            "is_cash": is_cash
        })
    
    return {
        "delivery": {
            "total_orders": len(delivered_orders),
            "total_service_fee": total_service_fee,
            "fee_per_package": fee_per_package,
            "orders": delivery_orders[:50]
        },
        "collection": {
            "total_cash": total_cash,
            "total_online": total_online,
            "cash_orders": len(cash_orders),
            "online_orders": len(online_orders),
            "orders": collection_orders[:50]
        }
    }
