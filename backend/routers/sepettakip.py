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
from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Union
import logging
import os
import httpx
from datetime import datetime, timezone, timedelta
from utils.database import db
from utils.helpers import ensure_turkey_timezone, get_turkey_now
from services.credit_service import deduct_order_credit

# Türkiye timezone (UTC+3)
TURKEY_TZ = timezone(timedelta(hours=3))

router = APIRouter(prefix="/api/sepettakip", tags=["SepetTakip"])
logger = logging.getLogger(__name__)

from services.integration_log_service import save_integration_log as _db_log

class _IntLogger:
    """Logger + MongoDB'ye kayıt"""
    def __init__(self, name):
        self._name = name
    async def info(self, msg):
        logger.info(msg)
        await _db_log(self._name, "INFO", msg)
    async def warning(self, msg):
        logger.warning(msg)
        await _db_log(self._name, "WARNING", msg)
    async def error(self, msg):
        logger.error(msg)
        await _db_log(self._name, "ERROR", msg)
    async def exception(self, msg):
        logger.exception(msg)
        await _db_log(self._name, "ERROR", msg)

ilog = _IntLogger("sepettakip")

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
    
    @field_validator('latitude', 'longitude', mode='before')
    @classmethod
    def extract_from_array(cls, v):
        """Array olarak gelen koordinatları float'a çevir veya boş array'i None yap"""
        if v is None:
            return None
        if isinstance(v, list):
            if len(v) > 0:
                return float(v[0])
            else:
                return None  # Boş array [] -> None
        if isinstance(v, (int, float)):
            return float(v)
        return None


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
    id: Union[str, int]
    name: str


class OrderInfo(BaseModel):
    order_id: Union[str, int]
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
    # Restoran ara - farklı alanlarda olabilir
    restaurant = await db.restaurants.find_one(
        {
            "$or": [
                {"sepettakip_credentials.username": username},
                {"sepettakip_username": username},
                {"sepettakip_restaurant_id": username},
                {"id": username}
            ]
        },
        {"_id": 0}
    )
    
    if not restaurant:
        return {"valid": False, "restaurant": None, "error": "Restoran bulunamadı"}
    
    # Şifre kontrolü - önce sepettakip_password, sonra credentials
    stored_password = (
        restaurant.get("sepettakip_password") or
        restaurant.get("sepettakip_credentials", {}).get("password")
    )
    
    if stored_password and stored_password != password:
        return {"valid": False, "restaurant": None, "error": "Şifre hatalı"}
    
    # Şifre yoksa da geç (opsiyonel olabilir)
    if not stored_password:
        await ilog.warning(f"Restoran {username} için şifre tanımlanmamış, geçiliyor")
    
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
    raw_request: Request,
    api_key: Optional[str] = Header(None, alias="Api-Key")
):
    """
    Restoran Kimlik Doğrulama
    
    Restoranın Sepettakip paneline girdiği entegrasyon bilgilerinin doğrulanması.
    Bu adım başarılı olmadan sipariş akışı başlatılamaz.
    """
    # Debug loglama - request
    log_id = None
    try:
        raw_body = await raw_request.body()
        log_doc = {
            "type": "check-credentials",
            "timestamp": get_turkey_now(),
            "headers": dict(raw_request.headers),
            "body": raw_body.decode('utf-8')[:2000],
            "username": request.username,
            "api_key_present": bool(api_key),
            "response": None,
            "success": None
        }
        insert_result = await db.sepettakip_logs.insert_one(log_doc)
        log_id = insert_result.inserted_id
    except Exception as e:
        await ilog.error(f"Log kaydetme hatası: {e}")
    
    await ilog.info(f"SepetTakip check-credentials: username={request.username}")
    
    # API Key kontrolü
    if not await verify_sepettakip_api_key(api_key):
        await ilog.warning("SepetTakip check-credentials: Geçersiz API Key")
        # Log güncelle
        if log_id:
            await db.sepettakip_logs.update_one({"_id": log_id}, {"$set": {"response": "Geçersiz API Key", "success": False}})
        raise HTTPException(status_code=401, detail="Geçersiz API Key")
    
    # Restoran doğrulama
    result = await verify_restaurant_credentials(request.username, request.password)
    
    if not result["valid"]:
        await ilog.warning(f"SepetTakip check-credentials: Doğrulama başarısız - {result['error']}")
        # Log güncelle
        if log_id:
            await db.sepettakip_logs.update_one({"_id": log_id}, {"$set": {"response": result['error'], "success": False}})
        raise HTTPException(status_code=400, detail=result["error"])
    
    await ilog.info(f"SepetTakip check-credentials: Başarılı - restaurant={result['restaurant'].get('name')}")
    # Log güncelle - başarılı
    if log_id:
        await db.sepettakip_logs.update_one({"_id": log_id}, {"$set": {"response": "Başarılı", "success": True}})
    return {"status": True, "message": "Kimlik bilgileri doğrulandı"}


@router.post("/create-package")
async def create_package(
    request: CreatePackageRequest,
    raw_request: Request,
    api_key: Optional[str] = Header(None, alias="Api-Key")
):
    """
    Paket/Sipariş Oluşturma
    
    Sepettakip'ten gelen sipariş bilgilerini alarak sistemde kayıt açar.
    Sipariş "Hazırlanıyor" statüsüne geçtiğinde veya restoran manuel tetiklediğinde çağrılır.
    """
    # Debug loglama - gelen isteği kaydet
    try:
        raw_body = await raw_request.body()
        await db.sepettakip_logs.insert_one({
            "type": "create-package",
            "timestamp": get_turkey_now(),
            "headers": dict(raw_request.headers),
            "body": raw_body.decode('utf-8')[:5000],  # İlk 5000 karakter
            "order_id": request.order.order_id if request.order else None,
            "api_key_present": bool(api_key)
        })
    except Exception as e:
        await ilog.error(f"Log kaydetme hatası: {e}")
    
    await ilog.info(f"SepetTakip create-package: order_id={request.order.order_id}, platform={request.order.platform}")
    
    # API Key kontrolü
    if not await verify_sepettakip_api_key(api_key):
        await ilog.warning("SepetTakip create-package: Geçersiz API Key")
        raise HTTPException(status_code=401, detail="Geçersiz API Key")
    
    # Restoran doğrulama
    auth_result = await verify_restaurant_credentials(request.auth.username, request.auth.password)
    
    if not auth_result["valid"]:
        await ilog.warning(f"SepetTakip create-package: Restoran doğrulama başarısız - {auth_result.get('error')}")
        # Hata logu kaydet
        await db.sepettakip_logs.insert_one({
            "type": "ERROR-create-package",
            "timestamp": get_turkey_now(),
            "order_id": request.order.order_id if request.order else None,
            "error": f"Restoran doğrulama başarısız: {auth_result.get('error')}",
            "auth_username": request.auth.username
        })
        return {
            "status": False,
            "error_code": "unauthorized_access",
            "message": "Yetkisiz Erişim - API anahtarı veya şifre hatalı"
        }
    
    restaurant = auth_result["restaurant"]
    
    # Aynı sipariş zaten var mı kontrol et
    existing = await db.orders.find_one({"sepettakip_order_id": request.order.order_id})
    if existing:
        await ilog.info(f"SepetTakip create-package: Sipariş zaten mevcut - order_id={request.order.order_id}")
        return {"status": True, "message": "Sipariş zaten mevcut"}
    
    # Koordinat kontrolü
    if not request.order.address.latitude or not request.order.address.longitude:
        await ilog.warning(f"SepetTakip create-package: Koordinat bilgisi eksik")
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
        "created_at": get_turkey_now(),
        "updated_at": get_turkey_now(),
        "courier_id": None,
        "courier_name": None
    }
    
    await db.orders.insert_one(new_order)
    
    # Kontör düş
    await deduct_order_credit(new_order.get("company_id"), new_order.get("id"))
    
    await ilog.info(f"SepetTakip create-package: Sipariş oluşturuldu - order_id={request.order.order_id}")
    
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
    await ilog.info(f"SepetTakip cancel-package: order_id={request.order_id}")
    
    # API Key kontrolü
    if not await verify_sepettakip_api_key(api_key):
        await ilog.warning("SepetTakip cancel-package: Geçersiz API Key")
        raise HTTPException(status_code=401, detail="Geçersiz API Key")
    
    # Siparişi bul
    order = await db.orders.find_one({"sepettakip_order_id": request.order_id})
    
    if not order:
        await ilog.warning(f"SepetTakip cancel-package: Sipariş bulunamadı - order_id={request.order_id}")
        raise HTTPException(status_code=400, detail="Sipariş bulunamadı")
    
    # Siparişi iptal et
    # Türkiye saati (UTC+3)
    turkey_tz = timezone(timedelta(hours=3))
    now_turkey = datetime.now(turkey_tz).isoformat()
    
    await db.orders.update_one(
        {"sepettakip_order_id": request.order_id},
        {"$set": {
            "status": "cancelled",
            "updated_at": now_turkey,
            "cancel_reason": "SepetTakip üzerinden iptal edildi",
            "cancelled_by": "sepettakip",
            "cancelled_at": now_turkey
        }}
    )
    
    await ilog.info(f"SepetTakip cancel-package: Sipariş iptal edildi - order_id={request.order_id}")
    
    return {"status": True, "message": "Sipariş iptal edildi"}


@router.get("/health")
async def sepettakip_health():
    """SepetTakip Entegrasyon Sağlık Kontrolü"""
    return {
        "status": "healthy",
        "service": "sepettakip_courier_integration",
        "timestamp": get_turkey_now(),
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
    "on_the_way": "picked_up",   # Kurye paketi aldı, müşteriye gidiyor
    "delivered": "delivered",    # Teslim edildi
    "cancelled": "canceled",     # İptal edildi (SepetTakip 'canceled' kullanıyor)
    "rejected": "rejected"       # Sipariş reddedildi (kabul edilmedi)
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
                await ilog.info(f"SepetTakip durum bildirimi başarılı: order={order_id}, status={sepettakip_status}")
                return {"success": True, "status_code": response.status_code}
            else:
                await ilog.warning(f"SepetTakip durum bildirimi başarısız: order={order_id}, status_code={response.status_code}, response={response.text}")
                return {"success": False, "status_code": response.status_code, "error": response.text}
                
    except httpx.TimeoutException:
        await ilog.error(f"SepetTakip durum bildirimi timeout: order={order_id}")
        return {"success": False, "error": "timeout"}
    except Exception as e:
        await ilog.error(f"SepetTakip durum bildirimi hatası: order={order_id}, error={str(e)}")
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
    await ilog.info(f"SepetTakip update-status: order_id={request.order_id}, status={request.status}")
    
    # Siparişi bul
    order = await db.orders.find_one({"sepettakip_order_id": request.order_id})
    
    if not order:
        # Normal order_id ile de dene
        order = await db.orders.find_one({"id": request.order_id})
        
    if not order:
        await ilog.warning(f"SepetTakip update-status: Sipariş bulunamadı - order_id={request.order_id}")
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
    await ilog.info("SepetTakip bağlantı testi başlatılıyor...")
    
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
                "timestamp": get_turkey_now()
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
        "created_at": get_turkey_now(),
        "updated_at": get_turkey_now(),
        "courier_id": None,
        "courier_name": None,
        "is_test_order": True
    }
    
    await db.orders.insert_one(test_order)
    
    await ilog.info(f"SepetTakip test siparişi oluşturuldu: order_id={test_order_id}")
    
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


# ==================== ENTEGRASYON TEST PANELİ ====================

@router.post("/run-test/check-credentials")
async def run_test_check_credentials(success: bool = True):
    """
    SepetTakip Check Credentials testini çalıştır.
    success=True -> CC-01 (Başarılı)
    success=False -> CC-02 (Hatalı)
    """
    # Restoran bilgilerini al - tüm olası alanları kontrol et
    restaurant = await db.restaurants.find_one(
        {"sepettakip_restaurant_id": "934"},
        {"_id": 0}
    )
    
    if not restaurant:
        # Alternatif arama
        restaurant = await db.restaurants.find_one(
            {"sepettakip_credentials.restaurant_id": "934"},
            {"_id": 0}
        )
    
    if not restaurant:
        return {
            "success": False,
            "test_code": "CC-01" if success else "CC-02",
            "error": "934 ID'li restoran bulunamadı. Lütfen SepetTakip entegrasyonunu yapılandırın."
        }
    
    # Username ve password'u tüm olası alanlardan al
    username = (
        restaurant.get("sepettakip_username") or 
        restaurant.get("sepettakip_credentials", {}).get("username") or
        restaurant.get("sepettakip_restaurant_id") or
        "934"
    )
    
    stored_password = (
        restaurant.get("sepettakip_password") or 
        restaurant.get("sepettakip_credentials", {}).get("password")
    )
    
    if not stored_password:
        return {
            "success": False,
            "test_code": "CC-01" if success else "CC-02",
            "error": "Restoran için SepetTakip şifresi yapılandırılmamış. Entegrasyon ayarlarından şifre girin."
        }
    
    # CC-02 için yanlış şifre kullan
    password = stored_password if success else "yanlis_sifre_test_12345"
    
    try:
        headers = {
            "Content-Type": "application/json",
            "Courier-Company": COURIER_COMPANY_KEY,
            "Api-Key": SEPETTAKIP_API_KEY
        }
        
        payload = {
            "credentials": {
                "username": username,
                "password": password
            }
        }
        
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                f"{SEPETTAKIP_API_BASE}/courier-company/test/check-credentials",
                json=payload,
                headers=headers
            )
            
            test_code = "CC-01" if success else "CC-02"
            expected_status = [200, 201] if success else [400, 401]
            
            result = {
                "success": response.status_code in expected_status,
                "test_code": test_code,
                "status_code": response.status_code,
                "expected_status": expected_status,
                "response": response.text[:500] if response.text else None,
                "timestamp": get_turkey_now()
            }
            
            # Sonucu kaydet
            await db.sepettakip_test_results.update_one(
                {"test_code": test_code},
                {"$set": result},
                upsert=True
            )
            
            return result
            
    except httpx.TimeoutException:
        return {"success": False, "test_code": "CC-01" if success else "CC-02", "error": "Timeout"}
    except Exception as e:
        return {"success": False, "test_code": "CC-01" if success else "CC-02", "error": str(e)}


@router.post("/run-test/create-order/{test_number}")
async def run_test_create_order(test_number: int):
    """
    SepetTakip Sipariş Oluşturma testini çalıştır.
    test_number: 1-5 -> ORD-01 ~ ORD-05 (Başarılı)
    test_number: 6 -> ORD-06 (Hatalı adres)
    """
    if test_number < 1 or test_number > 6:
        return {"success": False, "error": "Test numarası 1-6 arasında olmalı"}
    
    test_code = f"ORD-0{test_number}"
    
    # Test verileri - payment_type: cash, card, pos, sodexo, multinet, ticket, setcard
    # NOT: latitude ve longitude opsiyonel olduğu için gönderilmiyor (SepetTakip talebi)
    test_data = {
        1: {"amount": 125.50, "name": "Ahmet Yılmaz", "phone": "05551112233", "city": "İstanbul", "town": "Kadıköy", "neighborhood": "Caferağa", "description": "Kırmızı bina", "building_no": "15", "floor": "2", "door_number": "4", "payment_type": "cash"},
        2: {"amount": 89.00, "name": "Mehmet Demir", "phone": "05552223344", "city": "İstanbul", "town": "Üsküdar", "neighborhood": "Altunizade", "description": "Site içi B Blok", "building_no": "7", "floor": "5", "door_number": "10", "payment_type": "card"},
        3: {"amount": 210.75, "name": "Ayşe Kaya", "phone": "05553334455", "city": "İstanbul", "town": "Beşiktaş", "neighborhood": "Levent", "description": "İş merkezi", "building_no": "42", "floor": "12", "door_number": "1", "payment_type": "pos"},
        4: {"amount": 67.25, "name": "Fatma Öztürk", "phone": "05554445566", "city": "İstanbul", "town": "Maltepe", "neighborhood": "Cevizli", "description": "Yeşil apartman", "building_no": "23", "floor": "1", "door_number": "2", "payment_type": "cash"},
        5: {"amount": 156.00, "name": "Ali Çelik", "phone": "05555556677", "city": "İstanbul", "town": "Ataşehir", "neighborhood": "Barbaros", "description": "Palmiye Sitesi A Blok", "building_no": "1", "floor": "8", "door_number": "16", "payment_type": "sodexo"},
        6: {"amount": 50.00, "name": "Test Hatalı", "phone": "05559998877", "city": "", "town": "", "neighborhood": "", "description": "", "building_no": "", "floor": "", "door_number": "", "payment_type": "cash"}  # Hatalı adres - 400/422 bekleniyor
    }
    
    payload = test_data.get(test_number)
    
    # PAYLOAD LOGLAMA - DEBUG
    await ilog.info(f"SepetTakip test payload gönderiliyor: test={test_number}, payload_keys={list(payload.keys())}")
    await ilog.info(f"SepetTakip test payload içeriği: {payload}")
    
    # Payload'da latitude/longitude OLMAMALI
    if 'latitude' in payload or 'longitude' in payload:
        await ilog.error(f"HATA: Payload'da latitude/longitude var! Bu olmamalı!")
    
    try:
        headers = {
            "Content-Type": "application/json",
            "Courier-Company": COURIER_COMPANY_KEY,
            "Api-Key": SEPETTAKIP_API_KEY
        }
        
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                f"{SEPETTAKIP_API_BASE}/courier-company/test/package",
                json=payload,
                headers=headers
            )
            
            # ORD-06 için 400/422 bekleniyor (hatalı adres), diğerleri için 200/201
            expected_success = test_number != 6
            expected_status = [200, 201] if expected_success else [400, 422, 500]
            
            # Response'dan order_id çıkar
            order_id = None
            try:
                resp_json = response.json()
                order_id = resp_json.get("order_id") or resp_json.get("id") or resp_json.get("package_id")
            except:
                pass
            
            result = {
                "success": response.status_code in expected_status,
                "test_code": test_code,
                "status_code": response.status_code,
                "expected_status": expected_status,
                "order_id": order_id,
                "response": response.text[:500] if response.text else None,
                "timestamp": get_turkey_now(),
                "sent_payload": payload,  # Gönderilen payload'ı da dön
                "payload_has_coordinates": "latitude" in payload or "longitude" in payload
            }
            
            # Sonucu kaydet
            await db.sepettakip_test_results.update_one(
                {"test_code": test_code},
                {"$set": result},
                upsert=True
            )
            
            return result
            
    except httpx.TimeoutException:
        return {"success": False, "test_code": test_code, "error": "Timeout - 30 saniye bekleyip tekrar deneyin"}
    except Exception as e:
        return {"success": False, "test_code": test_code, "error": str(e)}


@router.post("/run-test/update-status/{order_id}/{status}")
async def run_test_update_status(order_id: str, status: str):
    """
    SepetTakip'e durum güncellemesi gönder.
    status: assigned, picked_up, delivered, canceled, rejected
    """
    valid_statuses = ["assigned", "picked_up", "delivered", "canceled", "rejected"]
    if status not in valid_statuses:
        return {"success": False, "error": f"Geçersiz status. Kabul edilen: {valid_statuses}"}
    
    try:
        headers = {
            "Content-Type": "application/json",
            "Courier-Company": COURIER_COMPANY_KEY,
            "Api-Key": SEPETTAKIP_API_KEY
        }
        
        payload = {
            "order_id": order_id,
            "status": status
        }
        
        # assigned durumunda ETA ekle
        if status == "assigned":
            from datetime import timedelta
            eta = (datetime.now(TURKEY_TZ) + timedelta(minutes=20)).isoformat()
            payload["courier_eta"] = eta
        
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.patch(
                f"{SEPETTAKIP_API_BASE}/courier-company/package",
                json=payload,
                headers=headers
            )
            
            result = {
                "success": response.status_code in [200, 204],
                "order_id": order_id,
                "status": status,
                "status_code": response.status_code,
                "response": response.text[:500] if response.text else None,
                "timestamp": get_turkey_now()
            }
            
            # Sonucu kaydet
            test_code = f"STATUS-{status.upper()}"
            await db.sepettakip_test_results.update_one(
                {"test_code": test_code, "order_id": order_id},
                {"$set": result},
                upsert=True
            )
            
            return result
            
    except httpx.TimeoutException:
        return {"success": False, "error": "Timeout"}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/run-test/cancel-order/{order_id}")
async def run_test_cancel_order(order_id: str):
    """
    SepetTakip test siparişini iptal et (restoran kaynaklı iptal simülasyonu).
    """
    try:
        headers = {
            "Content-Type": "application/json",
            "Courier-Company": COURIER_COMPANY_KEY,
            "Api-Key": SEPETTAKIP_API_KEY
        }
        
        payload = {
            "package_id": order_id,
            "status": "cancel"
        }
        
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.patch(
                f"{SEPETTAKIP_API_BASE}/courier-company/test/package/{order_id}",
                json=payload,
                headers=headers
            )
            
            return {
                "success": response.status_code in [200, 204],
                "order_id": order_id,
                "status_code": response.status_code,
                "response": response.text[:500] if response.text else None,
                "timestamp": get_turkey_now()
            }
            
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.get("/test-results")
async def get_test_results():
    """Tüm test sonuçlarını getir"""
    results = await db.sepettakip_test_results.find({}).sort("test_code", 1).to_list(50)
    for r in results:
        r.pop("_id", None)
    return {"results": results}


@router.delete("/test-results")
async def clear_test_results():
    """Test sonuçlarını temizle"""
    await db.sepettakip_test_results.delete_many({})
    return {"message": "Test sonuçları temizlendi"}


@router.get("/test-orders")
async def get_test_orders():
    """SepetTakip'ten test siparişlerini listele"""
    try:
        headers = {
            "Content-Type": "application/json",
            "Courier-Company": COURIER_COMPANY_KEY,
            "Api-Key": SEPETTAKIP_API_KEY
        }
        
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(
                f"{SEPETTAKIP_API_BASE}/courier-company/test/package",
                headers=headers
            )
            
            return {
                "success": response.status_code == 200,
                "status_code": response.status_code,
                "orders": response.json() if response.status_code == 200 else None,
                "response": response.text[:1000] if response.status_code != 200 else None
            }
            
    except Exception as e:
        return {"success": False, "error": str(e)}
