"""
Restoran Entegrasyonları API
Platform entegrasyonları yönetimi (Adisyo, Yemeksepeti, Trendyol, Getir, Migros)
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone

from utils.database import db
from services.trendyol_service import (
    test_trendyol_connection,
    sync_restaurant_trendyol_orders,
    accept_trendyol_order,
    mark_trendyol_order_ready,
    mark_trendyol_order_shipped,
    mark_trendyol_order_delivered,
    cancel_trendyol_order,
    update_restaurant_working_status
)

router = APIRouter(prefix="/api/restaurant-integrations", tags=["Restoran Entegrasyonları"])


# --- Pydantic Models ---

class AdisyoIntegration(BaseModel):
    api_key: Optional[str] = None
    api_secret: Optional[str] = None
    branch_id: Optional[str] = None


class PlatformIntegration(BaseModel):
    enabled: bool = False
    api_key: Optional[str] = None
    api_secret: Optional[str] = None
    store_id: Optional[str] = None


class TrendyolIntegration(BaseModel):
    enabled: bool = False
    api_key: Optional[str] = None
    api_secret: Optional[str] = None
    supplier_id: Optional[str] = None
    store_id: Optional[str] = None


class TrendyolWorkingStatus(BaseModel):
    is_open: bool


class TrendyolCancelOrder(BaseModel):
    reason_id: int = 625  # 621: Ürün tükendi, 622: Kapalı, 623: Yoğun, 624: Teknik, 625: Diğer


# --- Helper Functions ---

def mask_secret(value: str, visible_chars: int = 4) -> str:
    """API key/secret'ı maskele"""
    if not value:
        return ""
    if len(value) <= visible_chars:
        return "****"
    return "***" + value[-visible_chars:]


# --- Adisyo Endpoints ---

@router.get("/{restaurant_id}/adisyo")
async def get_adisyo_integration(restaurant_id: str):
    """Restoran Adisyo entegrasyon ayarlarını getir"""
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0, "id": 1, "name": 1, "adisyo_api_key": 1, "adisyo_api_secret": 1, "adisyo_branch_id": 1, "adisyo_connected": 1}
    )
    
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    return {
        "restaurant_id": restaurant_id,
        "restaurant_name": restaurant.get("name"),
        "adisyo": {
            "api_key": mask_secret(restaurant.get("adisyo_api_key", ""), 4),
            "api_secret": "********" if restaurant.get("adisyo_api_secret") else "",
            "branch_id": restaurant.get("adisyo_branch_id", ""),
            "connected": restaurant.get("adisyo_connected", False),
            "has_credentials": bool(restaurant.get("adisyo_api_key") and restaurant.get("adisyo_api_secret"))
        }
    }


@router.put("/{restaurant_id}/adisyo")
async def update_adisyo_integration(restaurant_id: str, data: AdisyoIntegration):
    """Restoran Adisyo entegrasyon ayarlarını güncelle"""
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0, "id": 1}
    )
    
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    update_fields = {
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Sadece gönderilen alanları güncelle
    if data.api_key is not None:
        update_fields["adisyo_api_key"] = data.api_key
        update_fields["adisyo_connected"] = False  # Yeni key girilince bağlantı sıfırlanır
    
    if data.api_secret is not None:
        update_fields["adisyo_api_secret"] = data.api_secret
        update_fields["adisyo_connected"] = False
    
    if data.branch_id is not None:
        update_fields["adisyo_branch_id"] = data.branch_id
    
    await db.restaurants.update_one(
        {"id": restaurant_id},
        {"$set": update_fields}
    )
    
    return {"message": "Adisyo entegrasyon ayarları güncellendi"}


@router.post("/{restaurant_id}/adisyo/test")
async def test_adisyo_connection(restaurant_id: str):
    """Adisyo bağlantısını test et"""
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0, "id": 1, "adisyo_api_key": 1, "adisyo_api_secret": 1, "adisyo_branch_id": 1}
    )
    
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    api_key = restaurant.get("adisyo_api_key")
    api_secret = restaurant.get("adisyo_api_secret")
    
    if not api_key or not api_secret:
        raise HTTPException(status_code=400, detail="API Key ve Secret gerekli")
    
    # Adisyo API'ye bağlantı testi
    try:
        import httpx
        
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                "https://api.adisyo.com/api/v2/orders",
                params={"page": 1, "limit": 1},
                headers={
                    "X-Api-Key": api_key,
                    "X-Api-Secret": api_secret,
                    "Content-Type": "application/json"
                }
            )
            
            if response.status_code == 200:
                # Bağlantı başarılı
                await db.restaurants.update_one(
                    {"id": restaurant_id},
                    {"$set": {"adisyo_connected": True, "updated_at": datetime.now(timezone.utc).isoformat()}}
                )
                return {"success": True, "message": "Adisyo bağlantısı başarılı"}
            elif response.status_code == 401:
                await db.restaurants.update_one(
                    {"id": restaurant_id},
                    {"$set": {"adisyo_connected": False}}
                )
                raise HTTPException(status_code=401, detail="API Key veya Secret hatalı")
            else:
                raise HTTPException(status_code=response.status_code, detail=f"Adisyo API hatası: {response.status_code}")
                
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Adisyo API'ye bağlanılamadı (timeout)")
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Bağlantı hatası: {str(e)}")


@router.delete("/{restaurant_id}/adisyo")
async def disconnect_adisyo(restaurant_id: str):
    """Adisyo entegrasyonunu kaldır"""
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0, "id": 1}
    )
    
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    await db.restaurants.update_one(
        {"id": restaurant_id},
        {
            "$set": {
                "adisyo_api_key": None,
                "adisyo_api_secret": None,
                "adisyo_branch_id": None,
                "adisyo_connected": False,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    return {"message": "Adisyo entegrasyonu kaldırıldı"}


# --- Platform Entegrasyonları (Yemeksepeti, Trendyol, Getir, Migros) ---
# Bu platformlar için henüz API dökümantasyonu yok, placeholder olarak ekleniyor

SUPPORTED_PLATFORMS = {
    "yemeksepeti": {
        "name": "Yemeksepeti",
        "description": "Yemeksepeti entegrasyonu",
        "logo": "yemeksepeti"
    },
    "trendyol": {
        "name": "Trendyol Yemek", 
        "description": "Trendyol Yemek entegrasyonu",
        "logo": "trendyol"
    },
    "getir": {
        "name": "Getir Yemek",
        "description": "Getir Yemek entegrasyonu", 
        "logo": "getir"
    },
    "migros": {
        "name": "Migros Yemek",
        "description": "Migros Yemek entegrasyonu",
        "logo": "migros"
    }
}


@router.get("/{restaurant_id}/platforms")
async def get_platform_integrations(restaurant_id: str):
    """Tüm platform entegrasyonlarını getir"""
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0, "id": 1, "name": 1, "platform_integrations": 1}
    )
    
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    integrations = restaurant.get("platform_integrations", {})
    
    # Her platform için durum bilgisi döndür
    platforms = []
    for platform_id, platform_info in SUPPORTED_PLATFORMS.items():
        platform_data = integrations.get(platform_id, {})
        platforms.append({
            "id": platform_id,
            "name": platform_info["name"],
            "description": platform_info["description"],
            "enabled": platform_data.get("enabled", False),
            "has_credentials": bool(platform_data.get("api_key")),
            "connected": platform_data.get("connected", False)
        })
    
    return {
        "restaurant_id": restaurant_id,
        "platforms": platforms
    }


@router.get("/{restaurant_id}/platforms/{platform_id}")
async def get_platform_integration(restaurant_id: str, platform_id: str):
    """Belirli bir platform entegrasyonunu getir"""
    if platform_id not in SUPPORTED_PLATFORMS:
        raise HTTPException(status_code=400, detail="Desteklenmeyen platform")
    
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0, "id": 1, "platform_integrations": 1}
    )
    
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    integrations = restaurant.get("platform_integrations", {})
    platform_data = integrations.get(platform_id, {})
    
    return {
        "restaurant_id": restaurant_id,
        "platform": {
            "id": platform_id,
            "name": SUPPORTED_PLATFORMS[platform_id]["name"],
            "enabled": platform_data.get("enabled", False),
            "api_key": mask_secret(platform_data.get("api_key", ""), 4),
            "api_secret": "********" if platform_data.get("api_secret") else "",
            "store_id": platform_data.get("store_id", ""),
            "connected": platform_data.get("connected", False)
        }
    }


@router.put("/{restaurant_id}/platforms/{platform_id}")
async def update_platform_integration(restaurant_id: str, platform_id: str, data: PlatformIntegration):
    """Platform entegrasyonunu güncelle"""
    if platform_id not in SUPPORTED_PLATFORMS:
        raise HTTPException(status_code=400, detail="Desteklenmeyen platform")
    
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0, "id": 1}
    )
    
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    update_data = {
        "enabled": data.enabled,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    if data.api_key is not None:
        update_data["api_key"] = data.api_key
        update_data["connected"] = False
    
    if data.api_secret is not None:
        update_data["api_secret"] = data.api_secret
        update_data["connected"] = False
    
    if data.store_id is not None:
        update_data["store_id"] = data.store_id
    
    await db.restaurants.update_one(
        {"id": restaurant_id},
        {"$set": {f"platform_integrations.{platform_id}": update_data}}
    )
    
    platform_name = SUPPORTED_PLATFORMS[platform_id]["name"]
    return {"message": f"{platform_name} entegrasyon ayarları güncellendi"}


@router.delete("/{restaurant_id}/platforms/{platform_id}")
async def disconnect_platform(restaurant_id: str, platform_id: str):
    """Platform entegrasyonunu kaldır"""
    if platform_id not in SUPPORTED_PLATFORMS:
        raise HTTPException(status_code=400, detail="Desteklenmeyen platform")
    
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0, "id": 1}
    )
    
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    await db.restaurants.update_one(
        {"id": restaurant_id},
        {"$unset": {f"platform_integrations.{platform_id}": ""}}
    )
    
    platform_name = SUPPORTED_PLATFORMS[platform_id]["name"]
    return {"message": f"{platform_name} entegrasyonu kaldırıldı"}
