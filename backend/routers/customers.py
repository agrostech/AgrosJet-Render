"""
Müşteri Yönetimi API
- Telefon siparişi müşterilerini otomatik kayıt
- CRUD işlemleri
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone, timedelta
import uuid
import logging

from utils.database import db
from utils.jwt_utils import require_admin

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/customers", tags=["customers"], dependencies=[Depends(require_admin)])

TURKEY_TZ = timezone(timedelta(hours=3))


def get_turkey_now():
    return datetime.now(TURKEY_TZ).isoformat()


class CustomerCreate(BaseModel):
    name: str
    phone: str
    address: Optional[str] = None
    address_direction: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    note: Optional[str] = None


class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    address_direction: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    note: Optional[str] = None


@router.get("/{restaurant_id}")
async def get_customers(restaurant_id: str, search: Optional[str] = None):
    """Restoran müşterilerini listele"""
    query = {"restaurant_id": restaurant_id}
    
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"phone": {"$regex": search, "$options": "i"}}
        ]
    
    customers = await db.customers.find(
        query,
        {"_id": 0}
    ).sort("updated_at", -1).to_list(500)
    
    return {"customers": customers, "count": len(customers)}


@router.post("/{restaurant_id}")
async def create_customer(restaurant_id: str, data: CustomerCreate):
    """Yeni müşteri ekle"""
    # Telefon ile mevcut müşteri kontrolü
    existing = await db.customers.find_one({
        "restaurant_id": restaurant_id,
        "phone": data.phone
    })
    
    if existing:
        # Mevcut müşteriyi güncelle
        await db.customers.update_one(
            {"id": existing["id"]},
            {"$set": {
                "name": data.name,
                "address": data.address,
                "address_direction": data.address_direction,
                "latitude": data.latitude,
                "longitude": data.longitude,
                "note": data.note,
                "updated_at": get_turkey_now(),
                "order_count": existing.get("order_count", 0) + 1
            }}
        )
        return {"success": True, "message": "Müşteri güncellendi", "id": existing["id"], "action": "updated"}
    
    # Yeni müşteri oluştur
    customer = {
        "id": str(uuid.uuid4()),
        "restaurant_id": restaurant_id,
        "name": data.name,
        "phone": data.phone,
        "address": data.address,
        "address_direction": data.address_direction,
        "latitude": data.latitude,
        "longitude": data.longitude,
        "note": data.note,
        "order_count": 1,
        "created_at": get_turkey_now(),
        "updated_at": get_turkey_now()
    }
    
    await db.customers.insert_one(customer)
    logger.info(f"Yeni müşteri oluşturuldu: {customer['id']} - {data.name}")
    
    return {"success": True, "message": "Müşteri oluşturuldu", "id": customer["id"], "action": "created"}


@router.put("/{restaurant_id}/{customer_id}")
async def update_customer(restaurant_id: str, customer_id: str, data: CustomerUpdate):
    """Müşteri güncelle"""
    customer = await db.customers.find_one({
        "id": customer_id,
        "restaurant_id": restaurant_id
    })
    
    if not customer:
        raise HTTPException(status_code=404, detail="Müşteri bulunamadı")
    
    update_data = {"updated_at": get_turkey_now()}
    
    if data.name is not None:
        update_data["name"] = data.name
    if data.phone is not None:
        update_data["phone"] = data.phone
    if data.address is not None:
        update_data["address"] = data.address
    if data.address_direction is not None:
        update_data["address_direction"] = data.address_direction
    if data.latitude is not None:
        update_data["latitude"] = data.latitude
    if data.longitude is not None:
        update_data["longitude"] = data.longitude
    if data.note is not None:
        update_data["note"] = data.note
    
    await db.customers.update_one(
        {"id": customer_id},
        {"$set": update_data}
    )
    
    return {"success": True, "message": "Müşteri güncellendi"}


@router.delete("/{restaurant_id}/{customer_id}")
async def delete_customer(restaurant_id: str, customer_id: str):
    """Müşteri sil"""
    result = await db.customers.delete_one({
        "id": customer_id,
        "restaurant_id": restaurant_id
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Müşteri bulunamadı")
    
    return {"success": True, "message": "Müşteri silindi"}


@router.get("/{restaurant_id}/search/{phone}")
async def search_customer_by_phone(restaurant_id: str, phone: str):
    """Telefon numarasına göre müşteri ara"""
    # Telefon numarasını temizle
    clean_phone = phone.replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
    
    customer = await db.customers.find_one({
        "restaurant_id": restaurant_id,
        "$or": [
            {"phone": phone},
            {"phone": clean_phone},
            {"phone": {"$regex": clean_phone[-10:], "$options": "i"}}
        ]
    }, {"_id": 0})
    
    if customer:
        return {"found": True, "customer": customer}
    
    return {"found": False, "customer": None}


async def auto_save_customer_from_order(order: dict):
    """
    Sipariş oluşturulduğunda müşteriyi otomatik kaydet.
    Sadece manuel (telefon) siparişleri için çalışır.
    """
    if order.get("source") not in ["manual", "phone", "telefon"]:
        return
    
    restaurant_id = order.get("restaurant_id")
    if not restaurant_id:
        return
    
    customer_name = order.get("customer_name")
    customer_phone = order.get("customer_phone")
    
    if not customer_phone:
        return
    
    try:
        data = CustomerCreate(
            name=customer_name or "İsimsiz Müşteri",
            phone=customer_phone,
            address=order.get("delivery_address"),
            address_direction=order.get("address_direction"),
            latitude=order.get("delivery_location", {}).get("latitude") if order.get("delivery_location") else None,
            longitude=order.get("delivery_location", {}).get("longitude") if order.get("delivery_location") else None
        )
        
        await create_customer(restaurant_id, data)
        logger.info(f"Müşteri otomatik kaydedildi: {customer_phone}")
    except Exception as e:
        logger.error(f"Müşteri otomatik kayıt hatası: {e}")
