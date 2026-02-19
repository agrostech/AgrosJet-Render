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

# SepetTakip API Base URL - Test ve Production
SEPETTAKIP_API_BASE_TEST = "https://test-api.sepettakip.com"
SEPETTAKIP_API_BASE_PROD = "https://api.sepettakip.com"
# Şimdilik test ortamını kullan
SEPETTAKIP_API_BASE = os.environ.get("SEPETTAKIP_API_BASE", SEPETTAKIP_API_BASE_TEST)


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
                {"sepettakip_restaurant_id": username},
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
        "courier_company_key": COURIER_COMPANY_KEY,
        "test_restaurant_id": SEPETTAKIP_TEST_RESTAURANT_ID,
        "endpoints": {
            "check_credentials": "/api/sepettakip/check-credentials",
            "create_package": "/api/sepettakip/create-package",
            "cancel_package": "/api/sepettakip/cancel-package",
            "update_status": "/api/sepettakip/update-status"
        }
    }


# ==================== STATUS UPDATE TO SEPETTAKIP ====================

class StatusUpdateRequest(BaseModel):
    """Sipariş durumu güncelleme isteği"""
    order_id: str
    status: str  # assigned, picked_up, on_the_way, delivered, cancelled
    courier_eta: Optional[str] = None  # ISO-8601 format, assigned durumunda önerilir


# SepetTakip durum kodları mapping (ShiftJet -> SepetTakip)
# Döküman: assigned, picked_up, delivered, canceled, rejected
SHIFTJET_TO_SEPETTAKIP_STATUS = {
    "assigned": "assigned",      # Kuryeye Atandı / Kurye Yola Çıktı
    "confirmed": "assigned",     # Kurye onayladı -> assigned olarak bildir
    "on_the_way": "picked_up",   # Kurye paketi aldı, yolda
    "delivered": "delivered",    # Teslim edildi
    "cancelled": "canceled"      # İptal edildi (SepetTakip 'canceled' kullanıyor)
}


async def notify_sepettakip_status(order_id: str, status: str, courier_eta: str = None):
    """
    Sipariş durumu değiştiğinde SepetTakip'e webhook bildirimi gönder.
    
    Endpoint: PATCH /courier-company/package
    Headers: 
        - Courier-Company: <COURIER_COMPANY_KEY>
        - Api-Key: <SEPETTAKIP_API_KEY>
    Body:
        - order_id: string (zorunlu)
        - status: enum (assigned, picked_up, delivered, canceled, rejected)
        - courier_eta: datetime ISO-8601 (opsiyonel, assigned durumunda önerilir)
    """
    sepettakip_status = SHIFTJET_TO_SEPETTAKIP_STATUS.get(status)
    
    if not sepettakip_status:
        logger.debug(f"SepetTakip bildirim: {status} durumu için mapping yok, atlanıyor")
        return None
    
    try:
        payload = {
            "order_id": order_id,
            "status": sepettakip_status
        }
        
        # Kurye atandıysa ETA ekle (önerilen)
        if sepettakip_status == "assigned" and courier_eta:
            payload["courier_eta"] = courier_eta
        
        headers = {
            "Courier-Company": COURIER_COMPANY_KEY,
            "Api-Key": SEPETTAKIP_API_KEY,
            "Content-Type": "application/json",
            "Accept": "application/json"
        }
        
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.patch(
                f"{SEPETTAKIP_API_BASE}/courier-company/package",
                json=payload,
                headers=headers
            )
            
            # 204 No Content = başarılı
            if response.status_code in [200, 204]:
                logger.info(f"SepetTakip durum bildirimi başarılı: order={order_id}, status={sepettakip_status}")
                return {"success": True, "status_code": response.status_code}
            else:
                logger.warning(f"SepetTakip durum bildirimi başarısız: order={order_id}, status_code={response.status_code}, response={response.text}")
                return {"success": False, "status_code": response.status_code, "error": response.text}
                
    except httpx.TimeoutException:
        logger.error(f"SepetTakip durum bildirimi timeout: order={order_id}")
        return {"success": False, "error": "timeout"}
    except Exception as e:
        logger.error(f"SepetTakip durum bildirimi hatası: order={order_id}, error={str(e)}")
        return {"success": False, "error": str(e)}


@router.post("/update-status")
async def update_order_status(
    request: StatusUpdateRequest,
    api_key: Optional[str] = Header(None, alias="Api-Key")
):
    """
    Manuel durum güncelleme endpoint'i.
    Admin panelinden veya sistemden sipariş durumu değiştiğinde
    SepetTakip'e bildirim göndermek için kullanılır.
    """
    logger.info(f"SepetTakip update-status: order_id={request.order_id}, status={request.status}")
    
    # Siparişi bul
    order = await db.orders.find_one({"sepettakip_order_id": request.order_id})
    
    if not order:
        # Normal order_id ile de dene
        order = await db.orders.find_one({"id": request.order_id})
        
    if not order:
        logger.warning(f"SepetTakip update-status: Sipariş bulunamadı - order_id={request.order_id}")
        raise HTTPException(status_code=404, detail="Sipariş bulunamadı")
    
    # SepetTakip'e bildir
    sepettakip_order_id = order.get("sepettakip_order_id", request.order_id)
    result = await notify_sepettakip_status(
        sepettakip_order_id, 
        request.status,
        request.courier_eta
    )
    
    return {
        "status": True,
        "message": "Durum güncelleme isteği gönderildi",
        "sepettakip_response": result
    }


@router.get("/test-connection")
async def test_sepettakip_connection():
    """
    SepetTakip bağlantı testi.
    API Key ve kurye şirketi anahtarının doğru yapılandırıldığını test eder.
    """
    logger.info("SepetTakip bağlantı testi başlatılıyor...")
    
    try:
        headers = {
            "Api-Key": SEPETTAKIP_API_KEY,
            "Content-Type": "application/json"
        }
        
        # Test isteği - ping veya health endpoint'i varsa kullan
        async with httpx.AsyncClient(timeout=10.0) as client:
            # SepetTakip'in test endpoint'i
            response = await client.get(
                f"{SEPETTAKIP_API_BASE}/courier/health",
                headers=headers
            )
            
            return {
                "status": "connected" if response.status_code in [200, 404] else "error",
                "courier_company_key": COURIER_COMPANY_KEY,
                "api_key_configured": bool(SEPETTAKIP_API_KEY),
                "test_restaurant_id": SEPETTAKIP_TEST_RESTAURANT_ID,
                "response_code": response.status_code,
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
            
    except httpx.TimeoutException:
        return {
            "status": "timeout",
            "courier_company_key": COURIER_COMPANY_KEY,
            "api_key_configured": bool(SEPETTAKIP_API_KEY),
            "error": "Bağlantı zaman aşımına uğradı"
        }
    except Exception as e:
        return {
            "status": "error",
            "courier_company_key": COURIER_COMPANY_KEY,
            "api_key_configured": bool(SEPETTAKIP_API_KEY),
            "error": str(e)
        }


# ==================== TEST ENDPOINT FOR SEPETTAKIP CHECKLIST ====================

@router.post("/test-create-order")
async def test_create_order_for_sepettakip():
    """
    SepetTakip entegrasyon checklist'i için test sipariş oluşturma.
    Bu endpoint bir test siparişi oluşturur ve order_id döner.
    """
    import uuid
    
    test_order_id = f"TEST-{uuid.uuid4().hex[:8].upper()}"
    
    # Test restoranı kontrol et (ID: 934)
    restaurant = await db.restaurants.find_one({"sepettakip_restaurant_id": SEPETTAKIP_TEST_RESTAURANT_ID})
    
    if not restaurant:
        # Varsayılan test restoranı bilgileri
        restaurant_info = {
            "id": "test-restaurant-934",
            "name": "Test Restoran (SepetTakip)",
            "company_id": "test-company",
            "latitude": 41.0082,
            "longitude": 28.9784,
            "phone": "05551234567"
        }
    else:
        restaurant_info = restaurant
    
    test_order = {
        "id": str(uuid.uuid4()),
        "order_number": f"ST-{test_order_id}",
        "sepettakip_order_id": test_order_id,
        "external_app_name": "SepetTakip Test",
        "company_id": restaurant_info.get("company_id", "test-company"),
        "restaurant_id": restaurant_info.get("id"),
        "restaurant_name": restaurant_info.get("name"),
        "restaurant_phone": restaurant_info.get("phone"),
        "restaurant_location": {
            "latitude": restaurant_info.get("latitude", 41.0082),
            "longitude": restaurant_info.get("longitude", 28.9784)
        },
        "customer_name": "SepetTakip Test Müşteri",
        "customer_phone": "05559876543",
        "delivery_address": "Test Mahallesi, Test Sokak No:1, Kadıköy/İstanbul",
        "delivery_location": {
            "latitude": 40.9910,
            "longitude": 29.0230
        },
        "items": [
            {"name": "Test Ürün 1", "quantity": 2, "price": 50.0, "notes": ""},
            {"name": "Test Ürün 2", "quantity": 1, "price": 30.0, "notes": "Acısız"}
        ],
        "total_amount": 130.0,
        "payment_method": "cash",
        "payment_method_detail": "Nakit",
        "is_paid": False,
        "status": "preparing",
        "notes": "SepetTakip entegrasyon testi",
        "source": "sepettakip",
        "preparation_time": 20,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "courier_id": None,
        "courier_name": None,
        "is_test_order": True
    }
    
    await db.orders.insert_one(test_order)
    
    logger.info(f"SepetTakip test siparişi oluşturuldu: order_id={test_order_id}")
    
    return {
        "status": True,
        "message": "Test siparişi oluşturuldu",
        "order_id": test_order_id,
        "internal_order_id": test_order["id"],
        "order_number": test_order["order_number"],
        "instructions": {
            "1": "Bu order_id'yi SepetTakip checklist'ine gönderin",
            "2": "Sipariş durumlarını test edin: assigned, on_the_way, delivered",
            "3": "Test tamamlandıktan sonra siparişi silebilirsiniz"
        }
    }



# ==================== DEBUG LOGGING ====================

@router.get("/logs")
async def get_sepettakip_logs():
    """Son SepetTakip loglarını getir (debug için)"""
    logs = await db.sepettakip_logs.find({}).sort("timestamp", -1).limit(50).to_list(50)
    for log in logs:
        log.pop("_id", None)
    return {"logs": logs}


@router.delete("/logs")
async def clear_sepettakip_logs():
    """SepetTakip loglarını temizle"""
    await db.sepettakip_logs.delete_many({})
    return {"message": "Loglar temizlendi"}
