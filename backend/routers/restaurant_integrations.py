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
from services.getir_service import (
    test_getir_connection,
    sync_restaurant_getir_orders,
    verify_getir_order,
    prepare_getir_order,
    handover_getir_order,
    deliver_getir_order,
    cancel_getir_order,
    update_getir_restaurant_status
)
from services.yemeksepeti_service import (
    test_yemeksepeti_connection,
    update_yemeksepeti_order_status,
    cancel_yemeksepeti_order,
    get_yemeksepeti_order,
    generate_webhook_url
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


class GetirIntegration(BaseModel):
    enabled: bool = False
    app_secret_key: Optional[str] = None
    restaurant_secret_key: Optional[str] = None


class GetirWorkingStatus(BaseModel):
    is_open: bool
    time_off_amount: Optional[int] = None  # 15, 30, 45 dakika


class GetirCancelOrder(BaseModel):
    cancel_reason_id: Optional[str] = None
    cancel_note: Optional[str] = None


class YemeksepetiIntegration(BaseModel):
    enabled: bool = False
    client_id: Optional[str] = None
    client_secret: Optional[str] = None
    chain_id: Optional[str] = None
    vendor_id: Optional[str] = None
    webhook_secret: Optional[str] = None


class YemeksepetiCancelOrder(BaseModel):
    reason: str = "TOO_BUSY"  # CLOSED, ITEM_UNAVAILABLE, TOO_BUSY


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


# --- Trendyol Özel Endpoint'ler ---

@router.get("/{restaurant_id}/trendyol")
async def get_trendyol_integration(restaurant_id: str):
    """Restoran Trendyol entegrasyon ayarlarını getir"""
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0, "id": 1, "name": 1, "platform_integrations.trendyol": 1}
    )
    
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    integration = restaurant.get("platform_integrations", {}).get("trendyol", {})
    
    return {
        "restaurant_id": restaurant_id,
        "restaurant_name": restaurant.get("name"),
        "trendyol": {
            "enabled": integration.get("enabled", False),
            "connected": integration.get("connected", False),
            "api_key": mask_secret(integration.get("api_key", ""), 4),
            "api_secret": "********" if integration.get("api_secret") else "",
            "supplier_id": integration.get("supplier_id", ""),
            "store_id": integration.get("store_id", ""),
            "is_open": integration.get("is_open"),
            "last_sync": integration.get("last_sync"),
            "last_test": integration.get("last_test"),
            "has_credentials": bool(
                integration.get("api_key") and 
                integration.get("api_secret") and 
                integration.get("supplier_id")
            )
        }
    }


@router.put("/{restaurant_id}/trendyol")
async def update_trendyol_integration(restaurant_id: str, data: TrendyolIntegration):
    """Restoran Trendyol entegrasyon ayarlarını güncelle"""
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0, "id": 1}
    )
    
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    update_fields = {
        "platform_integrations.trendyol.enabled": data.enabled,
        "platform_integrations.trendyol.updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Sadece gönderilen alanları güncelle
    if data.api_key is not None:
        update_fields["platform_integrations.trendyol.api_key"] = data.api_key
        update_fields["platform_integrations.trendyol.connected"] = False  # Yeni key girilince bağlantı sıfırlanır
    
    if data.api_secret is not None:
        update_fields["platform_integrations.trendyol.api_secret"] = data.api_secret
        update_fields["platform_integrations.trendyol.connected"] = False
    
    if data.supplier_id is not None:
        update_fields["platform_integrations.trendyol.supplier_id"] = data.supplier_id
    
    if data.store_id is not None:
        update_fields["platform_integrations.trendyol.store_id"] = data.store_id
    
    await db.restaurants.update_one(
        {"id": restaurant_id},
        {"$set": update_fields}
    )
    
    return {"message": "Trendyol entegrasyon ayarları güncellendi"}


@router.post("/{restaurant_id}/trendyol/test")
async def test_trendyol_connection_endpoint(restaurant_id: str):
    """Trendyol bağlantısını test et"""
    result = await test_trendyol_connection(restaurant_id)
    
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    
    return result


@router.post("/{restaurant_id}/trendyol/sync")
async def sync_trendyol_orders_endpoint(restaurant_id: str):
    """Trendyol siparişlerini senkronize et"""
    result = await sync_restaurant_trendyol_orders(restaurant_id)
    
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    
    return result


@router.put("/{restaurant_id}/trendyol/working-status")
async def update_trendyol_working_status(restaurant_id: str, data: TrendyolWorkingStatus):
    """Trendyol'da restoran çalışma durumunu güncelle"""
    result = await update_restaurant_working_status(restaurant_id, data.is_open)
    
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    
    return result


@router.delete("/{restaurant_id}/trendyol")
async def disconnect_trendyol(restaurant_id: str):
    """Trendyol entegrasyonunu kaldır"""
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0, "id": 1}
    )
    
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    await db.restaurants.update_one(
        {"id": restaurant_id},
        {"$unset": {"platform_integrations.trendyol": ""}}
    )
    
    return {"message": "Trendyol entegrasyonu kaldırıldı"}


# --- Trendyol Sipariş Durum Güncelleme ---

@router.post("/{restaurant_id}/trendyol/orders/{order_id}/accept")
async def accept_trendyol_order_endpoint(restaurant_id: str, order_id: str, preparation_time: int = 20):
    """Trendyol siparişini kabul et"""
    result = await accept_trendyol_order(restaurant_id, order_id, preparation_time)
    
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    
    return result


@router.post("/{restaurant_id}/trendyol/orders/{order_id}/ready")
async def mark_trendyol_ready_endpoint(restaurant_id: str, order_id: str):
    """Trendyol siparişini hazır olarak işaretle"""
    result = await mark_trendyol_order_ready(restaurant_id, order_id)
    
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    
    return result


@router.post("/{restaurant_id}/trendyol/orders/{order_id}/shipped")
async def mark_trendyol_shipped_endpoint(restaurant_id: str, order_id: str):
    """Trendyol siparişini yola çıktı olarak işaretle (Model 1)"""
    result = await mark_trendyol_order_shipped(restaurant_id, order_id)
    
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    
    return result


@router.post("/{restaurant_id}/trendyol/orders/{order_id}/delivered")
async def mark_trendyol_delivered_endpoint(restaurant_id: str, order_id: str):
    """Trendyol siparişini teslim edildi olarak işaretle (Model 1)"""
    result = await mark_trendyol_order_delivered(restaurant_id, order_id)
    
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    
    return result


@router.post("/{restaurant_id}/trendyol/orders/{order_id}/cancel")
async def cancel_trendyol_order_endpoint(restaurant_id: str, order_id: str, data: TrendyolCancelOrder = None):
    """Trendyol siparişini iptal et"""
    reason_id = data.reason_id if data else 625
    result = await cancel_trendyol_order(restaurant_id, order_id, reason_id)
    
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    
    return result


# --- Getir Yemek Endpoint'leri ---

@router.get("/{restaurant_id}/getir")
async def get_getir_integration(restaurant_id: str):
    """Restoran Getir entegrasyon ayarlarını getir"""
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0, "id": 1, "name": 1, "platform_integrations.getir": 1}
    )
    
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    integration = restaurant.get("platform_integrations", {}).get("getir", {})
    
    return {
        "restaurant_id": restaurant_id,
        "restaurant_name": restaurant.get("name"),
        "getir": {
            "enabled": integration.get("enabled", False),
            "connected": integration.get("connected", False),
            "app_secret_key": mask_secret(integration.get("app_secret_key", ""), 4),
            "restaurant_secret_key": "********" if integration.get("restaurant_secret_key") else "",
            "is_open": integration.get("is_open"),
            "last_sync": integration.get("last_sync"),
            "last_test": integration.get("last_test"),
            "has_credentials": bool(
                integration.get("app_secret_key") and 
                integration.get("restaurant_secret_key")
            )
        }
    }


@router.put("/{restaurant_id}/getir")
async def update_getir_integration(restaurant_id: str, data: GetirIntegration):
    """Restoran Getir entegrasyon ayarlarını güncelle"""
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0, "id": 1}
    )
    
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    update_fields = {
        "platform_integrations.getir.enabled": data.enabled,
        "platform_integrations.getir.updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    if data.app_secret_key is not None:
        update_fields["platform_integrations.getir.app_secret_key"] = data.app_secret_key
        update_fields["platform_integrations.getir.connected"] = False
        update_fields["platform_integrations.getir.token"] = None
        update_fields["platform_integrations.getir.token_expires"] = None
    
    if data.restaurant_secret_key is not None:
        update_fields["platform_integrations.getir.restaurant_secret_key"] = data.restaurant_secret_key
        update_fields["platform_integrations.getir.connected"] = False
        update_fields["platform_integrations.getir.token"] = None
        update_fields["platform_integrations.getir.token_expires"] = None
    
    await db.restaurants.update_one(
        {"id": restaurant_id},
        {"$set": update_fields}
    )
    
    return {"message": "Getir entegrasyon ayarları güncellendi"}


@router.post("/{restaurant_id}/getir/test")
async def test_getir_connection_endpoint(restaurant_id: str):
    """Getir bağlantısını test et"""
    result = await test_getir_connection(restaurant_id)
    
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    
    return result


@router.post("/{restaurant_id}/getir/sync")
async def sync_getir_orders_endpoint(restaurant_id: str):
    """Getir siparişlerini senkronize et"""
    result = await sync_restaurant_getir_orders(restaurant_id)
    
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    
    return result


@router.put("/{restaurant_id}/getir/working-status")
async def update_getir_working_status(restaurant_id: str, data: GetirWorkingStatus):
    """Getir'de restoran çalışma durumunu güncelle"""
    result = await update_getir_restaurant_status(restaurant_id, data.is_open, data.time_off_amount)
    
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    
    return result


@router.delete("/{restaurant_id}/getir")
async def disconnect_getir(restaurant_id: str):
    """Getir entegrasyonunu kaldır"""
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0, "id": 1}
    )
    
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    await db.restaurants.update_one(
        {"id": restaurant_id},
        {"$unset": {"platform_integrations.getir": ""}}
    )
    
    return {"message": "Getir entegrasyonu kaldırıldı"}


# --- Getir Sipariş Durum Güncelleme ---

@router.post("/{restaurant_id}/getir/orders/{order_id}/verify")
async def verify_getir_order_endpoint(restaurant_id: str, order_id: str):
    """Getir siparişini onayla"""
    result = await verify_getir_order(restaurant_id, order_id)
    
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    
    return result


@router.post("/{restaurant_id}/getir/orders/{order_id}/prepare")
async def prepare_getir_order_endpoint(restaurant_id: str, order_id: str):
    """Getir siparişini hazırlanıyor olarak işaretle"""
    result = await prepare_getir_order(restaurant_id, order_id)
    
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    
    return result


@router.post("/{restaurant_id}/getir/orders/{order_id}/handover")
async def handover_getir_order_endpoint(restaurant_id: str, order_id: str):
    """Getir siparişini kuryeye teslim et"""
    result = await handover_getir_order(restaurant_id, order_id)
    
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    
    return result


@router.post("/{restaurant_id}/getir/orders/{order_id}/deliver")
async def deliver_getir_order_endpoint(restaurant_id: str, order_id: str):
    """Getir siparişini teslim edildi olarak işaretle"""
    result = await deliver_getir_order(restaurant_id, order_id)
    
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    
    return result


@router.post("/{restaurant_id}/getir/orders/{order_id}/cancel")
async def cancel_getir_order_endpoint(restaurant_id: str, order_id: str, data: GetirCancelOrder = None):
    """Getir siparişini iptal et"""
    cancel_reason_id = data.cancel_reason_id if data else None
    cancel_note = data.cancel_note if data else None
    result = await cancel_getir_order(restaurant_id, order_id, cancel_reason_id, cancel_note)
    
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    
    return result


# --- Yemeksepeti Endpoint'leri ---

@router.get("/{restaurant_id}/yemeksepeti")
async def get_yemeksepeti_integration(restaurant_id: str):
    """Restoran Yemeksepeti entegrasyon ayarlarını getir"""
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0, "id": 1, "name": 1, "platform_integrations.yemeksepeti": 1}
    )
    
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    integration = restaurant.get("platform_integrations", {}).get("yemeksepeti", {})
    
    # Webhook URL oluştur
    # Base URL'i environment'tan al veya default kullan
    import os
    base_url = os.environ.get("WEBHOOK_BASE_URL", os.environ.get("REACT_APP_BACKEND_URL", ""))
    webhook_url = generate_webhook_url(restaurant_id, base_url) if integration.get("vendor_id") else ""
    
    return {
        "restaurant_id": restaurant_id,
        "restaurant_name": restaurant.get("name"),
        "yemeksepeti": {
            "enabled": integration.get("enabled", False),
            "connected": integration.get("connected", False),
            "client_id": mask_secret(integration.get("client_id", ""), 4),
            "client_secret": "********" if integration.get("client_secret") else "",
            "chain_id": integration.get("chain_id", ""),
            "vendor_id": integration.get("vendor_id", ""),
            "webhook_url": webhook_url,
            "last_test": integration.get("last_test"),
            "has_credentials": bool(
                integration.get("client_id") and 
                integration.get("client_secret") and
                integration.get("chain_id")
            )
        }
    }


@router.put("/{restaurant_id}/yemeksepeti")
async def update_yemeksepeti_integration(restaurant_id: str, data: YemeksepetiIntegration):
    """Restoran Yemeksepeti entegrasyon ayarlarını güncelle"""
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0, "id": 1}
    )
    
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    update_fields = {
        "platform_integrations.yemeksepeti.enabled": data.enabled,
        "platform_integrations.yemeksepeti.updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    if data.client_id is not None:
        update_fields["platform_integrations.yemeksepeti.client_id"] = data.client_id
        update_fields["platform_integrations.yemeksepeti.connected"] = False
        update_fields["platform_integrations.yemeksepeti.access_token"] = None
        update_fields["platform_integrations.yemeksepeti.token_expires"] = None
    
    if data.client_secret is not None:
        update_fields["platform_integrations.yemeksepeti.client_secret"] = data.client_secret
        update_fields["platform_integrations.yemeksepeti.connected"] = False
        update_fields["platform_integrations.yemeksepeti.access_token"] = None
        update_fields["platform_integrations.yemeksepeti.token_expires"] = None
    
    if data.chain_id is not None:
        update_fields["platform_integrations.yemeksepeti.chain_id"] = data.chain_id
    
    if data.vendor_id is not None:
        update_fields["platform_integrations.yemeksepeti.vendor_id"] = data.vendor_id
    
    if data.webhook_secret is not None:
        update_fields["platform_integrations.yemeksepeti.webhook_secret"] = data.webhook_secret
    
    await db.restaurants.update_one(
        {"id": restaurant_id},
        {"$set": update_fields}
    )
    
    return {"message": "Yemeksepeti entegrasyon ayarları güncellendi"}


@router.post("/{restaurant_id}/yemeksepeti/test")
async def test_yemeksepeti_connection_endpoint(restaurant_id: str):
    """Yemeksepeti bağlantısını test et"""
    result = await test_yemeksepeti_connection(restaurant_id)
    
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    
    return result


@router.delete("/{restaurant_id}/yemeksepeti")
async def disconnect_yemeksepeti(restaurant_id: str):
    """Yemeksepeti entegrasyonunu kaldır"""
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0, "id": 1}
    )
    
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    await db.restaurants.update_one(
        {"id": restaurant_id},
        {"$unset": {"platform_integrations.yemeksepeti": ""}}
    )
    
    return {"message": "Yemeksepeti entegrasyonu kaldırıldı"}


# --- Yemeksepeti Sipariş Durum Güncelleme ---

@router.post("/{restaurant_id}/yemeksepeti/orders/{order_id}/ready")
async def mark_yemeksepeti_ready_endpoint(restaurant_id: str, order_id: str):
    """Yemeksepeti siparişini hazır olarak işaretle"""
    result = await update_yemeksepeti_order_status(restaurant_id, order_id, "ready")
    
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    
    return result


@router.post("/{restaurant_id}/yemeksepeti/orders/{order_id}/dispatched")
async def mark_yemeksepeti_dispatched_endpoint(restaurant_id: str, order_id: str):
    """Yemeksepeti siparişini yola çıktı olarak işaretle (Vendor Delivery)"""
    result = await update_yemeksepeti_order_status(restaurant_id, order_id, "on_the_way")
    
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    
    return result


@router.post("/{restaurant_id}/yemeksepeti/orders/{order_id}/cancel")
async def cancel_yemeksepeti_order_endpoint(restaurant_id: str, order_id: str, data: YemeksepetiCancelOrder = None):
    """Yemeksepeti siparişini iptal et"""
    reason = data.reason if data else "TOO_BUSY"
    result = await cancel_yemeksepeti_order(restaurant_id, order_id, reason)
    
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    
    return result


@router.get("/{restaurant_id}/yemeksepeti/orders/{ys_order_id}")
async def get_yemeksepeti_order_endpoint(restaurant_id: str, ys_order_id: str):
    """Yemeksepeti'den sipariş detayı getir (son 60 gün)"""
    result = await get_yemeksepeti_order(restaurant_id, ys_order_id)
    
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    
    return result
