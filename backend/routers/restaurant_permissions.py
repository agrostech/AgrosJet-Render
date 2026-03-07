"""
Restoran İzinleri API
Restoranların yapabilecekleri işlemleri yönetir
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict
from datetime import datetime, timezone

from utils.database import db
from utils.helpers import get_turkey_now, ensure_turkey_timezone, TURKEY_TZ

router = APIRouter(prefix="/api/restaurant-permissions", tags=["Restoran İzinleri"])


# İzin tanımları
PERMISSION_DEFINITIONS = {
    "can_assign_courier": {
        "label": "Kurye Atama",
        "short_label": "K.Atama",
        "description": "Kurye atandıktan sonra yeni gelen siparişleri aynı kuryeye atayabilir",
        "default": False
    },
    "can_view_courier_phone": {
        "label": "Kurye Telefonu Görüntüleme",
        "short_label": "K.Tel",
        "description": "Atanan kuryenin telefon numarasını görüntüleyebilir",
        "default": True
    },
    "can_view_courier_location": {
        "label": "Kurye Konumu Görüntüleme",
        "short_label": "K.Konum",
        "description": "Haritada kuryenin anlık konumunu görüntüleyebilir",
        "default": True
    },
    "can_view_courier_eta": {
        "label": "Kurye Tahmini Varış Süresi",
        "short_label": "K.ETA",
        "description": "Kuryenin restorana tahmini varış süresini görüntüleyebilir",
        "default": True
    },
    "can_mark_restaurant_delivery": {
        "label": "Restoran Teslimatı İşaretleme",
        "short_label": "R.Tslm",
        "description": "Siparişi restoran teslimatı olarak işaretleyebilir. Bu siparişler mütabakat ve raporlara dahil edilmez.",
        "default": False
    },
    "can_change_order_status": {
        "label": "Sipariş Durumu Değiştirme",
        "short_label": "S.Durum",
        "description": "Sipariş durumunu değiştirebilir (Hazırlanıyor, Hazır vb.). Restoran teslimatı olan siparişler için bu izin aranmaz.",
        "default": True
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
        {"_id": 0, "id": 1, "name": 1, "permissions": 1, "permissions_updated_at": 1}
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
        "permissions": permissions,
        "permissions_updated_at": restaurant.get("permissions_updated_at")
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
    now = get_turkey_now()
    await db.restaurants.update_one(
        {"id": restaurant_id},
        {
            "$set": {
                f"permissions.{data.permission_key}": data.value,
                "permissions_updated_at": now,
                "updated_at": now
            }
        }
    )
    
    permission_label = PERMISSION_DEFINITIONS[data.permission_key]["label"]
    status = "aktif" if data.value else "pasif"
    
    return {
        "message": f"{permission_label} izni {status} edildi",
        "permission_key": data.permission_key,
        "value": data.value,
        "permissions_updated_at": now
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
                "updated_at": get_turkey_now()
            }
        }
    )
    
    return {
        "message": "İzinler varsayılana sıfırlandı",
        "permissions": default_permissions
    }
