"""
Finans API - Kurye ve Restoran finans ayarları
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import uuid

from utils.database import db

router = APIRouter(prefix="/api", tags=["Finance"])


class CourierFinanceUpdate(BaseModel):
    delivery_fee_per_package: float
    company_id: str


class RestaurantFinanceUpdate(BaseModel):
    service_fee_per_package: float
    company_id: str


class CollectionTransactionCreate(BaseModel):
    amount: float
    note: Optional[str] = None
    company_id: str


# --- Kurye Finans ---
@router.get("/couriers/{courier_id}/finance")
async def get_courier_finance(courier_id: str):
    """Kurye finans bilgilerini getir"""
    finance = await db.courier_finance.find_one({"courier_id": courier_id})
    if not finance:
        return None
    
    finance.pop("_id", None)
    return finance


@router.post("/couriers/{courier_id}/finance")
async def update_courier_finance(courier_id: str, data: CourierFinanceUpdate):
    """Kurye finans bilgilerini güncelle"""
    # Kurye kontrolü
    courier = await db.couriers.find_one({"id": courier_id})
    if not courier:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")
    
    finance_data = {
        "courier_id": courier_id,
        "company_id": data.company_id,
        "delivery_fee_per_package": data.delivery_fee_per_package,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    existing = await db.courier_finance.find_one({"courier_id": courier_id})
    if existing:
        await db.courier_finance.update_one(
            {"courier_id": courier_id},
            {"$set": finance_data}
        )
    else:
        finance_data["id"] = str(uuid.uuid4())
        finance_data["created_at"] = datetime.now(timezone.utc).isoformat()
        await db.courier_finance.insert_one(finance_data)
    
    return {"status": "success", "message": "Kurye finans bilgileri güncellendi"}


# --- Kurye Tahsilat ---
@router.get("/couriers/{courier_id}/collections")
async def get_courier_collections(courier_id: str, company_id: str):
    """Kuryenin tahsilat işlemlerini getir"""
    # Kuryenin teslim ettiği nakit siparişler (pending collection)
    pending_orders = await db.orders.find({
        "courier_id": courier_id,
        "company_id": company_id,
        "status": "delivered",
        "payment_method": {"$in": ["cash", "nakit", "Nakit", "CASH"]},
        "collection_status": {"$ne": "collected"}
    }, {"_id": 0}).to_list(1000)
    
    # Tahsilat yapılmış işlemler
    collected_transactions = await db.collection_transactions.find({
        "courier_id": courier_id,
        "company_id": company_id
    }, {"_id": 0}).sort("created_at", -1).to_list(100)
    
    # Bekleyen toplam
    pending_total = sum(float(o.get("total_amount", 0)) for o in pending_orders)
    
    # Tahsil edilen toplam
    collected_total = sum(float(t.get("amount", 0)) for t in collected_transactions)
    
    return {
        "pending_orders": pending_orders,
        "pending_total": pending_total,
        "collected_transactions": collected_transactions,
        "collected_total": collected_total,
        "balance": pending_total  # Kuryenin şirkete borcu
    }


@router.post("/couriers/{courier_id}/collections")
async def add_courier_collection(courier_id: str, data: CollectionTransactionCreate):
    """Kuryeden tahsilat yap"""
    courier = await db.couriers.find_one({"id": courier_id})
    if not courier:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")
    
    transaction = {
        "id": str(uuid.uuid4()),
        "courier_id": courier_id,
        "company_id": data.company_id,
        "amount": data.amount,
        "note": data.note,
        "type": "collection",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.collection_transactions.insert_one(transaction)
    
    # Bekleyen siparişleri tahsil edildi olarak işaretle (FIFO)
    remaining = data.amount
    pending_orders = await db.orders.find({
        "courier_id": courier_id,
        "company_id": data.company_id,
        "status": "delivered",
        "payment_method": {"$in": ["cash", "nakit", "Nakit", "CASH"]},
        "collection_status": {"$ne": "collected"}
    }).sort("delivered_at", 1).to_list(1000)
    
    for order in pending_orders:
        if remaining <= 0:
            break
        order_amount = float(order.get("total_amount", 0))
        if remaining >= order_amount:
            await db.orders.update_one(
                {"id": order["id"]},
                {"$set": {"collection_status": "collected", "collected_at": datetime.now(timezone.utc).isoformat()}}
            )
            remaining -= order_amount
    
    transaction.pop("_id", None)
    return {"status": "success", "transaction": transaction}


# --- Restoran Finans ---
@router.get("/restaurants/{restaurant_id}/finance")
async def get_restaurant_finance(restaurant_id: str):
    """Restoran finans bilgilerini getir"""
    finance = await db.restaurant_finance.find_one({"restaurant_id": restaurant_id})
    if not finance:
        return None
    
    finance.pop("_id", None)
    return finance


@router.post("/restaurants/{restaurant_id}/finance")
async def update_restaurant_finance(restaurant_id: str, data: RestaurantFinanceUpdate):
    """Restoran finans bilgilerini güncelle"""
    # Restoran kontrolü
    restaurant = await db.restaurants.find_one({"id": restaurant_id})
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    finance_data = {
        "restaurant_id": restaurant_id,
        "company_id": data.company_id,
        "service_fee_per_package": data.service_fee_per_package,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    existing = await db.restaurant_finance.find_one({"restaurant_id": restaurant_id})
    if existing:
        await db.restaurant_finance.update_one(
            {"restaurant_id": restaurant_id},
            {"$set": finance_data}
        )
    else:
        finance_data["id"] = str(uuid.uuid4())
        finance_data["created_at"] = datetime.now(timezone.utc).isoformat()
        await db.restaurant_finance.insert_one(finance_data)
    
    return {"status": "success", "message": "Restoran finans bilgileri güncellendi"}


# --- Restoran Tahsilat ---
@router.get("/restaurants/{restaurant_id}/collections")
async def get_restaurant_collections(restaurant_id: str, company_id: str):
    """Restoranın tahsilat işlemlerini getir"""
    # Restorandan teslim edilen siparişler (şirket restorandan tahsil edecek)
    pending_orders = await db.orders.find({
        "restaurant_id": restaurant_id,
        "company_id": company_id,
        "status": "delivered",
        "restaurant_collection_status": {"$ne": "collected"}
    }, {"_id": 0}).to_list(1000)
    
    # Tahsilat yapılmış işlemler
    collected_transactions = await db.restaurant_collection_transactions.find({
        "restaurant_id": restaurant_id,
        "company_id": company_id
    }, {"_id": 0}).sort("created_at", -1).to_list(100)
    
    # Hizmet ücreti hesapla
    finance = await db.restaurant_finance.find_one({"restaurant_id": restaurant_id})
    service_fee_per_package = finance.get("service_fee_per_package", 0) if finance else 0
    
    # Bekleyen toplam (sipariş adedi * hizmet ücreti)
    pending_total = len(pending_orders) * service_fee_per_package
    
    # Tahsil edilen toplam
    collected_total = sum(float(t.get("amount", 0)) for t in collected_transactions)
    
    return {
        "pending_orders": pending_orders,
        "pending_order_count": len(pending_orders),
        "service_fee_per_package": service_fee_per_package,
        "pending_total": pending_total,
        "collected_transactions": collected_transactions,
        "collected_total": collected_total,
        "balance": pending_total - collected_total  # Restoranın şirkete borcu
    }


@router.post("/restaurants/{restaurant_id}/collections")
async def add_restaurant_collection(restaurant_id: str, data: CollectionTransactionCreate):
    """Restorandan tahsilat yap"""
    restaurant = await db.restaurants.find_one({"id": restaurant_id})
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    transaction = {
        "id": str(uuid.uuid4()),
        "restaurant_id": restaurant_id,
        "company_id": data.company_id,
        "amount": data.amount,
        "note": data.note,
        "type": "collection",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.restaurant_collection_transactions.insert_one(transaction)
    
    # Bekleyen siparişleri tahsil edildi olarak işaretle
    finance = await db.restaurant_finance.find_one({"restaurant_id": restaurant_id})
    service_fee = finance.get("service_fee_per_package", 0) if finance else 0
    
    if service_fee > 0:
        orders_to_mark = int(data.amount / service_fee)
        pending_orders = await db.orders.find({
            "restaurant_id": restaurant_id,
            "company_id": data.company_id,
            "status": "delivered",
            "restaurant_collection_status": {"$ne": "collected"}
        }).sort("delivered_at", 1).to_list(orders_to_mark)
        
        for order in pending_orders:
            await db.orders.update_one(
                {"id": order["id"]},
                {"$set": {"restaurant_collection_status": "collected", "restaurant_collected_at": datetime.now(timezone.utc).isoformat()}}
            )
    
    transaction.pop("_id", None)
    return {"status": "success", "transaction": transaction}
