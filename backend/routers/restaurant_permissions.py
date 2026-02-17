"""
Restoran İzinleri API
Restoranların yapabilecekleri işlemleri yönetir
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict
from datetime import datetime, timezone

from utils.database import db

router = APIRouter(prefix="/api/restaurant-permissions", tags=["Restoran İzinleri"])


# İzin tanımları
PERMISSION_DEFINITIONS = {
    "can_assign_courier": {
        "label": "Kurye Atama",
        "description": "Kurye atandıktan sonra yeni gelen siparişleri aynı kuryeye atayabilir",
        "default": False
    }
}


class PermissionUpdate(BaseModel):
    permission_key: str
    value: bool


@router.get("/definitions")
async def get_permission_definitions():
    """Tüm izin tanımlarını getir"""
    return {
        "permissions": [
            {
                "key": key,
                "label": val["label"],
                "description": val["description"],
                "default": val["default"]
            }
            for key, val in PERMISSION_DEFINITIONS.items()
        ]
    }


@router.get("/{restaurant_id}")
async def get_restaurant_permissions(restaurant_id: str):
    """Restoran izinlerini getir"""
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0, "id": 1, "name": 1, "permissions": 1}
    )
    
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    # Mevcut izinleri al, yoksa default değerleri kullan
    current_permissions = restaurant.get("permissions", {})
    
    # Tüm izinleri döndür (tanımlı olmayanlar için default değer)
    permissions = {}
    for key, definition in PERMISSION_DEFINITIONS.items():
        permissions[key] = current_permissions.get(key, definition["default"])
    
    return {
        "restaurant_id": restaurant_id,
        "restaurant_name": restaurant.get("name"),
        "permissions": permissions
    }


@router.put("/{restaurant_id}")
async def update_restaurant_permission(restaurant_id: str, data: PermissionUpdate):
    """Restoran iznini güncelle"""
    # İzin key'inin geçerli olduğunu kontrol et
    if data.permission_key not in PERMISSION_DEFINITIONS:
        raise HTTPException(
            status_code=400, 
            detail=f"Geçersiz izin: {data.permission_key}"
        )
    
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0, "id": 1}
    )
    
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    # İzni güncelle
    await db.restaurants.update_one(
        {"id": restaurant_id},
        {
            "$set": {
                f"permissions.{data.permission_key}": data.value,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    permission_label = PERMISSION_DEFINITIONS[data.permission_key]["label"]
    status = "aktif" if data.value else "pasif"
    
    return {
        "message": f"{permission_label} izni {status} edildi",
        "permission_key": data.permission_key,
        "value": data.value
    }


@router.post("/{restaurant_id}/reset")
async def reset_restaurant_permissions(restaurant_id: str):
    """Restoran izinlerini varsayılana sıfırla"""
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0, "id": 1}
    )
    
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    # Tüm izinleri default değerlere sıfırla
    default_permissions = {
        key: definition["default"] 
        for key, definition in PERMISSION_DEFINITIONS.items()
    }
    
    await db.restaurants.update_one(
        {"id": restaurant_id},
        {
            "$set": {
                "permissions": default_permissions,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    return {
        "message": "İzinler varsayılana sıfırlandı",
        "permissions": default_permissions
    }
