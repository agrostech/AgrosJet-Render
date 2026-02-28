"""
Restaurant Groups - Restoran Grupları Yönetimi
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone
import uuid
from database import db

router = APIRouter(prefix="/api/restaurant-groups", tags=["Restaurant Groups"])

# Models
class RestaurantGroupCreate(BaseModel):
    name: str
    company_id: str

class RestaurantGroupUpdate(BaseModel):
    name: Optional[str] = None

class RestaurantGroupAddRemove(BaseModel):
    restaurant_ids: List[str]


# Endpoints
@router.get("/{company_id}")
async def get_restaurant_groups(company_id: str):
    """Şirkete ait tüm grupları listele"""
    groups = await db.restaurant_groups.find(
        {"company_id": company_id},
        {"_id": 0}
    ).sort("created_at", 1).to_list(100)
    return {"groups": groups}


@router.post("")
async def create_restaurant_group(data: RestaurantGroupCreate):
    """Yeni grup oluştur"""
    group = {
        "id": str(uuid.uuid4()),
        "name": data.name,
        "company_id": data.company_id,
        "restaurant_ids": [],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    await db.restaurant_groups.insert_one(group)
    group.pop("_id", None)
    return {"success": True, "group": group}


@router.put("/{group_id}")
async def update_restaurant_group(group_id: str, data: RestaurantGroupUpdate):
    """Grup adını güncelle"""
    update_data = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if data.name:
        update_data["name"] = data.name
    
    result = await db.restaurant_groups.update_one(
        {"id": group_id},
        {"$set": update_data}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Grup bulunamadı")
    
    return {"success": True}


@router.delete("/{group_id}")
async def delete_restaurant_group(group_id: str):
    """Grubu sil"""
    result = await db.restaurant_groups.delete_one({"id": group_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Grup bulunamadı")
    return {"success": True}


@router.post("/{group_id}/restaurants")
async def add_restaurants_to_group(group_id: str, data: RestaurantGroupAddRemove):
    """Gruba restoran ekle"""
    result = await db.restaurant_groups.update_one(
        {"id": group_id},
        {
            "$addToSet": {"restaurant_ids": {"$each": data.restaurant_ids}},
            "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}
        }
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Grup bulunamadı")
    return {"success": True}


@router.delete("/{group_id}/restaurants")
async def remove_restaurants_from_group(group_id: str, data: RestaurantGroupAddRemove):
    """Gruptan restoran çıkar"""
    result = await db.restaurant_groups.update_one(
        {"id": group_id},
        {
            "$pull": {"restaurant_ids": {"$in": data.restaurant_ids}},
            "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}
        }
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Grup bulunamadı")
    return {"success": True}
