"""
Restoranlar API
Restoran CRUD + Adisyo API entegrasyon bilgileri yönetimi
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import uuid

from utils.database import db
from utils.helpers import get_turkey_now, ensure_turkey_timezone, TURKEY_TZ

from utils.jwt_utils import require_auth
router = APIRouter(prefix="/api/restaurants", tags=["Restoranlar"], dependencies=[Depends(require_auth)])


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


# Ücretlendirme modelleri
class KmRange(BaseModel):
    min_km: float
    max_km: Optional[float] = None  # None = sınırsız (10+ km gibi)
    price: float

class PricingUpdate(BaseModel):
    pricing_type: str  # "per_package" veya "per_km"
    per_package_price: Optional[float] = None
    km_ranges: Optional[List[KmRange]] = None
    kdv_rate: Optional[float] = None  # KDV oranı (%), örn: 20 = %20
    pos_commission_rate: Optional[float] = None  # POS komisyonu (%), kredi kartı siparişleri için


# --- Kurye Engelleme --- (Static paths must come before dynamic paths!)
class BlockCourierRequest(BaseModel):
    courier_id: str


@router.get("/blocked/{restaurant_id}")
async def get_blocked_couriers(restaurant_id: str):
    """Restoranda engellenen kuryeleri getir"""
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0, "blocked_couriers": 1}
    )
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    blocked_ids = restaurant.get("blocked_couriers", [])
    
    if not blocked_ids:
        return []
    
    # Kurye bilgilerini getir
    couriers = await db.couriers.find(
        {"id": {"$in": blocked_ids}},
        {"_id": 0, "id": 1, "name": 1, "phone": 1}
    ).to_list(100)
    
    return couriers


@router.post("/block/{restaurant_id}")
async def block_courier(restaurant_id: str, data: BlockCourierRequest):
    """Restorana kurye engelle"""
    restaurant = await db.restaurants.find_one({"id": restaurant_id})
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    courier = await db.couriers.find_one({"id": data.courier_id}, {"_id": 0, "name": 1})
    if not courier:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")
    
    # Engellenen kuryelere ekle
    await db.restaurants.update_one(
        {"id": restaurant_id},
        {"$addToSet": {"blocked_couriers": data.courier_id}}
    )
    
    return {"message": f"{courier['name']} bu restoran için engellendi"}


@router.post("/unblock/{restaurant_id}")
async def unblock_courier(restaurant_id: str, data: BlockCourierRequest):
    """Restorandan kurye engelini kaldır"""
    restaurant = await db.restaurants.find_one({"id": restaurant_id})
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    courier = await db.couriers.find_one({"id": data.courier_id}, {"_id": 0, "name": 1})
    if not courier:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")
    
    # Engellenen kuryelerden çıkar
    await db.restaurants.update_one(
        {"id": restaurant_id},
        {"$pull": {"blocked_couriers": data.courier_id}}
    )
    
    return {"message": f"{courier['name']} için engel kaldırıldı"}


# --- Ücretlendirme (Pricing) --- (Static paths must come before dynamic paths!)
@router.put("/pricing/{restaurant_id}")
async def update_restaurant_pricing(restaurant_id: str, data: PricingUpdate):
    """Restoran ücretlendirme ayarlarını güncelle"""
    restaurant = await db.restaurants.find_one({"id": restaurant_id}, {"_id": 0})
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    if data.pricing_type not in ["per_package", "per_km"]:
        raise HTTPException(status_code=400, detail="Geçersiz ücretlendirme tipi")
    
    update_data = {"pricing_type": data.pricing_type}
    
    if data.pricing_type == "per_package":
        if data.per_package_price is None:
            raise HTTPException(status_code=400, detail="Paket başı fiyat gerekli")
        update_data["per_package_price"] = data.per_package_price
        update_data["km_ranges"] = None
    else:
        if not data.km_ranges or len(data.km_ranges) == 0:
            raise HTTPException(status_code=400, detail="KM aralıkları gerekli")
        update_data["km_ranges"] = [r.dict() for r in data.km_ranges]
        update_data["per_package_price"] = None
    
    # KDV oranını güncelle
    if data.kdv_rate is not None:
        update_data["kdv_rate"] = data.kdv_rate
    
    # POS komisyon oranını güncelle
    if data.pos_commission_rate is not None:
        update_data["pos_commission_rate"] = data.pos_commission_rate
    
    await db.restaurants.update_one(
        {"id": restaurant_id},
        {"$set": update_data}
    )
    
    return {"message": "Ücretlendirme güncellendi"}


@router.get("/pricing/{restaurant_id}")
async def get_restaurant_pricing(restaurant_id: str):
    """Restoran ücretlendirme ayarlarını getir"""
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id}, 
        {"_id": 0, "pricing_type": 1, "per_package_price": 1, "km_ranges": 1, "kdv_rate": 1, "pos_commission_rate": 1}
    )
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    return {
        "pricing_type": restaurant.get("pricing_type"),
        "per_package_price": restaurant.get("per_package_price"),
        "km_ranges": restaurant.get("km_ranges"),
        "kdv_rate": restaurant.get("kdv_rate", 0),
        "pos_commission_rate": restaurant.get("pos_commission_rate", 0)
    }


# --- Hazırlık Süreleri ---
class PreparationTimesUpdate(BaseModel):
    preparation_time: int  # Standart hazırlık süresi (dakika)
    product_preparation_times: Optional[dict] = None  # Ürün bazlı ekstra süreler {product_id: dakika}


@router.put("/{restaurant_id}/preparation-times")
async def update_preparation_times(restaurant_id: str, data: PreparationTimesUpdate):
    """Restoran hazırlık sürelerini güncelle"""
    restaurant = await db.restaurants.find_one({"id": restaurant_id}, {"_id": 0, "id": 1})
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    update_data = {
        "preparation_time": data.preparation_time,
        "updated_at": get_turkey_now()
    }
    
    # Ürün bazlı süreleri kaydet (sadece 0'dan büyük olanları)
    if data.product_preparation_times:
        filtered_times = {k: v for k, v in data.product_preparation_times.items() if v and v > 0}
        update_data["product_preparation_times"] = filtered_times
    else:
        update_data["product_preparation_times"] = {}
    
    await db.restaurants.update_one(
        {"id": restaurant_id},
        {"$set": update_data}
    )
    
    return {"message": "Hazırlık süreleri güncellendi"}


@router.get("/{restaurant_id}/preparation-times")
async def get_preparation_times(restaurant_id: str):
    """Restoran hazırlık sürelerini getir"""
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id}, 
        {"_id": 0, "preparation_time": 1, "product_preparation_times": 1}
    )
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    return {
        "preparation_time": restaurant.get("preparation_time", 15),
        "product_preparation_times": restaurant.get("product_preparation_times", {})
    }


# --- Tahsilat Ayarları ---
class CollectionSettingsUpdate(BaseModel):
    cash_collection: str  # "courier" veya "restaurant"
    card_collection: str  # "courier" veya "restaurant"
    meal_card_collection: str = "courier"  # "courier" veya "restaurant"
    courier_collection_enabled: bool = False  # Kurye Hesap Al özelliği açık/kapalı


@router.get("/collection-settings/{restaurant_id}")
async def get_collection_settings(restaurant_id: str):
    """Restoran tahsilat ayarlarını getir"""
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0, "id": 1, "collection_settings": 1}
    )
    
    if not restaurant or "id" not in restaurant:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    settings = restaurant.get("collection_settings", {})
    
    return {
        "cash_collection": settings.get("cash_collection", "courier"),
        "card_collection": settings.get("card_collection", "courier"),
        "meal_card_collection": settings.get("meal_card_collection", "courier"),
        "courier_collection_enabled": settings.get("courier_collection_enabled", False)
    }


@router.put("/collection-settings/{restaurant_id}")
async def update_collection_settings(restaurant_id: str, data: CollectionSettingsUpdate):
    """Restoran tahsilat ayarlarını güncelle"""
    # Validate values
    valid_options = ["courier", "restaurant"]
    if data.cash_collection not in valid_options:
        raise HTTPException(status_code=400, detail="Geçersiz nakit tahsilat seçeneği")
    if data.card_collection not in valid_options:
        raise HTTPException(status_code=400, detail="Geçersiz kart tahsilat seçeneği")
    if data.meal_card_collection not in valid_options:
        raise HTTPException(status_code=400, detail="Geçersiz yemek kartı tahsilat seçeneği")
    
    result = await db.restaurants.update_one(
        {"id": restaurant_id},
        {"$set": {
            "collection_settings": {
                "cash_collection": data.cash_collection,
                "card_collection": data.card_collection,
                "meal_card_collection": data.meal_card_collection,
                "courier_collection_enabled": data.courier_collection_enabled
            },
            "updated_at": get_turkey_now()
        }}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    return {"message": "Tahsilat ayarları güncellendi"}


# --- CRUD Endpoints ---

@router.get("/{company_id}/matrix")
async def get_restaurants_matrix(company_id: str, include_archived: bool = False):
    """
    Tüm restoranların tüm ayarlarını matrix görünümü için getir.
    Tek API çağrısıyla tüm ayarları döner.
    """
    from routers.restaurant_permissions import PERMISSION_DEFINITIONS
    
    query = {"company_id": company_id}
    if not include_archived:
        query["is_archived"] = {"$ne": True}
    
    restaurants = await db.restaurants.find(query, {"_id": 0}).to_list(500)
    
    # Permission definitions'ı döndür
    permission_defs = [
        {
            "key": key, 
            "label": val["label"], 
            "short_label": val.get("short_label", val["label"][:8]),
            "category": "permission"
        }
        for key, val in PERMISSION_DEFINITIONS.items()
    ]
    
    result = []
    for r in restaurants:
        # Tahsilat ayarları
        collection = r.get("collection_settings", {})
        
        # Fatura ayarları
        invoice = r.get("invoice_settings", {})
        
        # İzinler - default değerlerle birleştir
        current_perms = r.get("permissions", {})
        perms = {}
        for key, definition in PERMISSION_DEFINITIONS.items():
            perms[key] = current_perms.get(key, definition["default"])
        
        # Ücretlendirme
        pricing_type = r.get("pricing_type", "per_package")
        
        result.append({
            "id": r.get("id"),
            "name": r.get("name"),
            "is_archived": r.get("is_archived", False),
            "preparation_time": r.get("preparation_time", 15),
            # Ücretlendirme türü
            "pricing_type": pricing_type,
            # Paket aktarım modu
            "order_transfer_mode": r.get("order_transfer_mode", "auto"),
            # Tahsilat (courier = kurye tahsil eder, restaurant = restoran tahsil eder)
            "collection": {
                "cash": collection.get("cash_collection", "courier"),
                "card": collection.get("card_collection", "courier"),
                "meal_card": collection.get("meal_card_collection", "courier")
            },
            # Fatura (true = fatura kesilecek)
            "invoice": {
                "cash": invoice.get("cash", False),
                "credit_card": invoice.get("credit_card", False),
                "online": invoice.get("online", False),
                "meal_card": invoice.get("meal_card", False),
                "online_meal_card": invoice.get("online_meal_card", False),
                "percentage": invoice.get("percentage", 10),
                "percentage_name": invoice.get("percentage_name", "Yeme-İçme")
            },
            # İzinler
            "permissions": perms
        })
    
    return {
        "restaurants": result,
        "permission_definitions": permission_defs
    }


@router.put("/{company_id}/matrix/bulk-update")
async def bulk_update_restaurant_settings(company_id: str, updates: List[dict]):
    """
    Birden fazla restoran ayarını tek seferde güncelle.
    Her update: { restaurant_id, setting_type, setting_key, value }
    setting_type: "collection" | "invoice" | "permission" | "transfer_mode"
    """
    results = []
    
    for update in updates:
        restaurant_id = update.get("restaurant_id")
        setting_type = update.get("setting_type")
        setting_key = update.get("setting_key")
        value = update.get("value")
        
        try:
            if setting_type == "collection":
                # Tahsilat ayarı
                await db.restaurants.update_one(
                    {"id": restaurant_id, "company_id": company_id},
                    {"$set": {f"collection_settings.{setting_key}_collection": value}}
                )
            elif setting_type == "invoice":
                # Fatura ayarı
                await db.restaurants.update_one(
                    {"id": restaurant_id, "company_id": company_id},
                    {"$set": {f"invoice_settings.{setting_key}": value}}
                )
            elif setting_type == "permission":
                # İzin ayarı
                await db.restaurants.update_one(
                    {"id": restaurant_id, "company_id": company_id},
                    {"$set": {f"permissions.{setting_key}": value}}
                )
            elif setting_type == "transfer_mode":
                # Paket aktarım modu
                await db.restaurants.update_one(
                    {"id": restaurant_id, "company_id": company_id},
                    {"$set": {"order_transfer_mode": value}}
                )
            
            results.append({"restaurant_id": restaurant_id, "success": True})
        except Exception as e:
            results.append({"restaurant_id": restaurant_id, "success": False, "error": str(e)})
    
    return {"results": results}


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
    # Varsayılan tahsilat ayarları
    default_collection_settings = {
        "cash_collection": "courier",      # Nakit: Kurye
        "card_collection": "courier",      # Kart: Kurye
        "meal_card_collection": "restaurant"  # Y.Kartı: Restoran
    }
    
    # Varsayılan fatura ayarları (sadece kredi kartı açık)
    default_invoice_settings = {
        "cash": False,
        "credit_card": True,  # Sadece kredi kartı açık
        "online": False,
        "meal_card": False,
        "online_meal_card": False,
        "percentage": 10,
        "percentage_name": "Yeme-İçme"
    }
    
    # Varsayılan izinler (hepsi aktif)
    default_permissions = {
        "can_assign_courier": True,           # K.Atama: aktif
        "can_view_courier_phone": True,       # K.Tel: aktif
        "can_view_courier_location": True,    # K.Konum: aktif
        "can_view_courier_eta": True,         # K.ETA: aktif
        "can_mark_restaurant_delivery": True, # R.Tslm: aktif
        "can_change_order_status": True       # S.Durum: aktif
    }
    
    restaurant = {
        "id": str(uuid.uuid4()),
        "name": data.name,
        "phone": data.phone,
        "address": data.address,
        "latitude": data.latitude,
        "longitude": data.longitude,
        "company_id": data.company_id,
        "preparation_time": data.preparation_time,  # Hazırlık süresi (dakika)
        "pricing_type": "per_package",  # Varsayılan ücretlendirme türü
        "order_transfer_mode": "auto",  # Varsayılan: otomatik aktarım
        "adisyo_api_key": data.adisyo_api_key,
        "adisyo_api_secret": data.adisyo_api_secret,
        "adisyo_branch_id": data.adisyo_branch_id,
        "adisyo_connected": False,  # Bağlantı test edilince True olacak
        "is_active": True,
        "is_archived": False,
        "collection_settings": default_collection_settings,
        "invoice_settings": default_invoice_settings,
        "permissions": default_permissions,
        "created_at": get_turkey_now()
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
    if data.preparation_time is not None:
        update_fields["preparation_time"] = data.preparation_time
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
    
    update_fields["updated_at"] = get_turkey_now()
    
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
        {"$set": {"is_archived": True, "updated_at": get_turkey_now()}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    return {"message": "Restoran arşivlendi"}


@router.put("/{restaurant_id}/unarchive")
async def unarchive_restaurant(restaurant_id: str):
    """Restoranı arşivden çıkar"""
    result = await db.restaurants.update_one(
        {"id": restaurant_id},
        {"$set": {"is_archived": False, "updated_at": get_turkey_now()}}
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


# --- Paket Aktarım Modu Güncelleme ---
@router.put("/{restaurant_id}/order-transfer-mode")
async def update_order_transfer_mode(restaurant_id: str, mode: str):
    """Restoran paket aktarım modunu güncelle (auto/manual)"""
    if mode not in ["auto", "manual"]:
        raise HTTPException(status_code=400, detail="Geçersiz mod. 'auto' veya 'manual' olmalı")
    
    result = await db.restaurants.update_one(
        {"id": restaurant_id},
        {"$set": {"order_transfer_mode": mode, "updated_at": get_turkey_now()}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Restoran bulunamadı")
    
    return {"message": "Paket aktarım modu güncellendi", "mode": mode}




# --- Adisyo API Bağlantı Test ---
@router.post("/{restaurant_id}/test-adisyo")
async def test_adisyo_connection_endpoint(restaurant_id: str):
    """Adisyo API bağlantısını test et"""
    from services.adisyo_service import test_adisyo_connection
    
    result = await test_adisyo_connection(restaurant_id)
    
    if result["success"]:
        # Bağlantı başarılı, veritabanını güncelle
        await db.restaurants.update_one(
            {"id": restaurant_id},
            {"$set": {
                "adisyo_connected": True,
                "adisyo_last_test": get_turkey_now()
            }}
        )
        return {"message": "Adisyo bağlantısı başarılı", "connected": True}
    else:
        # Bağlantı başarısız
        await db.restaurants.update_one(
            {"id": restaurant_id},
            {"$set": {
                "adisyo_connected": False,
                "adisyo_last_test": get_turkey_now(),
                "adisyo_last_error": result["error"]
            }}
        )
        raise HTTPException(status_code=400, detail=result["error"])


@router.post("/{restaurant_id}/sync-adisyo")
async def sync_adisyo_orders_endpoint(restaurant_id: str):
    """Restoran için Adisyo siparişlerini senkronize et"""
    from services.adisyo_service import sync_restaurant_orders
    
    result = await sync_restaurant_orders(restaurant_id)
    
    if result["success"]:
        return {
            "message": f"{result['synced']} yeni sipariş eklendi",
            "synced": result["synced"],
            "skipped": result.get("skipped", 0),
            "total": result.get("total", 0)
        }
    else:
        raise HTTPException(status_code=400, detail=result["error"])


@router.post("/company/{company_id}/sync-adisyo")
async def sync_all_adisyo_orders_endpoint(company_id: str):
    """Şirketteki tüm restoranların Adisyo siparişlerini senkronize et"""
    from services.adisyo_service import sync_all_company_orders
    
    result = await sync_all_company_orders(company_id)
    
    return {
        "message": f"Toplam {result['total_synced']} sipariş senkronize edildi",
        "total_synced": result["total_synced"],
        "restaurants": result["restaurants"]
    }


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
