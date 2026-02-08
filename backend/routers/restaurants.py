"""
Restoranlar API
Restoran CRUD + Adisyo API entegrasyon bilgileri yönetimi
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import uuid

from utils.database import db

router = APIRouter(prefix="/api/restaurants", tags=["Restoranlar"])


# --- Pydantic Models ---
class RestaurantCreate(BaseModel):
    name: str
    phone: Optional[str] = None
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    company_id: str
    preparation_time: int = 15  # Hazırlık süresi (dakika), varsayılan 15 dakika
    # Adisyo API bilgileri
    adisyo_api_key: Optional[str] = None
    adisyo_api_secret: Optional[str] = None
    adisyo_branch_id: Optional[str] = None


class RestaurantUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    preparation_time: Optional[int] = None  # Hazırlık süresi (dakika)
    adisyo_api_key: Optional[str] = None
    adisyo_api_secret: Optional[str] = None
    adisyo_branch_id: Optional[str] = None
    is_active: Optional[bool] = None


# --- CRUD Endpoints ---

@router.get("/{company_id}")
async def get_restaurants(company_id: str, include_archived: bool = False):
    """Şirkete ait tüm restoranları getir"""
    query = {"company_id": company_id}
    if not include_archived:
        query["is_archived"] = {"$ne": True}
    
    restaurants = await db.restaurants.find(query, {"_id": 0}).to_list(500)
    
    # Adisyo API bilgilerini maskele (güvenlik)
    for r in restaurants:
        if r.get("adisyo_api_key"):
            r["adisyo_api_key"] = "***" + r["adisyo_api_key"][-4:] if len(r["adisyo_api_key"]) > 4 else "****"
        if r.get("adisyo_api_secret"):
            r["adisyo_api_secret"] = "********"
    
    return restaurants


@router.get("/{company_id}/{restaurant_id}")
async def get_restaurant(company_id: str, restaurant_id: str):
    """Tek bir restoran detayını getir"""
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id, "company_id": company_id},
        {"_id": 0}
    )
    
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    # Adisyo API bilgilerini maskele
    if restaurant.get("adisyo_api_key"):
        restaurant["adisyo_api_key"] = "***" + restaurant["adisyo_api_key"][-4:] if len(restaurant["adisyo_api_key"]) > 4 else "****"
    if restaurant.get("adisyo_api_secret"):
        restaurant["adisyo_api_secret"] = "********"
    
    return restaurant


@router.post("")
async def create_restaurant(data: RestaurantCreate):
    """Yeni restoran oluştur"""
    restaurant = {
        "id": str(uuid.uuid4()),
        "name": data.name,
        "phone": data.phone,
        "address": data.address,
        "latitude": data.latitude,
        "longitude": data.longitude,
        "company_id": data.company_id,
        "preparation_time": data.preparation_time,  # Hazırlık süresi (dakika)
        "adisyo_api_key": data.adisyo_api_key,
        "adisyo_api_secret": data.adisyo_api_secret,
        "adisyo_branch_id": data.adisyo_branch_id,
        "adisyo_connected": False,  # Bağlantı test edilince True olacak
        "is_active": True,
        "is_archived": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.restaurants.insert_one(restaurant)
    
    return {"message": "Restoran oluşturuldu", "id": restaurant["id"]}


@router.put("/{restaurant_id}")
async def update_restaurant(restaurant_id: str, data: RestaurantUpdate):
    """Restoran bilgilerini güncelle"""
    update_fields = {}
    
    if data.name is not None:
        update_fields["name"] = data.name
    if data.phone is not None:
        update_fields["phone"] = data.phone
    if data.address is not None:
        update_fields["address"] = data.address
    if data.latitude is not None:
        update_fields["latitude"] = data.latitude
    if data.longitude is not None:
        update_fields["longitude"] = data.longitude
    if data.adisyo_api_key is not None:
        update_fields["adisyo_api_key"] = data.adisyo_api_key
        update_fields["adisyo_connected"] = False  # API değişince bağlantıyı resetle
    if data.adisyo_api_secret is not None:
        update_fields["adisyo_api_secret"] = data.adisyo_api_secret
        update_fields["adisyo_connected"] = False
    if data.adisyo_branch_id is not None:
        update_fields["adisyo_branch_id"] = data.adisyo_branch_id
    if data.is_active is not None:
        update_fields["is_active"] = data.is_active
    
    if not update_fields:
        raise HTTPException(status_code=400, detail="Güncellenecek alan belirtilmedi")
    
    update_fields["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    result = await db.restaurants.update_one(
        {"id": restaurant_id},
        {"$set": update_fields}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    return {"message": "Restoran güncellendi"}


@router.put("/{restaurant_id}/archive")
async def archive_restaurant(restaurant_id: str):
    """Restoranı arşivle"""
    result = await db.restaurants.update_one(
        {"id": restaurant_id},
        {"$set": {"is_archived": True, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    return {"message": "Restoran arşivlendi"}


@router.put("/{restaurant_id}/unarchive")
async def unarchive_restaurant(restaurant_id: str):
    """Restoranı arşivden çıkar"""
    result = await db.restaurants.update_one(
        {"id": restaurant_id},
        {"$set": {"is_archived": False, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    return {"message": "Restoran arşivden çıkarıldı"}


@router.delete("/{restaurant_id}")
async def delete_restaurant(restaurant_id: str):
    """Restoranı kalıcı olarak sil"""
    result = await db.restaurants.delete_one({"id": restaurant_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    return {"message": "Restoran silindi"}


# --- Adisyo API Bağlantı Test ---
@router.post("/{restaurant_id}/test-adisyo")
async def test_adisyo_connection(restaurant_id: str):
    """Adisyo API bağlantısını test et"""
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0, "adisyo_api_key": 1, "adisyo_api_secret": 1, "adisyo_branch_id": 1}
    )
    
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    if not restaurant.get("adisyo_api_key") or not restaurant.get("adisyo_api_secret"):
        raise HTTPException(status_code=400, detail="Adisyo API bilgileri eksik")
    
    # TODO: Gerçek Adisyo API bağlantı testi
    # Şimdilik mock olarak başarılı döndür
    
    # Bağlantı başarılı, veritabanını güncelle
    await db.restaurants.update_one(
        {"id": restaurant_id},
        {"$set": {
            "adisyo_connected": True,
            "adisyo_last_test": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"message": "Adisyo bağlantısı başarılı", "connected": True}


# --- İstatistikler ---
@router.get("/{company_id}/stats/summary")
async def get_restaurant_stats(company_id: str):
    """Restoran özet istatistikleri"""
    total = await db.restaurants.count_documents({"company_id": company_id, "is_archived": {"$ne": True}})
    active = await db.restaurants.count_documents({"company_id": company_id, "is_active": True, "is_archived": {"$ne": True}})
    adisyo_connected = await db.restaurants.count_documents({
        "company_id": company_id, 
        "adisyo_connected": True, 
        "is_archived": {"$ne": True}
    })
    
    return {
        "total": total,
        "active": active,
        "inactive": total - active,
        "adisyo_connected": adisyo_connected
    }
