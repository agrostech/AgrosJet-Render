"""
SepetTakip Kurye Entegrasyonu API Endpoints

SepetTakip, siparişlerin otomatik olarak kurye firmalarına iletilmesini sağlar.
Bu modül, SepetTakip'in bizim sistemimize istek göndereceği endpoint'leri içerir.

Endpoints:
- /check-credentials: Restoran kimlik doğrulama
- /create-package: Sipariş oluşturma
- /cancel-package: Sipariş iptali
"""
from fastapi import APIRouter, HTTPException, Request, Header
from pydantic import BaseModel, Field
from typing import Optional, List
import logging
import os
import httpx
from datetime import datetime, timezone

from utils.database import db

router = APIRouter(prefix="/api/sepettakip", tags=["SepetTakip"])
logger = logging.getLogger(__name__)

# SepetTakip API Kimlik Bilgileri
COURIER_COMPANY_KEY = os.environ.get("SEPETTAKIP_COURIER_KEY", "agrosjet")
SEPETTAKIP_API_KEY = os.environ.get("SEPETTAKIP_API_KEY", "4dd744ca-001e-44be-b17c-0178b0d3f704")
SEPETTAKIP_TEST_RESTAURANT_ID = "934"

# SepetTakip API Base URL
SEPETTAKIP_API_BASE = "https://api.sepettakip.com/api/v1"


# ==================== PYDANTIC MODELS ====================

class CheckCredentialsRequest(BaseModel):
    username: str
    password: str


class AuthInfo(BaseModel):
    username: str
    password: str


class PaymentTypeInfo(BaseModel):
    key: str
    method: str


class AddressInfo(BaseModel):
    neighborhood: Optional[str] = None
    address: str
    building_no: Optional[str] = None
    floor: Optional[str] = None
    door_number: Optional[str] = None
    town: str
    city: str
    description: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class CustomerInfo(BaseModel):
    full_name: str
    phone_number: str


class ProductInfo(BaseModel):
    quantity: int
    price: float
    name: str
    note: Optional[str] = None
    total_price: float


class RestaurantInfo(BaseModel):
    id: str
    name: str


class OrderInfo(BaseModel):
    order_id: str
    platform: str
    preparation_time: Optional[int] = None
    note: Optional[str] = None
    amount: float
    is_paid: bool
    payment_type: PaymentTypeInfo
    address: AddressInfo
    customer: CustomerInfo
    products: List[ProductInfo]


class CreatePackageRequest(BaseModel):
    auth: AuthInfo
    restaurant: RestaurantInfo
    order: OrderInfo


class CancelPackageRequest(BaseModel):
    order_id: str


# ==================== HELPER FUNCTIONS ====================

async def verify_sepettakip_api_key(api_key: str) -> bool:
    """
    Sepettakip'ten gelen API Key'i doğrula.
    """
    if not api_key:
        return False
    
    # API Key doğrulama
    if api_key == SEPETTAKIP_API_KEY:
        return True
    
    # Header formatında gelebilir
    if api_key.replace("Bearer ", "") == SEPETTAKIP_API_KEY:
        return True
    
    return False


async def verify_restaurant_credentials(username: str, password: str) -> dict:
    """
    Restoran kimlik bilgilerini doğrula.
    username: Restoran ID veya benzersiz tanımlayıcı
    password: Restoran için oluşturulan şifre
    """
    # Restoran ara - sepettakip_credentials alanına bak
    restaurant = await db.restaurants.find_one(
        {
            "$or": [
                {"sepettakip_credentials.username": username},
                {"id": username}  # ID ile de eşleşebilir
            ]
        },
        {"_id": 0}
    )
    
    if not restaurant:
        return {"valid": False, "restaurant": None, "error": "Restoran bulunamadı"}
    
    # Şifre kontrolü
    stored_password = restaurant.get("sepettakip_credentials", {}).get("password")
    
    if stored_password and stored_password != password:
        return {"valid": False, "restaurant": None, "error": "Şifre hatalı"}
    
    return {"valid": True, "restaurant": restaurant}


def map_sepettakip_payment(payment_key: str) -> str:
    """SepetTakip ödeme tipini ShiftJet formatına çevir"""
    payment_map = {
        # Nakit
        "cash": "cash",
        # Kredi Kartı
        "card": "card",
        "pos": "card",
        "onlinecard": "online",
        "bkm": "online",
        "garantipay": "online",
        "moneypay": "online",
        # Yemek Kartları
        "ticket": "meal_card",
        "multinet": "meal_card",
        "setcard": "meal_card",
        "sodexo": "meal_card",
        "metropol": "meal_card",
        "smarticket": "meal_card",
        "tokenflex": "meal_card",
        "winwin": "meal_card",
        "yemekmatik": "meal_card",
        # Online Yemek Kartları
        "sodexomobile": "online_meal_card",
        "sodexoonline": "online_meal_card",
        "edenredonline": "online_meal_card",
        "tokenflexonline": "online_meal_card",
        # Diğer Online
        "paye": "online",
        "sepetpara": "online",
        "cio": "online",
        "debt": "online"
    }
    return payment_map.get(payment_key.lower(), "online")


def map_sepettakip_platform(platform: str) -> str:
    """SepetTakip platform adını ShiftJet formatına çevir"""
    platform_map = {
        "gofody": "Gofody",
        "yemeksepeti": "Yemeksepeti",
        "getir": "Getir Yemek",
        "trendyol": "Trendyol Yemek",
        "sepetapp": "Sepetapp",
        "migros": "Migros Yemek",
        "fuudy": "Fuudy",
        "callerid": "Telefon",
        "whatsapp": "WhatsApp"
    }
    return platform_map.get(platform.lower(), platform)


# ==================== API ENDPOINTS ====================

@router.post("/check-credentials")
async def check_credentials(
    request: CheckCredentialsRequest,
    api_key: Optional[str] = Header(None, alias="Api-Key")
):
    """
    Restoran Kimlik Doğrulama
    
    Restoranın Sepettakip paneline girdiği entegrasyon bilgilerinin doğrulanması.
    Bu adım başarılı olmadan sipariş akışı başlatılamaz.
    """
    logger.info(f"SepetTakip check-credentials: username={request.username}")
    
    # API Key kontrolü
    if not await verify_sepettakip_api_key(api_key):
        logger.warning("SepetTakip check-credentials: Geçersiz API Key")
        raise HTTPException(status_code=401, detail="Geçersiz API Key")
    
    # Restoran doğrulama
    result = await verify_restaurant_credentials(request.username, request.password)
    
    if not result["valid"]:
        logger.warning(f"SepetTakip check-credentials: Doğrulama başarısız - {result['error']}")
        raise HTTPException(status_code=400, detail=result["error"])
    
    logger.info(f"SepetTakip check-credentials: Başarılı - restaurant={result['restaurant'].get('name')}")
    return {"status": True, "message": "Kimlik bilgileri doğrulandı"}


@router.post("/create-package")
async def create_package(
    request: CreatePackageRequest,
    api_key: Optional[str] = Header(None, alias="Api-Key")
):
    """
    Paket/Sipariş Oluşturma
    
    Sepettakip'ten gelen sipariş bilgilerini alarak sistemde kayıt açar.
    Sipariş "Hazırlanıyor" statüsüne geçtiğinde veya restoran manuel tetiklediğinde çağrılır.
    """
    logger.info(f"SepetTakip create-package: order_id={request.order.order_id}, platform={request.order.platform}")
    
    # API Key kontrolü
    if not await verify_sepettakip_api_key(api_key):
        logger.warning("SepetTakip create-package: Geçersiz API Key")
        raise HTTPException(status_code=401, detail="Geçersiz API Key")
    
    # Restoran doğrulama
    auth_result = await verify_restaurant_credentials(request.auth.username, request.auth.password)
    
    if not auth_result["valid"]:
        logger.warning(f"SepetTakip create-package: Restoran doğrulama başarısız")
        return {
            "status": False,
            "error_code": "unauthorized_access",
            "message": "Yetkisiz Erişim - API anahtarı veya şifre hatalı"
        }
    
    restaurant = auth_result["restaurant"]
    
    # Aynı sipariş zaten var mı kontrol et
    existing = await db.orders.find_one({"sepettakip_order_id": request.order.order_id})
    if existing:
        logger.info(f"SepetTakip create-package: Sipariş zaten mevcut - order_id={request.order.order_id}")
        return {"status": True, "message": "Sipariş zaten mevcut"}
    
    # Koordinat kontrolü
    if not request.order.address.latitude or not request.order.address.longitude:
        logger.warning(f"SepetTakip create-package: Koordinat bilgisi eksik")
        # Koordinat olmadan da kabul edebiliriz
    
    # Adresi birleştir
    address_parts = []
    if request.order.address.neighborhood:
        address_parts.append(request.order.address.neighborhood)
    if request.order.address.address:
        address_parts.append(request.order.address.address)
    if request.order.address.building_no:
        address_parts.append(f"No: {request.order.address.building_no}")
    if request.order.address.floor:
        address_parts.append(f"Kat: {request.order.address.floor}")
    if request.order.address.door_number:
        address_parts.append(f"Daire: {request.order.address.door_number}")
    address_parts.append(f"{request.order.address.town}/{request.order.address.city}")
    
    full_address = ", ".join(filter(None, address_parts))
    
    # Ürünleri dönüştür
    items = []
    for product in request.order.products:
        items.append({
            "name": product.name,
            "quantity": product.quantity,
            "price": product.price,
            "notes": product.note or ""
        })
    
    # Sipariş notları
    notes_parts = []
    if request.order.note:
        notes_parts.append(f"CUSTOMER:{request.order.note}")
    if request.order.address.description:
        notes_parts.append(f"ADDRESS:{request.order.address.description}")
    
    # Yeni sipariş oluştur
    import uuid
    new_order = {
        "id": str(uuid.uuid4()),
        "order_number": f"ST-{request.order.order_id}",
        "sepettakip_order_id": request.order.order_id,
        "external_app_name": map_sepettakip_platform(request.order.platform),
        "company_id": restaurant.get("company_id"),
        "restaurant_id": restaurant.get("id"),
        "restaurant_name": restaurant.get("name"),
        "restaurant_phone": restaurant.get("phone"),
        "restaurant_location": {
            "latitude": restaurant.get("latitude"),
            "longitude": restaurant.get("longitude")
        },
        "customer_name": request.order.customer.full_name,
        "customer_phone": request.order.customer.phone_number,
        "delivery_address": full_address,
        "delivery_location": {
            "latitude": request.order.address.latitude,
            "longitude": request.order.address.longitude
        },
        "items": items,
        "total_amount": request.order.amount,
        "payment_method": map_sepettakip_payment(request.order.payment_type.key),
        "payment_method_detail": request.order.payment_type.method,
        "is_paid": request.order.is_paid,
        "status": "preparing",
        "notes": "|".join(notes_parts) if notes_parts else "",
        "source": "sepettakip",
        "preparation_time": request.order.preparation_time or 20,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "courier_id": None,
        "courier_name": None
    }
    
    await db.orders.insert_one(new_order)
    
    logger.info(f"SepetTakip create-package: Sipariş oluşturuldu - order_id={request.order.order_id}")
    
    return {"status": True, "message": "Sipariş başarıyla oluşturuldu"}


@router.post("/cancel-package")
async def cancel_package(
    request: CancelPackageRequest,
    api_key: Optional[str] = Header(None, alias="Api-Key")
):
    """
    Paket/Sipariş İptali
    
    Kurye firmasına iletilen bir sipariş restoran kaynaklı nedenlerle iptal edildiğinde çağrılır.
    """
    logger.info(f"SepetTakip cancel-package: order_id={request.order_id}")
    
    # API Key kontrolü
    if not await verify_sepettakip_api_key(api_key):
        logger.warning("SepetTakip cancel-package: Geçersiz API Key")
        raise HTTPException(status_code=401, detail="Geçersiz API Key")
    
    # Siparişi bul
    order = await db.orders.find_one({"sepettakip_order_id": request.order_id})
    
    if not order:
        logger.warning(f"SepetTakip cancel-package: Sipariş bulunamadı - order_id={request.order_id}")
        raise HTTPException(status_code=400, detail="Sipariş bulunamadı")
    
    # Siparişi iptal et
    await db.orders.update_one(
        {"sepettakip_order_id": request.order_id},
        {"$set": {
            "status": "cancelled",
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "cancel_reason": "SepetTakip üzerinden iptal edildi",
            "cancelled_by": "sepettakip",
            "cancelled_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    logger.info(f"SepetTakip cancel-package: Sipariş iptal edildi - order_id={request.order_id}")
    
    return {"status": True, "message": "Sipariş iptal edildi"}


@router.get("/health")
async def sepettakip_health():
    """SepetTakip Entegrasyon Sağlık Kontrolü"""
    return {
        "status": "healthy",
        "service": "sepettakip_courier_integration",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "endpoints": {
            "check_credentials": "/api/sepettakip/check-credentials",
            "create_package": "/api/sepettakip/create-package",
            "cancel_package": "/api/sepettakip/cancel-package"
        }
    }
