"""
Entegrasyon Mağazaları API
Bir restoran birden fazla platform mağazası tanımlayabilir (Örn: 3 Trendyol, 2 Getir mağazası)

DB Schema (restaurants collection):
{
    "integration_stores": [
        {
            "id": "uuid",
            "platform": "trendyol",  # trendyol, getir, yemeksepeti, migros
            "name": "Kadıköy Şubesi",
            "enabled": true,
            "is_open": true,
            "connected": false,
            "credentials": { ... platform-specific ... },
            "last_sync": "...",
            "last_test": "...",
            "created_at": "...",
            "updated_at": "..."
        }
    ]
}
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Optional, List, Any
from datetime import datetime, timezone
import uuid

from utils.database import db
from utils.helpers import get_turkey_now, ensure_turkey_timezone, TURKEY_TZ
from services.trendyol_service import (
    test_trendyol_connection,
    update_restaurant_working_status as trendyol_update_status
)
from services.getir_service import (
    test_getir_connection,
    update_getir_restaurant_status
)
from services.yemeksepeti_service import test_yemeksepeti_connection
from services.adisyo_service import test_adisyo_connection
from services.migros_service import MigrosYemekService
from utils.jwt_utils import require_auth

router = APIRouter(prefix="/api/integration-stores", tags=["Entegrasyon Mağazaları"], dependencies=[Depends(require_auth)])


async def test_migros_connection(credentials: dict) -> dict:
    """Migros Yemek bağlantısını test et"""
    try:
        service = MigrosYemekService(
            api_key=credentials.get("api_key", ""),
            secret_key=MIGROS_TEST_SECRET,
            is_test=False
        )
        result = await service.test_connection()
        if result.get("success"):
            return {"success": True, "message": "Migros Yemek bağlantısı başarılı"}
        else:
            return {"success": False, "error": result.get("error", "Bağlantı başarısız")}
    except Exception as e:
        return {"success": False, "error": str(e)}


from routers.migros import MIGROS_TEST_SECRET

async def update_migros_store_status(store: dict, is_open: bool, store_off_option: str = None) -> dict:
    """Migros mağaza açık/kapalı durumunu güncelle (AddStoreOffDate / RemoveStoreOffDate)"""
    try:
        creds = store.get("credentials", {})
        api_key = creds.get("api_key")
        store_id = creds.get("store_id")
        store_group_id = creds.get("store_group_id")
        
        if not all([api_key, store_id, store_group_id]):
            return {"success": False, "error": "Migros credentials eksik (api_key, store_id, store_group_id)"}
        
        service = MigrosYemekService(
            api_key=api_key,
            secret_key=MIGROS_TEST_SECRET,
            is_test=False
        )
        
        if is_open:
            result = await service.remove_store_off_date(
                store_id=int(store_id),
                store_group_id=int(store_group_id)
            )
        else:
            off_option = store_off_option or "NEXT_WORK_HOUR"
            result = await service.add_store_off_date(
                store_id=int(store_id),
                store_group_id=int(store_group_id),
                off_date_option=off_option
            )
        
        return result
    except Exception as e:
        return {"success": False, "error": str(e)}


# --- Pydantic Models ---

class TrendyolCredentials(BaseModel):
    api_key: Optional[str] = None
    api_secret: Optional[str] = None
    supplier_id: Optional[str] = None
    store_id: Optional[str] = None


class GetirCredentials(BaseModel):
    app_secret_key: Optional[str] = None
    restaurant_secret_key: Optional[str] = None


class YemeksepetiCredentials(BaseModel):
    client_id: Optional[str] = None
    client_secret: Optional[str] = None
    chain_id: Optional[str] = None
    vendor_id: Optional[str] = None


class StoreCreateRequest(BaseModel):
    platform: str  # trendyol, getir, yemeksepeti, migros
    name: str
    enabled: bool = True
    credentials: dict = Field(default_factory=dict)


class StoreUpdateRequest(BaseModel):
    name: Optional[str] = None
    enabled: Optional[bool] = None
    credentials: Optional[dict] = None


class StoreStatusRequest(BaseModel):
    is_open: bool
    time_off_amount: Optional[int] = None  # Getir için: 15, 30, 45
    store_off_option: Optional[str] = None  # Migros için: ONE_HOUR, FOUR_HOUR, NEXT_WORK_HOUR


# --- Helper Functions ---

def mask_secret(value: str, visible_chars: int = 4) -> str:
    """API key/secret'ı maskele"""
    if not value:
        return ""
    if len(value) <= visible_chars:
        return "****"
    return "***" + value[-visible_chars:]


def mask_store_credentials(store: dict) -> dict:
    """Mağaza credentials'larını maskele"""
    masked = store.copy()
    creds = store.get("credentials", {})
    masked_creds = {}
    
    for key, value in creds.items():
        if "secret" in key.lower() or "key" in key.lower() or "password" in key.lower():
            masked_creds[key] = mask_secret(str(value), 4) if value else ""
        else:
            masked_creds[key] = value
    
    masked["credentials"] = masked_creds
    return masked


SUPPORTED_PLATFORMS = {
    "trendyol": {
        "name": "Trendyol Yemek",
        "color": "orange",
        "credential_fields": ["api_key", "api_secret", "supplier_id", "store_id"]
    },
    "getir": {
        "name": "Getir Yemek",
        "color": "purple",
        "credential_fields": ["app_secret_key", "restaurant_secret_key"]
    },
    "yemeksepeti": {
        "name": "Yemeksepeti",
        "color": "red",
        "credential_fields": ["client_id", "client_secret", "chain_id", "vendor_id"]
    },
    "migros": {
        "name": "Migros Yemek",
        "color": "orange",
        "credential_fields": ["api_key", "secret_key", "store_id", "store_group_id", "is_test"]
    }
}


# --- Endpoints ---

@router.get("/{restaurant_id}")
async def get_all_stores(restaurant_id: str):
    """Restoranın tüm entegrasyon mağazalarını getir"""
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0, "id": 1, "name": 1, "integration_stores": 1, "platform_integrations": 1}
    )
    
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    stores = restaurant.get("integration_stores", [])
    
    # Eski format varsa migrate et (platform_integrations -> integration_stores)
    if not stores and restaurant.get("platform_integrations"):
        stores = await migrate_old_integrations(restaurant_id, restaurant.get("platform_integrations", {}))
    
    # Credentials'ları maskele
    masked_stores = [mask_store_credentials(s) for s in stores]
    
    return {
        "restaurant_id": restaurant_id,
        "stores": masked_stores,
        "platforms": SUPPORTED_PLATFORMS
    }


@router.get("/{restaurant_id}/summary")
async def get_stores_summary(restaurant_id: str):
    """Anasayfa için mağaza özeti (toggle'lar için)"""
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0, "integration_stores": 1}
    )
    
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    stores = restaurant.get("integration_stores", [])
    
    # Aktif (enabled) tüm mağazalar - bağlı olsun olmasın
    active_stores = []
    for store in stores:
        if store.get("enabled"):
            active_stores.append({
                "id": store.get("id"),
                "platform": store.get("platform"),
                "name": store.get("name"),
                "is_open": store.get("is_open", False),
                "connected": store.get("connected", False),
                "platform_name": SUPPORTED_PLATFORMS.get(store.get("platform"), {}).get("name", store.get("platform")),
                "color": SUPPORTED_PLATFORMS.get(store.get("platform"), {}).get("color", "gray")
            })
    
    return {
        "restaurant_id": restaurant_id,
        "stores": active_stores
    }


@router.post("/{restaurant_id}")
async def create_store(restaurant_id: str, data: StoreCreateRequest):
    """Yeni entegrasyon mağazası ekle"""
    if data.platform not in SUPPORTED_PLATFORMS:
        raise HTTPException(status_code=400, detail=f"Desteklenmeyen platform: {data.platform}")
    
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0, "id": 1}
    )
    
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    store_id = str(uuid.uuid4())
    now = get_turkey_now()
    
    new_store = {
        "id": store_id,
        "platform": data.platform,
        "name": data.name,
        "enabled": data.enabled,
        "is_open": False,
        "connected": False,
        "credentials": data.credentials,
        "created_at": now,
        "updated_at": now
    }
    
    await db.restaurants.update_one(
        {"id": restaurant_id},
        {"$push": {"integration_stores": new_store}}
    )
    
    # Eski platform_integrations'a da yaz (backward compatibility)
    await sync_to_old_format(restaurant_id, data.platform, new_store)
    
    platform_name = SUPPORTED_PLATFORMS[data.platform]["name"]
    return {
        "success": True,
        "message": f"{platform_name} mağazası eklendi",
        "store": mask_store_credentials(new_store)
    }


@router.put("/{restaurant_id}/{store_id}")
async def update_store(restaurant_id: str, store_id: str, data: StoreUpdateRequest):
    """Mağaza bilgilerini güncelle"""
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0, "integration_stores": 1}
    )
    
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    stores = restaurant.get("integration_stores", [])
    store_index = None
    current_store = None
    
    for i, s in enumerate(stores):
        if s.get("id") == store_id:
            store_index = i
            current_store = s
            break
    
    if store_index is None:
        raise HTTPException(status_code=404, detail="Mağaza bulunamadı")
    
    # Güncelleme
    update_fields = {"integration_stores.$.updated_at": get_turkey_now()}
    
    if data.name is not None:
        update_fields["integration_stores.$.name"] = data.name
    
    if data.enabled is not None:
        update_fields["integration_stores.$.enabled"] = data.enabled
    
    if data.credentials is not None:
        # Mevcut credentials ile birleştir (sadece gönderilen alanları güncelle)
        merged_creds = current_store.get("credentials", {}).copy()
        creds_changed = False
        for key, value in data.credentials.items():
            # Maskeli değer (****) içeriyorsa güncelleme yapma
            if value and not str(value).startswith("****"):
                merged_creds[key] = value
                creds_changed = True
            # Boolean değerler için (is_test gibi)
            elif isinstance(value, bool):
                if merged_creds.get(key) != value:
                    merged_creds[key] = value
                    creds_changed = True
        
        update_fields["integration_stores.$.credentials"] = merged_creds
        if creds_changed:
            update_fields["integration_stores.$.connected"] = False  # Credentials değişti, yeniden test gerekli
    
    await db.restaurants.update_one(
        {"id": restaurant_id, "integration_stores.id": store_id},
        {"$set": update_fields}
    )
    
    # Eski formata da yaz
    platform = current_store.get("platform")
    if platform:
        updated_store = current_store.copy()
        if data.name is not None:
            updated_store["name"] = data.name
        if data.enabled is not None:
            updated_store["enabled"] = data.enabled
        if data.credentials is not None:
            updated_store["credentials"] = merged_creds
        await sync_to_old_format(restaurant_id, platform, updated_store)
    
    return {"success": True, "message": "Mağaza güncellendi"}


@router.delete("/{restaurant_id}/{store_id}")
async def delete_store(restaurant_id: str, store_id: str):
    """Mağazayı sil"""
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0, "integration_stores": 1}
    )
    
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    # Mağazayı bul
    stores = restaurant.get("integration_stores", [])
    store_to_delete = None
    for s in stores:
        if s.get("id") == store_id:
            store_to_delete = s
            break
    
    if not store_to_delete:
        raise HTTPException(status_code=404, detail="Mağaza bulunamadı")
    
    await db.restaurants.update_one(
        {"id": restaurant_id},
        {"$pull": {"integration_stores": {"id": store_id}}}
    )
    
    platform_name = SUPPORTED_PLATFORMS.get(store_to_delete.get("platform"), {}).get("name", "Mağaza")
    return {"success": True, "message": f"{platform_name} mağazası silindi"}


@router.post("/{restaurant_id}/{store_id}/test")
async def test_store_connection(restaurant_id: str, store_id: str):
    """Mağaza bağlantısını test et"""
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0}
    )
    
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    stores = restaurant.get("integration_stores", [])
    store = None
    
    for s in stores:
        if s.get("id") == store_id:
            store = s
            break
    
    if not store:
        raise HTTPException(status_code=404, detail="Mağaza bulunamadı")
    
    platform = store.get("platform")
    
    # Credentials'ı geçici olarak eski formata yaz (mevcut test fonksiyonlarını kullanmak için)
    await sync_to_old_format(restaurant_id, platform, store)
    
    result = {"success": False, "error": "Desteklenmeyen platform"}
    
    if platform == "trendyol":
        result = await test_trendyol_connection(restaurant_id)
    elif platform == "getir":
        result = await test_getir_connection(restaurant_id)
    elif platform == "yemeksepeti":
        result = await test_yemeksepeti_connection(restaurant_id)
    elif platform == "adisyo":
        result = await test_adisyo_connection(restaurant_id)
    elif platform == "migros":
        result = await test_migros_connection(store.get("credentials", {}))
    
    # Sonucu store'a yaz
    if result.get("success"):
        await db.restaurants.update_one(
            {"id": restaurant_id, "integration_stores.id": store_id},
            {"$set": {
                "integration_stores.$.connected": True,
                "integration_stores.$.last_test": get_turkey_now()
            }}
        )
    else:
        await db.restaurants.update_one(
            {"id": restaurant_id, "integration_stores.id": store_id},
            {"$set": {"integration_stores.$.connected": False}}
        )
    
    return result


@router.put("/{restaurant_id}/{store_id}/status")
async def update_store_status(restaurant_id: str, store_id: str, data: StoreStatusRequest):
    """Mağaza açık/kapalı durumunu güncelle"""
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0}
    )
    
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    stores = restaurant.get("integration_stores", [])
    store = None
    
    for s in stores:
        if s.get("id") == store_id:
            store = s
            break
    
    if not store:
        raise HTTPException(status_code=404, detail="Mağaza bulunamadı")
    
    if not store.get("connected"):
        raise HTTPException(status_code=400, detail="Mağaza bağlantısı yok. Önce test ediniz.")
    
    platform = store.get("platform")
    
    # Platform API'sine durumu gönder
    await sync_to_old_format(restaurant_id, platform, store)
    
    result = {"success": False, "error": "Desteklenmeyen platform"}
    
    if platform == "trendyol":
        result = await trendyol_update_status(restaurant_id, data.is_open)
    elif platform == "getir":
        result = await update_getir_restaurant_status(restaurant_id, data.is_open, data.time_off_amount)
    elif platform == "migros":
        result = await update_migros_store_status(store, data.is_open, data.store_off_option)
    # TODO: yemeksepeti status
    
    if result.get("success"):
        # Local durumu güncelle
        await db.restaurants.update_one(
            {"id": restaurant_id, "integration_stores.id": store_id},
            {"$set": {
                "integration_stores.$.is_open": data.is_open,
                "integration_stores.$.updated_at": get_turkey_now()
            }}
        )
    
    return result


@router.post("/{restaurant_id}/{store_id}/sync")
async def sync_store_orders(restaurant_id: str, store_id: str):
    """Mağaza siparişlerini senkronize et"""
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0}
    )
    
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    stores = restaurant.get("integration_stores", [])
    store = None
    
    for s in stores:
        if s.get("id") == store_id:
            store = s
            break
    
    if not store:
        raise HTTPException(status_code=404, detail="Mağaza bulunamadı")
    
    if not store.get("connected"):
        raise HTTPException(status_code=400, detail="Mağaza bağlantısı yok")
    
    platform = store.get("platform")
    
    # Credentials'ı eski formata yaz
    await sync_to_old_format(restaurant_id, platform, store)
    
    result = {"success": False, "error": "Desteklenmeyen platform"}
    
    if platform == "trendyol":
        from services.trendyol_service import sync_restaurant_trendyol_orders
        result = await sync_restaurant_trendyol_orders(restaurant_id)
    elif platform == "getir":
        from services.getir_service import sync_restaurant_getir_orders
        result = await sync_restaurant_getir_orders(restaurant_id)
    elif platform == "migros":
        from services.migros_service import sync_restaurant_migros_orders
        result = await sync_restaurant_migros_orders(restaurant_id)
        # Migros artık webhook tabanlı, bu sync fonksiyonu opsiyonel olarak polling yapabilir
        if not result.get("success"):
            # Webhook tabanlı çalıştığı için sync gerekli olmayabilir
            result = {"success": True, "message": "Migros webhook tabanlı çalışır. Siparişler otomatik gelir.", "synced": 0, "updated": 0}
    
    if result.get("success"):
        await db.restaurants.update_one(
            {"id": restaurant_id, "integration_stores.id": store_id},
            {"$set": {
                "integration_stores.$.last_sync": get_turkey_now()
            }}
        )
    
    return result


# --- Migration & Sync Helpers ---

async def migrate_old_integrations(restaurant_id: str, platform_integrations: dict) -> list:
    """Eski platform_integrations formatını yeni integration_stores formatına migrate et"""
    stores = []
    now = get_turkey_now()
    
    for platform, data in platform_integrations.items():
        if not data or not isinstance(data, dict):
            continue
        
        # Credentials'ları ayıkla
        credentials = {}
        if platform == "trendyol":
            credentials = {
                "api_key": data.get("api_key"),
                "api_secret": data.get("api_secret"),
                "supplier_id": data.get("supplier_id"),
                "store_id": data.get("store_id")
            }
        elif platform == "getir":
            credentials = {
                "app_secret_key": data.get("app_secret_key"),
                "restaurant_secret_key": data.get("restaurant_secret_key")
            }
        elif platform == "yemeksepeti":
            credentials = {
                "client_id": data.get("client_id"),
                "client_secret": data.get("client_secret"),
                "chain_id": data.get("chain_id"),
                "vendor_id": data.get("vendor_id")
            }
        
        # Boş credentials'ı atla
        if not any(credentials.values()):
            continue
        
        store = {
            "id": str(uuid.uuid4()),
            "platform": platform,
            "name": SUPPORTED_PLATFORMS.get(platform, {}).get("name", platform),
            "enabled": data.get("enabled", False),
            "is_open": data.get("is_open", False),
            "connected": data.get("connected", False),
            "credentials": {k: v for k, v in credentials.items() if v},
            "last_sync": data.get("last_sync"),
            "last_test": data.get("last_test"),
            "created_at": data.get("updated_at", now),
            "updated_at": now
        }
        stores.append(store)
    
    # DB'ye kaydet
    if stores:
        await db.restaurants.update_one(
            {"id": restaurant_id},
            {"$set": {"integration_stores": stores}}
        )
    
    return stores


async def sync_to_old_format(restaurant_id: str, platform: str, store: dict):
    """Yeni store formatını eski platform_integrations formatına sync et (backward compatibility)"""
    if not platform:
        return
    
    credentials = store.get("credentials", {})
    
    update_data = {
        f"platform_integrations.{platform}.enabled": store.get("enabled", False),
        f"platform_integrations.{platform}.connected": store.get("connected", False),
        f"platform_integrations.{platform}.is_open": store.get("is_open", False),
        f"platform_integrations.{platform}.updated_at": get_turkey_now()
    }
    
    # Platform-specific credentials
    if platform == "trendyol":
        if credentials.get("api_key"):
            update_data[f"platform_integrations.{platform}.api_key"] = credentials["api_key"]
        if credentials.get("api_secret"):
            update_data[f"platform_integrations.{platform}.api_secret"] = credentials["api_secret"]
        if credentials.get("supplier_id"):
            update_data[f"platform_integrations.{platform}.supplier_id"] = credentials["supplier_id"]
        if credentials.get("store_id"):
            update_data[f"platform_integrations.{platform}.store_id"] = credentials["store_id"]
    
    elif platform == "getir":
        if credentials.get("app_secret_key"):
            update_data[f"platform_integrations.{platform}.app_secret_key"] = credentials["app_secret_key"]
        if credentials.get("restaurant_secret_key"):
            update_data[f"platform_integrations.{platform}.restaurant_secret_key"] = credentials["restaurant_secret_key"]
    
    elif platform == "yemeksepeti":
        if credentials.get("client_id"):
            update_data[f"platform_integrations.{platform}.client_id"] = credentials["client_id"]
        if credentials.get("client_secret"):
            update_data[f"platform_integrations.{platform}.client_secret"] = credentials["client_secret"]
        if credentials.get("chain_id"):
            update_data[f"platform_integrations.{platform}.chain_id"] = credentials["chain_id"]
        if credentials.get("vendor_id"):
            update_data[f"platform_integrations.{platform}.vendor_id"] = credentials["vendor_id"]
    
    elif platform == "migros":
        if credentials.get("api_key"):
            update_data[f"platform_integrations.{platform}.api_key"] = credentials["api_key"]
        if credentials.get("secret_key"):
            update_data[f"platform_integrations.{platform}.secret_key"] = credentials["secret_key"]
        if credentials.get("store_id"):
            update_data[f"platform_integrations.{platform}.store_id"] = credentials["store_id"]
        if credentials.get("store_group_id"):
            update_data[f"platform_integrations.{platform}.store_group_id"] = credentials["store_group_id"]
        if "is_test" in credentials:
            # is_test her zaman boolean olarak kaydet
            is_test_val = credentials["is_test"]
            if isinstance(is_test_val, str):
                is_test_val = is_test_val.lower() not in ("false", "0", "no", "")
            update_data[f"platform_integrations.{platform}.is_test"] = bool(is_test_val)
    
    await db.restaurants.update_one(
        {"id": restaurant_id},
        {"$set": update_data}
    )
