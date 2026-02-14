"""
Finans API - Kurye ve Restoran finans ayarları
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
from database import db
import uuid

router = APIRouter(tags=["Finance"])


class CourierFinanceUpdate(BaseModel):
    delivery_fee_per_package: float
    company_id: str


class RestaurantFinanceUpdate(BaseModel):
    service_fee_per_package: float
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
