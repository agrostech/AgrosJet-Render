"""
Trendyol Go by Uber Eats API Entegrasyon Servisi
- Sipariş çekme (polling)
- Sipariş durumu güncelleme
- Restoran çalışma durumu yönetimi

API Docs: https://developers.tgoapps.com
Base URL: https://api.tgoapis.com/integrator
"""
import httpx
import uuid
import base64
import logging
import time
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any
from utils.database import db
from utils.helpers import ensure_turkey_timezone, get_turkey_now

# Türkiye timezone (UTC+3)
TURKEY_TZ = timezone(timedelta(hours=3))

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

ilog = _IntLogger("trendyol")

TRENDYOL_BASE_URL = "https://api.tgoapis.com/integrator"

# İptal nedenleri
CANCEL_REASONS = {
    621: "Ürün tükendi",
    622: "Restoran kapalı",
    623: "Çok yoğunum",
    624: "Teknik sorun",
    625: "Diğer"
}


def get_trendyol_auth_header(api_key: str, api_secret: str) -> str:
    """Basic Auth header oluştur"""
    credentials = f"{api_key}:{api_secret}"
    encoded = base64.b64encode(credentials.encode()).decode()
    return f"Basic {encoded}"


async def get_trendyol_headers(restaurant: dict) -> dict:
    """Trendyol API için gerekli header'ları oluştur"""
    integration = restaurant.get("platform_integrations", {}).get("trendyol", {})
    api_key = integration.get("api_key", "")
    api_secret = integration.get("api_secret", "")
    
    return {
        "Authorization": get_trendyol_auth_header(api_key, api_secret),
        "Content-Type": "application/json",
        "x-agentname": "ShiftJet",
        "x-executor-user": "integration@shiftjet.app"
    }


async def test_trendyol_connection(restaurant_id: str) -> dict:
    """Trendyol API bağlantısını test et"""
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0}
    )
    
    if not restaurant:
        return {"success": False, "error": "Restoran bulunamadı"}
    
    integration = restaurant.get("platform_integrations", {}).get("trendyol", {})
    api_key = integration.get("api_key")
    api_secret = integration.get("api_secret")
    supplier_id = integration.get("supplier_id")
    
    if not api_key or not api_secret or not supplier_id:
        return {"success": False, "error": "Trendyol API bilgileri eksik (API Key, API Secret ve Supplier ID gerekli)"}
    
    try:
        headers = await get_trendyol_headers(restaurant)
        async with httpx.AsyncClient(timeout=15.0) as client:
            # Sipariş endpoint'ini test amaçlı çağır
            response = await client.get(
                f"{TRENDYOL_BASE_URL}/order/meal/suppliers/{supplier_id}/packages",
                headers=headers,
                params={
                    "packageStatuses": "Created",
                    "size": 1,
                    "page": 0
                }
            )
            
            if response.status_code == 200:
                # Bağlantı başarılı - connected durumunu güncelle
                await db.restaurants.update_one(
                    {"id": restaurant_id},
                    {"$set": {
                        "platform_integrations.trendyol.connected": True,
                        "platform_integrations.trendyol.last_test": datetime.now(TURKEY_TZ).isoformat()
                    }}
                )
                return {"success": True, "message": "Trendyol bağlantısı başarılı"}
            elif response.status_code == 401:
                await db.restaurants.update_one(
                    {"id": restaurant_id},
                    {"$set": {"platform_integrations.trendyol.connected": False}}
                )
                return {"success": False, "error": "API anahtarları geçersiz"}
            elif response.status_code == 403:
                return {"success": False, "error": "Bu supplier için yetkiniz yok"}
            else:
                error_detail = ""
                try:
                    error_data = response.json()
                    error_detail = error_data.get("message", "")
                except:
                    pass
                return {"success": False, "error": f"API hatası: {response.status_code} - {error_detail}"}
                
    except httpx.TimeoutException:
        return {"success": False, "error": "Bağlantı zaman aşımı"}
    except Exception as e:
        logger.exception("Trendyol bağlantı testi hatası")
        return {"success": False, "error": f"Bağlantı hatası: {str(e)}"}


def map_trendyol_status(package_status: str) -> str:
    """Trendyol packageStatus'unu ShiftJet durumuna çevir"""
    status_map = {
        "Created": "preparing",        # Yeni sipariş
        "Picking": "preparing",        # Kabul edildi, hazırlanıyor
        "Invoiced": "ready",           # Hazır
        "Shipped": "on_the_way",       # Yola çıktı
        "Delivered": "delivered",      # Teslim edildi
        "UnSupplied": "cancelled",     # Tedarik edilemedi/İptal
        "Cancelled": "cancelled"       # İptal
    }
    return status_map.get(package_status, "preparing")


def map_trendyol_payment(payment: dict) -> str:
    """Trendyol ödeme bilgisini ShiftJet'e çevir
    
    paymentType:
    - PAY_WITH_CARD: Online kart ödemesi
    - PAY_WITH_MEAL_CARD: Yemek kartı ile online ödeme
    - PAY_WITH_ON_DELIVERY: Kapıda ödeme
        - onDelivery.paymentType: CASH, CARD, SODEXO_CARD, MULTINET_CARD vb.
    """
    if not payment:
        return "online"
    
    payment_type = payment.get("paymentType", "")
    
    if payment_type == "PAY_WITH_ON_DELIVERY":
        on_delivery = payment.get("onDelivery", {})
        on_delivery_type = on_delivery.get("paymentType", "")
        
        if on_delivery_type == "CASH":
            return "cash"
        elif on_delivery_type == "CARD":
            return "card"
        else:
            # SODEXO, MULTINET, EDENRED vb. yemek kartları - kapıda
            return "meal_card"
    
    elif payment_type == "PAY_WITH_MEAL_CARD":
        return "online"  # Online yemek kartı ödemesi
    
    elif payment_type == "PAY_WITH_CARD":
        return "online"  # Online kredi kartı
    
    return "online"


def build_product_name(line: dict) -> str:
    """Ürün adını modifier'lar ile birlikte oluştur"""
    name = line.get("name", "Ürün")
    
    # Modifier ürünleri ekle
    modifiers = line.get("modifierProducts", [])
    modifier_names = []
    
    for mod in modifiers:
        mod_name = mod.get("name", "")
        if mod_name:
            modifier_names.append(mod_name)
        
        # Alt modifier'lar
        sub_modifiers = mod.get("modifierProducts", [])
        for sub in sub_modifiers:
            sub_name = sub.get("name", "")
            if sub_name:
                modifier_names.append(sub_name)
    
    # Ekstra malzemeler
    extras = line.get("extraIngredients", [])
    for extra in extras:
        extra_name = extra.get("name", "")
        if extra_name:
            modifier_names.append(f"+{extra_name}")
    
    # Çıkarılan malzemeler
    removed = line.get("removedIngredients", [])
    for rem in removed:
        rem_name = rem.get("name", "")
        if rem_name:
            modifier_names.append(f"-{rem_name}")
    
    if modifier_names:
        name += f" ({', '.join(modifier_names)})"
    
    return name


async def fetch_trendyol_packages(restaurant_id: str, statuses: str = None, page: int = 0, size: int = 50) -> dict:
    """Trendyol'dan sipariş paketlerini çek"""
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0}
    )
    
    if not restaurant:
        return {"success": False, "error": "Restoran bulunamadı", "packages": []}
    
    integration = restaurant.get("platform_integrations", {}).get("trendyol", {})
    supplier_id = integration.get("supplier_id")
    
    if not supplier_id:
        return {"success": False, "error": "Trendyol Supplier ID eksik", "packages": []}
    
    try:
        headers = await get_trendyol_headers(restaurant)
        params = {
            "size": min(size, 50),  # Max 50
            "page": page
        }
        
        if statuses:
            params["packageStatuses"] = statuses
        
        # Store ID varsa ekle
        store_id = integration.get("store_id")
        if store_id:
            params["storeId"] = store_id
        
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.get(
                f"{TRENDYOL_BASE_URL}/order/meal/suppliers/{supplier_id}/packages",
                headers=headers,
                params=params
            )
            
            if response.status_code == 200:
                data = response.json()
                content = data.get("content", [])
                return {
                    "success": True,
                    "packages": content,
                    "total": data.get("totalCount", 0),
                    "page": data.get("page", 0),
                    "total_pages": data.get("totalPages", 0)
                }
            else:
                error_msg = f"API hatası: {response.status_code}"
                try:
                    error_data = response.json()
                    if "message" in error_data:
                        error_msg += f" - {error_data['message']}"
                except:
                    pass
                return {"success": False, "error": error_msg, "packages": []}
                
    except Exception as e:
        logger.exception("Trendyol sipariş çekme hatası")
        return {"success": False, "error": str(e), "packages": []}


async def convert_trendyol_package_to_shiftjet(package: dict, restaurant: dict) -> dict:
    """Trendyol paket formatını ShiftJet sipariş formatına çevir"""
    
    package_id = package.get("id", "")
    order_number = package.get("orderNumber", "")
    
    # Müşteri bilgileri
    customer = package.get("customer", {})
    customer_name = f"{customer.get('firstName', '')} {customer.get('lastName', '')}".strip() or "Müşteri"
    
    # Adres bilgileri
    address = package.get("address", {})
    
    # Model 2 (Trendyol kuryesi) için adres "Trendyol Yemek" olarak döner
    delivery_type = package.get("deliveryType", "STORE")
    is_trendyol_courier = delivery_type == "GO"
    
    # Adres oluştur
    if is_trendyol_courier:
        # Model 2 - Trendyol kuryesi, adres gizli
        address_text = "Trendyol Go Kuryesi ile Teslimat"
        delivery_lat = None
        delivery_lng = None
    else:
        # Model 1 - Restoran kuryesi
        address_parts = []
        if address.get("neighborhood"):
            address_parts.append(address["neighborhood"])
        if address.get("address1"):
            address_parts.append(address["address1"])
        if address.get("address2") and address["address2"] != address.get("address1"):
            address_parts.append(address["address2"])
        if address.get("apartmentNumber"):
            address_parts.append(f"No: {address['apartmentNumber']}")
        if address.get("floor"):
            address_parts.append(f"Kat: {address['floor']}")
        if address.get("doorNumber"):
            address_parts.append(f"Daire: {address['doorNumber']}")
        if address.get("district"):
            address_parts.append(address["district"])
        
        address_text = ", ".join(filter(None, address_parts)) or "Adres belirtilmemiş"
        
        # Koordinatlar
        try:
            delivery_lat = float(address.get("latitude")) if address.get("latitude") else None
            delivery_lng = float(address.get("longitude")) if address.get("longitude") else None
        except (ValueError, TypeError):
            delivery_lat = None
            delivery_lng = None
    
    # Telefon - çağrı merkezi numarası + sipariş kodu ile aranabilir
    customer_phone = address.get("phone", package.get("callCenterPhone", ""))
    
    # Ürünleri dönüştür
    items = []
    package_item_ids = []  # İptal için gerekli
    
    lines = package.get("lines", [])
    for line in lines:
        item_name = build_product_name(line)
        
        # items içindeki packageItemId'leri topla
        line_items = line.get("items", [])
        for item in line_items:
            pkg_item_id = item.get("packageItemId")
            if pkg_item_id:
                package_item_ids.append(pkg_item_id)
        
        # Fiyat hesapla
        price = float(line.get("unitSellingPrice", line.get("price", 0)))
        
        items.append({
            "name": item_name,
            "quantity": 1,  # Trendyol her line'ı ayrı gönderiyor
            "price": price,
            "notes": ""
        })
    
    # Toplam tutar
    total_amount = float(package.get("totalPrice", 0))
    
    # Ödeme yöntemi
    payment = package.get("payment", {})
    payment_method = map_trendyol_payment(payment)
    
    # Sipariş notları
    notes_parts = []
    if package.get("customerNote"):
        notes_parts.append(f"CUSTOMER:{package['customerNote']}")
    if address.get("addressDescription") and address["addressDescription"] not in ["Trendyol Yemek", ""]:
        notes_parts.append(f"ADDRESS:{address['addressDescription']}")
    order_notes = "|".join(notes_parts)
    
    # ETA bilgisi
    eta = package.get("eta", "")
    
    # Kurye yakın mı (Model 2)
    is_courier_nearby = package.get("isCourierNearby", False)
    
    # Gel-al sipariş mi
    is_store_pickup = package.get("storePickupSelected", False)
    
    # Tahmini kurye varış zamanı
    pickup_eta_state = package.get("pickupEtaState", "")
    estimated_pickup_min = package.get("estimatedPickupTimeMin", 0)
    estimated_pickup_max = package.get("estimatedPickupTimeMax", 0)
    
    # Sipariş oluşturulma zamanı (epoch ms -> ISO, Türkiye timezone)
    created_at = get_turkey_now()
    package_creation_date = package.get("packageCreationDate")
    if package_creation_date:
        try:
            # Epoch timestamp'i Türkiye saatine çevir
            dt_utc = datetime.fromtimestamp(package_creation_date / 1000, tz=timezone.utc)
            dt_turkey = dt_utc.astimezone(TURKEY_TZ)
            created_at = dt_turkey.isoformat()
        except:
            pass
    
    return {
        "id": str(uuid.uuid4()),
        "order_number": f"TY-{order_number}",
        "trendyol_package_id": package_id,
        "trendyol_order_number": order_number,
        "trendyol_order_id": package.get("orderId"),
        "external_app_name": "Trendyol Yemek",
        "company_id": restaurant.get("company_id"),
        "restaurant_id": restaurant.get("id"),
        "restaurant_name": restaurant.get("name"),
        "restaurant_phone": restaurant.get("phone"),
        "restaurant_location": {
            "latitude": restaurant.get("latitude"),
            "longitude": restaurant.get("longitude")
        },
        "customer_name": customer_name,
        "customer_phone": customer_phone,
        "delivery_address": address_text,
        "delivery_location": {
            "latitude": delivery_lat,
            "longitude": delivery_lng
        },
        "items": items,
        "total_amount": total_amount,
        "payment_method": payment_method,
        "status": map_trendyol_status(package.get("packageStatus", "Created")),
        "notes": order_notes,
        "source": "trendyol",
        "created_at": created_at,
        "updated_at": get_turkey_now(),
        "courier_id": None,
        "courier_name": None,
        "trendyol_raw": {
            "packageId": package_id,
            "packageStatus": package.get("packageStatus"),
            "deliveryType": delivery_type,
            "paymentType": payment.get("paymentType"),
            "eta": eta,
            "isCourierNearby": is_courier_nearby,
            "isStorePickup": is_store_pickup,
            "pickupEtaState": pickup_eta_state,
            "estimatedPickupTimeMin": estimated_pickup_min,
            "estimatedPickupTimeMax": estimated_pickup_max,
            "packageItemIds": package_item_ids,
            "supplierId": package.get("supplierId"),
            "storeId": package.get("storeId")
        }
    }


async def sync_restaurant_trendyol_orders(restaurant_id: str) -> dict:
    """Restoran için Trendyol siparişlerini senkronize et"""
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0}
    )
    
    if not restaurant:
        return {"success": False, "error": "Restoran bulunamadı", "synced": 0}
    
    integration = restaurant.get("platform_integrations", {}).get("trendyol", {})
    if not integration.get("enabled") or not integration.get("connected"):
        return {"success": False, "error": "Trendyol entegrasyonu aktif değil", "synced": 0}
    
    synced_count = 0
    skipped_count = 0
    updated_count = 0
    
    # ShiftJet'te daha ileri durumlar - bunları Trendyol ile ezme
    shiftjet_priority_statuses = ["assigned", "confirmed", "on_the_way", "delivered", "cancelled"]
    
    # Aktif siparişleri çek (Created, Picking, Invoiced, Shipped)
    active_statuses = "Created,Picking,Invoiced,Shipped"
    
    result = await fetch_trendyol_packages(restaurant_id, statuses=active_statuses, page=0, size=50)
    
    if not result["success"]:
        return {"success": False, "error": result["error"], "synced": 0}
    
    for package in result["packages"]:
        package_id = package.get("id")
        order_number = package.get("orderNumber")
        
        # Bu sipariş zaten var mı kontrol et (packageId veya orderNumber ile)
        existing = await db.orders.find_one({
            "$or": [
                {"trendyol_package_id": package_id},
                {"trendyol_order_number": order_number}
            ]
        })
        
        if existing:
            current_status = existing.get("status")
            
            # Eğer ShiftJet'te kurye atanmış veya ilerlemiş ise, durumu DEĞİŞTİRME
            if current_status in shiftjet_priority_statuses:
                skipped_count += 1
                continue
            
            # Trendyol'dan durum güncellemesi varsa uygula
            new_status = map_trendyol_status(package.get("packageStatus", "Created"))
            if current_status != new_status:
                await db.orders.update_one(
                    {"_id": existing["_id"]},
                    {"$set": {
                        "status": new_status,
                        "updated_at": datetime.now(TURKEY_TZ).isoformat(),
                        "trendyol_raw.packageStatus": package.get("packageStatus")
                    }}
                )
                updated_count += 1
            else:
                skipped_count += 1
            continue
        
        # Yeni sipariş - dönüştür ve kaydet
        shiftjet_order = await convert_trendyol_package_to_shiftjet(package, restaurant)
        
        # Hazırlama süresini hesapla
        try:
            from routers.orders import calculate_preparation_time_async
            prep_time = await calculate_preparation_time_async(restaurant_id, shiftjet_order.get("items", []))
        except:
            prep_time = 20  # Default 20 dakika
        
        prep_end = datetime.now(TURKEY_TZ) + timedelta(minutes=prep_time)
        shiftjet_order["preparation_time"] = prep_time
        shiftjet_order["preparation_end_at"] = prep_end.isoformat()
        
        await db.orders.insert_one(shiftjet_order)
        synced_count += 1
    
    # Son senkronizasyon zamanını güncelle
    await db.restaurants.update_one(
        {"id": restaurant_id},
        {"$set": {"platform_integrations.trendyol.last_sync": datetime.now(TURKEY_TZ).isoformat()}}
    )
    
    return {
        "success": True,
        "synced": synced_count,
        "updated": updated_count,
        "skipped": skipped_count,
        "total": len(result["packages"])
    }


# --- Trendyol'a durum güncelleme ---

async def accept_trendyol_order(restaurant_id: str, order_id: str, preparation_time: int = 20) -> dict:
    """Trendyol siparişini kabul et (Picking)
    
    PUT /packages/picked
    Body: { "packageId": "xxx", "preparationTime": 30 }
    """
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0}
    )
    
    if not restaurant:
        return {"success": False, "error": "Restoran bulunamadı"}
    
    integration = restaurant.get("platform_integrations", {}).get("trendyol", {})
    supplier_id = integration.get("supplier_id")
    
    if not supplier_id:
        return {"success": False, "error": "Trendyol Supplier ID eksik"}
    
    # Siparişi bul
    order = await db.orders.find_one({"id": order_id})
    if not order:
        return {"success": False, "error": "Sipariş bulunamadı"}
    
    package_id = order.get("trendyol_package_id") or order.get("trendyol_raw", {}).get("packageId")
    if not package_id:
        return {"success": False, "error": "Bu sipariş Trendyol siparişi değil"}
    
    try:
        headers = await get_trendyol_headers(restaurant)
        async with httpx.AsyncClient(timeout=15.0) as client:
            url = f"{TRENDYOL_BASE_URL}/order/meal/suppliers/{supplier_id}/packages/picked"
            body = {
                "packageId": package_id,
                "preparationTime": preparation_time
            }
            
            response = await client.put(url, headers=headers, json=body)
            
            if response.status_code == 200:
                await ilog.info(f"Trendyol sipariş {package_id} kabul edildi")
                return {"success": True, "message": "Sipariş kabul edildi"}
            else:
                error_detail = _extract_error(response)
                await ilog.warning(f"Trendyol kabul hatası: {response.status_code} - {error_detail}")
                return {"success": False, "error": f"API hatası: {response.status_code} - {error_detail}"}
                
    except Exception as e:
        await ilog.exception("Trendyol kabul hatası")
        return {"success": False, "error": str(e)}


async def mark_trendyol_order_ready(restaurant_id: str, order_id: str) -> dict:
    """Trendyol siparişini hazır olarak işaretle (Invoiced)
    
    PUT /packages/invoiced
    Body: { "packageId": "xxx", "actualDate": timestamp_ms }
    """
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0}
    )
    
    if not restaurant:
        return {"success": False, "error": "Restoran bulunamadı"}
    
    integration = restaurant.get("platform_integrations", {}).get("trendyol", {})
    supplier_id = integration.get("supplier_id")
    
    if not supplier_id:
        return {"success": False, "error": "Trendyol Supplier ID eksik"}
    
    order = await db.orders.find_one({"id": order_id})
    if not order:
        return {"success": False, "error": "Sipariş bulunamadı"}
    
    package_id = order.get("trendyol_package_id") or order.get("trendyol_raw", {}).get("packageId")
    if not package_id:
        return {"success": False, "error": "Bu sipariş Trendyol siparişi değil"}
    
    try:
        headers = await get_trendyol_headers(restaurant)
        async with httpx.AsyncClient(timeout=15.0) as client:
            url = f"{TRENDYOL_BASE_URL}/order/meal/suppliers/{supplier_id}/packages/invoiced"
            body = {
                "packageId": package_id,
                "actualDate": int(time.time() * 1000)  # Current timestamp in ms
            }
            
            response = await client.put(url, headers=headers, json=body)
            
            if response.status_code == 200:
                logger.info(f"Trendyol sipariş {package_id} hazır olarak işaretlendi")
                return {"success": True, "message": "Sipariş hazır olarak işaretlendi"}
            else:
                error_detail = _extract_error(response)
                logger.warning(f"Trendyol hazır hatası: {response.status_code} - {error_detail}")
                return {"success": False, "error": f"API hatası: {response.status_code} - {error_detail}"}
                
    except Exception as e:
        logger.exception("Trendyol hazır hatası")
        return {"success": False, "error": str(e)}


async def mark_trendyol_order_shipped(restaurant_id: str, order_id: str) -> dict:
    """Trendyol siparişini yola çıktı olarak işaretle (Model 1 - Restoran Kuryesi)
    
    PUT /packages/{packageId}/manual-shipped
    Body: { "actualDate": timestamp_ms }
    """
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0}
    )
    
    if not restaurant:
        return {"success": False, "error": "Restoran bulunamadı"}
    
    integration = restaurant.get("platform_integrations", {}).get("trendyol", {})
    supplier_id = integration.get("supplier_id")
    
    if not supplier_id:
        return {"success": False, "error": "Trendyol Supplier ID eksik"}
    
    order = await db.orders.find_one({"id": order_id})
    if not order:
        return {"success": False, "error": "Sipariş bulunamadı"}
    
    package_id = order.get("trendyol_package_id") or order.get("trendyol_raw", {}).get("packageId")
    if not package_id:
        return {"success": False, "error": "Bu sipariş Trendyol siparişi değil"}
    
    # Model 2 kontrolü - Trendyol kuryesi ile çalışan siparişlerde bu çağrılmaz
    delivery_type = order.get("trendyol_raw", {}).get("deliveryType", "STORE")
    if delivery_type == "GO":
        return {"success": False, "error": "Trendyol kuryesi ile çalışan siparişlerde bu işlem yapılamaz"}
    
    try:
        headers = await get_trendyol_headers(restaurant)
        async with httpx.AsyncClient(timeout=15.0) as client:
            url = f"{TRENDYOL_BASE_URL}/order/meal/suppliers/{supplier_id}/packages/{package_id}/manual-shipped"
            body = {
                "actualDate": int(time.time() * 1000)
            }
            
            response = await client.put(url, headers=headers, json=body)
            
            if response.status_code == 200:
                logger.info(f"Trendyol sipariş {package_id} yola çıktı")
                return {"success": True, "message": "Sipariş yola çıktı olarak işaretlendi"}
            else:
                error_detail = _extract_error(response)
                logger.warning(f"Trendyol yola çıktı hatası: {response.status_code} - {error_detail}")
                return {"success": False, "error": f"API hatası: {response.status_code} - {error_detail}"}
                
    except Exception as e:
        logger.exception("Trendyol yola çıktı hatası")
        return {"success": False, "error": str(e)}


async def mark_trendyol_order_delivered(restaurant_id: str, order_id: str) -> dict:
    """Trendyol siparişini teslim edildi olarak işaretle (Model 1 - Restoran Kuryesi)
    
    PUT /packages/{packageId}/manual-delivered
    Body: { "actualDate": timestamp_ms }
    """
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0}
    )
    
    if not restaurant:
        return {"success": False, "error": "Restoran bulunamadı"}
    
    integration = restaurant.get("platform_integrations", {}).get("trendyol", {})
    supplier_id = integration.get("supplier_id")
    
    if not supplier_id:
        return {"success": False, "error": "Trendyol Supplier ID eksik"}
    
    order = await db.orders.find_one({"id": order_id})
    if not order:
        return {"success": False, "error": "Sipariş bulunamadı"}
    
    package_id = order.get("trendyol_package_id") or order.get("trendyol_raw", {}).get("packageId")
    if not package_id:
        return {"success": False, "error": "Bu sipariş Trendyol siparişi değil"}
    
    delivery_type = order.get("trendyol_raw", {}).get("deliveryType", "STORE")
    if delivery_type == "GO":
        return {"success": False, "error": "Trendyol kuryesi ile çalışan siparişlerde bu işlem yapılamaz"}
    
    try:
        headers = await get_trendyol_headers(restaurant)
        async with httpx.AsyncClient(timeout=15.0) as client:
            url = f"{TRENDYOL_BASE_URL}/order/meal/suppliers/{supplier_id}/packages/{package_id}/manual-delivered"
            body = {
                "actualDate": int(time.time() * 1000)
            }
            
            response = await client.put(url, headers=headers, json=body)
            
            if response.status_code == 200:
                logger.info(f"Trendyol sipariş {package_id} teslim edildi")
                return {"success": True, "message": "Sipariş teslim edildi olarak işaretlendi"}
            else:
                error_detail = _extract_error(response)
                logger.warning(f"Trendyol teslim hatası: {response.status_code} - {error_detail}")
                return {"success": False, "error": f"API hatası: {response.status_code} - {error_detail}"}
                
    except Exception as e:
        logger.exception("Trendyol teslim hatası")
        return {"success": False, "error": str(e)}


async def cancel_trendyol_order(restaurant_id: str, order_id: str, reason_id: int = 625) -> dict:
    """Trendyol siparişini iptal et (UnSupplied)
    
    PUT /packages/unsupplied
    Body: { "packageId": "xxx", "itemIdList": [...], "reasonId": 621 }
    
    İptal Nedenleri:
    621: Ürün tükendi
    622: Restoran kapalı
    623: Çok yoğunum
    624: Teknik sorun
    625: Diğer
    """
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0}
    )
    
    if not restaurant:
        return {"success": False, "error": "Restoran bulunamadı"}
    
    integration = restaurant.get("platform_integrations", {}).get("trendyol", {})
    supplier_id = integration.get("supplier_id")
    
    if not supplier_id:
        return {"success": False, "error": "Trendyol Supplier ID eksik"}
    
    order = await db.orders.find_one({"id": order_id})
    if not order:
        return {"success": False, "error": "Sipariş bulunamadı"}
    
    package_id = order.get("trendyol_package_id") or order.get("trendyol_raw", {}).get("packageId")
    if not package_id:
        return {"success": False, "error": "Bu sipariş Trendyol siparişi değil"}
    
    # packageItemId listesini al - full iptal için hepsi gerekli
    package_item_ids = order.get("trendyol_raw", {}).get("packageItemIds", [])
    if not package_item_ids:
        # Eğer item ID'leri yoksa, siparişi tekrar çekerek almayı dene
        logger.warning(f"Sipariş {order_id} için packageItemIds bulunamadı")
        # Boş liste ile devam et - API kabul edebilir
        package_item_ids = []
    
    try:
        headers = await get_trendyol_headers(restaurant)
        async with httpx.AsyncClient(timeout=15.0) as client:
            url = f"{TRENDYOL_BASE_URL}/order/meal/suppliers/{supplier_id}/packages/unsupplied"
            body = {
                "packageId": package_id,
                "itemIdList": package_item_ids,
                "reasonId": reason_id
            }
            
            response = await client.put(url, headers=headers, json=body)
            
            if response.status_code == 200:
                logger.info(f"Trendyol sipariş {package_id} iptal edildi")
                return {"success": True, "message": "Sipariş iptal edildi"}
            else:
                error_detail = _extract_error(response)
                logger.warning(f"Trendyol iptal hatası: {response.status_code} - {error_detail}")
                return {"success": False, "error": f"API hatası: {response.status_code} - {error_detail}"}
                
    except Exception as e:
        logger.exception("Trendyol iptal hatası")
        return {"success": False, "error": str(e)}


async def update_restaurant_working_status(restaurant_id: str, is_open: bool) -> dict:
    """Trendyol'da restoran çalışma durumunu güncelle
    
    PUT /store/meal/suppliers/{supplierId}/stores/{storeId}/status
    Body: { "status": "OPEN" } veya { "status": "CLOSED" }
    """
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0}
    )
    
    if not restaurant:
        return {"success": False, "error": "Restoran bulunamadı"}
    
    integration = restaurant.get("platform_integrations", {}).get("trendyol", {})
    supplier_id = integration.get("supplier_id")
    store_id = integration.get("store_id")
    
    if not supplier_id:
        return {"success": False, "error": "Trendyol Supplier ID eksik"}
    
    if not store_id:
        return {"success": False, "error": "Trendyol Store ID eksik"}
    
    try:
        headers = await get_trendyol_headers(restaurant)
        async with httpx.AsyncClient(timeout=15.0) as client:
            url = f"{TRENDYOL_BASE_URL}/store/meal/suppliers/{supplier_id}/stores/{store_id}/status"
            body = {
                "status": "OPEN" if is_open else "CLOSED"
            }
            
            response = await client.put(url, headers=headers, json=body)
            
            if response.status_code == 200:
                status_text = "açık" if is_open else "kapalı"
                logger.info(f"Trendyol restoran durumu güncellendi: {status_text}")
                
                # Local durumu da güncelle
                await db.restaurants.update_one(
                    {"id": restaurant_id},
                    {"$set": {"platform_integrations.trendyol.is_open": is_open}}
                )
                
                return {"success": True, "message": f"Restoran durumu {status_text} olarak güncellendi"}
            else:
                error_detail = _extract_error(response)
                logger.warning(f"Trendyol restoran durumu hatası: {response.status_code} - {error_detail}")
                return {"success": False, "error": f"API hatası: {response.status_code} - {error_detail}"}
                
    except Exception as e:
        logger.exception("Trendyol restoran durumu güncelleme hatası")
        return {"success": False, "error": str(e)}


def _extract_error(response) -> str:
    """API response'dan hata mesajını çıkar"""
    try:
        error_data = response.json()
        return error_data.get("message", response.text[:200])
    except:
        return response.text[:200] if response.text else "Bilinmeyen hata"


async def sync_all_company_trendyol_orders(company_id: str) -> dict:
    """Şirketteki tüm restoranların Trendyol siparişlerini senkronize et"""
    restaurants = await db.restaurants.find(
        {
            "company_id": company_id,
            "platform_integrations.trendyol.enabled": True,
            "platform_integrations.trendyol.connected": True,
            "is_archived": {"$ne": True}
        },
        {"_id": 0, "id": 1, "name": 1}
    ).to_list(100)
    
    total_synced = 0
    results = []
    
    for restaurant in restaurants:
        result = await sync_restaurant_trendyol_orders(restaurant["id"])
        total_synced += result.get("synced", 0)
        results.append({
            "restaurant": restaurant["name"],
            "synced": result.get("synced", 0),
            "updated": result.get("updated", 0),
            "error": result.get("error")
        })
    
    return {
        "success": True,
        "total_synced": total_synced,
        "restaurants": results
    }
