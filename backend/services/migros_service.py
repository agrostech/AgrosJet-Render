"""
Migros Yemek Entegrasyon Servisi
- AES-256-ECB Rijndael şifreleme/çözme
- Sipariş polling
- Durum güncelleme
"""

import base64
import json
import logging
import httpx
import uuid
from typing import Optional, Dict, Any, List
from datetime import datetime, timezone, timedelta
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad, unpad
from utils.helpers import ensure_turkey_timezone, get_turkey_now

# Türkiye timezone (UTC+3)
TURKEY_TZ = timezone(timedelta(hours=3))

logger = logging.getLogger(__name__)

# Migros Yemek API Base URLs
MIGROS_TEST_URL = "https://test.gourmet.migrosonline.com"
MIGROS_PROD_URL = "https://gourmet.migrosonline.com"


class MigrosYemekService:
    """Migros Yemek API entegrasyon servisi"""
    
    def __init__(self, api_key: str, secret_key: str, is_test: bool = True):
        self.api_key = api_key
        self.secret_key = secret_key
        self.base_url = MIGROS_TEST_URL if is_test else MIGROS_PROD_URL
        
    def _get_headers(self) -> Dict[str, str]:
        """API istekleri için header'ları döndür"""
        return {
            "Content-Type": "application/json",
            "XApiKey": self.api_key
        }
    
    def encrypt(self, data: Dict[str, Any]) -> str:
        """
        Veriyi AES-256-ECB ile şifrele
        Migros Yemek Rijndael şifreleme formatı
        """
        try:
            # JSON string'e çevir
            json_str = json.dumps(data, ensure_ascii=False)
            
            # Secret key'i 32 byte'a tamamla (AES-256)
            key = self.secret_key.encode('utf-8')
            if len(key) < 32:
                key = key + b'\0' * (32 - len(key))
            elif len(key) > 32:
                key = key[:32]
            
            # AES-ECB cipher oluştur
            cipher = AES.new(key, AES.MODE_ECB)
            
            # PKCS7 padding uygula ve şifrele
            padded_data = pad(json_str.encode('utf-8'), AES.block_size)
            encrypted = cipher.encrypt(padded_data)
            
            # Base64 encode
            return base64.b64encode(encrypted).decode('utf-8')
            
        except Exception as e:
            logger.error(f"Migros şifreleme hatası: {e}")
            raise
    
    def decrypt(self, encrypted_data: str) -> Dict[str, Any]:
        """
        AES-256-ECB ile şifrelenmiş veriyi çöz
        """
        try:
            # Secret key'i 32 byte'a tamamla
            key = self.secret_key.encode('utf-8')
            if len(key) < 32:
                key = key + b'\0' * (32 - len(key))
            elif len(key) > 32:
                key = key[:32]
            
            # AES-ECB cipher oluştur
            cipher = AES.new(key, AES.MODE_ECB)
            
            # Base64 decode ve decrypt
            encrypted_bytes = base64.b64decode(encrypted_data)
            decrypted = cipher.decrypt(encrypted_bytes)
            
            # PKCS7 padding kaldır
            unpadded = unpad(decrypted, AES.block_size)
            
            # JSON parse
            return json.loads(unpadded.decode('utf-8'))
            
        except Exception as e:
            logger.error(f"Migros şifre çözme hatası: {e}")
            raise
    
    async def _make_request(
        self, 
        method: str, 
        endpoint: str, 
        data: Optional[Dict] = None,
        encrypt_request: bool = True,
        decrypt_response: bool = True
    ) -> Dict[str, Any]:
        """API isteği yap"""
        url = f"{self.base_url}{endpoint}"
        headers = self._get_headers()
        
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                if method == "GET":
                    response = await client.get(url, headers=headers)
                else:
                    # POST için veriyi şifrele
                    if data and encrypt_request:
                        encrypted = self.encrypt(data)
                        # Şifrelenmiş veri {"value": "..."} formatında gönderilmeli
                        body = json.dumps({"value": encrypted})
                    else:
                        body = json.dumps(data) if data else None
                    
                    response = await client.post(url, content=body, headers=headers)
                
                logger.info(f"Migros API {method} {endpoint}: {response.status_code}")
                
                if response.status_code == 200:
                    response_text = response.text
                    
                    # Response'u çöz
                    if decrypt_response and response_text:
                        try:
                            # Önce JSON parse dene
                            result = json.loads(response_text)
                            # Eğer "data" alanı encrypted ise çöz
                            if isinstance(result, dict) and "data" in result:
                                if isinstance(result["data"], str):
                                    result["data"] = self.decrypt(result["data"])
                            return result
                        except json.JSONDecodeError:
                            # Direkt encrypted olabilir
                            return self.decrypt(response_text)
                    else:
                        return json.loads(response_text) if response_text else {}
                else:
                    logger.error(f"Migros API hatası: {response.status_code} - {response.text}")
                    return {"success": False, "error": response.text, "status_code": response.status_code}
                    
        except Exception as e:
            logger.error(f"Migros API isteği hatası: {e}")
            return {"success": False, "error": str(e)}
    
    async def get_order_status_list(self) -> Dict[str, Any]:
        """Sipariş durum tiplerini getir (şifreleme yok)"""
        return await self._make_request(
            "GET", 
            "/Mapping/GetOrderStatusList",
            encrypt_request=False,
            decrypt_response=False
        )
    
    async def get_cancel_reasons(self) -> Dict[str, Any]:
        """İptal sebeplerini getir (şifreleme yok)"""
        return await self._make_request(
            "GET",
            "/Mapping/v2/GetCancelReasons",
            encrypt_request=False,
            decrypt_response=False
        )
    
    async def get_pending_orders(self, store_ids: List[int], limit: int = 20, offset: int = 0) -> Dict[str, Any]:
        """Bekleyen siparişleri getir"""
        data = {
            "storeIds": store_ids,
            "limit": limit,
            "offset": offset
        }
        return await self._make_request("POST", "/Order/PendingOrdersWithStores", data)
    
    async def get_active_orders(self, store_ids: List[int], limit: int = 20, offset: int = 0) -> Dict[str, Any]:
        """Aktif siparişleri getir"""
        data = {
            "storeIds": store_ids,
            "limit": limit,
            "offset": offset
        }
        return await self._make_request("POST", "/Order/ActiveOrdersWithStores", data)
    
    async def get_order_details(self, order_id: int, user_id: int) -> Dict[str, Any]:
        """Sipariş detayını getir"""
        data = {
            "orderId": order_id,
            "userId": user_id
        }
        return await self._make_request("POST", "/Order/GetSummarizedOrder", data)
    
    async def update_order_status(
        self, 
        order_id: int, 
        store_id: int, 
        status: str,
        cancel_reason_id: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Sipariş durumunu güncelle
        status: Approved, Rejected, Prepared, Delivery, Completed
        """
        data = {
            "orderId": order_id,
            "orderStatus": status,
            "storeId": store_id
        }
        
        if status == "Rejected" and cancel_reason_id:
            data["cancelReasonId"] = cancel_reason_id
            
        return await self._make_request("POST", "/Order/v2/UpdateOrderStatus", data)
    
    async def cancel_order(
        self,
        order_id: int,
        user_id: int,
        cancel_reason_id: int,
        notify_user: bool = True
    ) -> Dict[str, Any]:
        """Siparişi iptal et"""
        data = {
            "orderId": order_id,
            "userId": user_id,
            "cancelReasonId": cancel_reason_id,
            "notifyUser": notify_user
        }
        return await self._make_request("POST", "/Order/v2/CancelOrder", data)
    
    async def test_connection(self) -> Dict[str, Any]:
        """Bağlantı testi - sipariş durum listesini çek"""
        try:
            result = await self.get_order_status_list()
            if "data" in result or "success" in result:
                return {"success": True, "message": "Bağlantı başarılı", "data": result}
            else:
                return {"success": True, "message": "Bağlantı başarılı", "data": result}
        except Exception as e:
            return {"success": False, "error": str(e)}


def transform_migros_order_to_shiftjet(migros_order: Dict[str, Any], restaurant_id: str, company_id: str = None) -> Dict[str, Any]:
    """
    Migros Yemek sipariş formatını AgrosJet formatına dönüştür.
    Bu fonksiyon hem polling hem de webhook için kullanılabilir.
    
    Migros Order Yapısı:
    - id: Sipariş ID
    - description: Sipariş özeti
    - status: NEW_PENDING, APPROVED, etc.
    - deliveryProvider: RESTAURANT veya MIGROS
    - store: {id, name, group: {id, name}}
    - customer: {id, firstName, lastName, fullName, phoneNumber, deliveryAddress: {...}}
    - prices: {total, discounted, restaurantDiscounted, migrosDiscounted}
    - items: [{id, productId, name, price, priceText, amount, note, options: [...]}]
    - payment: {type: {name, description, isOnlinePayment, ...}}
    - extendedProperties: {orderNote, saveGreen, contactlessDelivery, ringDoorBell}
    - log: {createdAsMs}
    """
    customer = migros_order.get("customer", {})
    delivery_address = customer.get("deliveryAddress", {})
    geo_location = delivery_address.get("geoLocation", {})
    prices = migros_order.get("prices", {})
    payment = migros_order.get("payment", {}).get("type", {})
    extended = migros_order.get("extendedProperties", {})
    store = migros_order.get("store", {})
    
    # Ödeme tipi dönüşümü
    payment_type_map = {
        "CASH_ON_DELIVERY": "cash",
        "CREDIT_CARD_ON_DELIVERY": "card",
        "CREDIT_CARD": "online",
        "ONLINE_PAYMENT": "online",
        "MEAL_CARD": "meal_card",
        "MEAL_CARD_ON_DELIVERY": "meal_card"
    }
    payment_name = payment.get("name") or payment.get("simplifiedName", "CASH_ON_DELIVERY")
    is_online = payment.get("isOnlinePayment", False)
    payment_type = payment_type_map.get(payment_name, "online" if is_online else "cash")
    
    # Ürünleri dönüştür
    items = []
    for item in migros_order.get("items", []):
        # Migros'ta price toplam fiyat olarak geliyor (kuruş cinsinden)
        # price = quantity * birim fiyat
        total_price_penny = item.get("price", 0)
        quantity = item.get("amount", 1)
        
        # Birim fiyatı hesapla
        if quantity > 0:
            unit_price = (total_price_penny / 100) / quantity
        else:
            unit_price = total_price_penny / 100
        
        total_price = total_price_penny / 100
        
        item_data = {
            "id": str(item.get("productId", item.get("id", ""))),
            "name": item.get("name", ""),
            "quantity": quantity,
            "unit_price": unit_price,
            "total_price": total_price,
            "note": item.get("note", ""),
            "options": []
        }
        
        # Opsiyonları recursive olarak ekle (nested options desteği)
        def parse_options(options_list, parent_header=None):
            """Migros opsiyonlarını recursive olarak parse et"""
            parsed = []
            for opt in (options_list or []):
                opt_price = opt.get("primaryPrice", 0) / 100
                header_name = opt.get("headerName", "")
                item_names = opt.get("itemNames", "")
                quantity = opt.get("quantity", 1)
                excluded = opt.get("excluded", False)
                
                # Ana opsiyon
                if item_names:
                    # Eğer itemNames virgülle ayrılmış birden fazla öğe içeriyorsa, her birini ayrı ekle
                    items_split = [x.strip() for x in item_names.split(",") if x.strip()]
                    
                    if len(items_split) > 1:
                        # Birden fazla öğe var (örn: "Biber, Extra Şerbet, Mayonez")
                        for single_item in items_split:
                            parsed.append({
                                "name": f"{header_name}: {single_item}" if header_name else single_item,
                                "header": header_name,
                                "value": single_item,
                                "price": 0,  # Çoklu öğelerde fiyat genelde ana satırda
                                "quantity": 1,
                                "excluded": excluded,
                                "parent_header": parent_header
                            })
                    else:
                        parsed.append({
                            "name": f"{header_name}: {item_names}" if header_name else item_names,
                            "header": header_name,
                            "value": item_names,
                            "price": opt_price,
                            "quantity": quantity,
                            "excluded": excluded,
                            "parent_header": parent_header
                        })
                
                # Alt seçenekleri (child options) recursive olarak parse et
                child_options = opt.get("options") or opt.get("childOptions") or opt.get("subOptions") or []
                if child_options:
                    # Alt seçenek için parent header'ı ayarla
                    child_parent = header_name or item_names or parent_header
                    parsed.extend(parse_options(child_options, child_parent))
            
            return parsed
        
        item_data["options"] = parse_options(item.get("options") or [])
        
        items.append(item_data)
    
    # Toplam tutarı hesapla (kuruştan TL'ye)
    total_amount = prices.get("discounted", {}).get("amountAsPenny", 0) / 100
    if total_amount == 0:
        total_amount = prices.get("total", {}).get("amountAsPenny", 0) / 100
    
    # İndirim hesapla
    original_total = prices.get("total", {}).get("amountAsPenny", 0) / 100
    discount = original_total - total_amount if original_total > total_amount else 0
    
    # Oluşturma zamanı
    created_ms = migros_order.get("log", {}).get("createdAsMs", 0)
    if created_ms:
        created_at = datetime.fromtimestamp(created_ms / 1000, tz=TURKEY_TZ).isoformat()
    else:
        created_at = get_turkey_now()
    
    return {
        "id": str(uuid.uuid4()),
        "external_id": f"migros_{migros_order.get('id')}",
        "platform": "migros",
        "platform_id": str(migros_order.get("id")),
        "restaurant_id": restaurant_id,
        "company_id": company_id,
        "source": "migros",
        "status": "pending",
        
        # Müşteri bilgileri
        "customer_name": customer.get("fullName", ""),
        "customer_phone": customer.get("phoneNumber", ""),
        "delivery_address": delivery_address.get("detail", ""),
        "address_direction": delivery_address.get("direction", ""),
        "delivery_location": {
            "latitude": geo_location.get("latitude"),
            "longitude": geo_location.get("longitude")
        },
        "city": delivery_address.get("city", {}).get("name", ""),
        "district": delivery_address.get("town", {}).get("name", ""),
        "neighborhood": delivery_address.get("district", {}).get("name", ""),
        
        # Ürünler
        "items": items,
        "description": migros_order.get("description", ""),
        
        # Ödeme bilgileri
        "total_amount": total_amount,
        "payment_type": payment_type,
        "payment_method": payment.get("description", ""),
        "is_paid": is_online,
        "discount": discount,
        
        # Ek özellikler
        "note": extended.get("orderNote", ""),
        "contactless_delivery": extended.get("contactlessDelivery", False),
        "ring_doorbell": extended.get("ringDoorBell", True),
        "save_green": extended.get("saveGreen", False),
        
        # Migros spesifik veriler
        "migros_data": {
            "order_id": migros_order.get("id"),
            "user_id": customer.get("id"),
            "store_id": store.get("id"),
            "store_name": store.get("name"),
            "store_group_id": store.get("group", {}).get("id"),
            "store_group_name": store.get("group", {}).get("name"),
            "delivery_provider": migros_order.get("deliveryProvider"),
            "original_status": migros_order.get("status"),
            "prices": prices
        },
        
        # Zaman damgaları
        "created_at": created_at,
        "updated_at": get_turkey_now(),
        "platform_created_at": created_at,
        
        # Orijinal veriyi sakla
        "platform_data": migros_order
    }


async def sync_restaurant_migros_orders(restaurant_id: str) -> dict:
    """
    Tek bir restoran için Migros siparişlerini senkronize et
    """
    from utils.database import db
    from services.credit_service import insert_order
    
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0}
    )
    
    if not restaurant:
        return {"success": False, "error": "Restoran bulunamadı"}
    
    # Önce migros_config'e bak, yoksa integration_stores'dan al
    migros_config = restaurant.get("migros_config", {})
    
    if not migros_config.get("api_key"):
        # integration_stores'dan Migros config'i bul
        integration_stores = restaurant.get("integration_stores", [])
        for store in integration_stores:
            if store.get("platform") == "migros" and store.get("enabled"):
                creds = store.get("credentials", {})
                migros_config = {
                    "api_key": creds.get("api_key"),
                    "secret_key": creds.get("secret_key"),
                    "store_id": creds.get("store_id"),
                    "is_test": creds.get("is_test", False)
                }
                break
    
    if not migros_config.get("api_key") or not migros_config.get("secret_key"):
        return {"success": False, "error": "Migros yapılandırması eksik"}
    
    try:
        service = MigrosYemekService(
            api_key=migros_config["api_key"],
            secret_key=migros_config["secret_key"],
            is_test=migros_config.get("is_test", False)
        )
        
        store_id = migros_config.get("store_id")
        if not store_id:
            return {"success": False, "error": "Store ID eksik"}
        
        # Bekleyen siparişleri çek
        result = await service.get_pending_orders(
            store_ids=[store_id],
            limit=50,
            offset=0
        )
        
        if not result.get("success"):
            return {"success": False, "error": result.get("error", "Siparişler alınamadı")}
        
        orders = result.get("data", {}).get("orders", [])
        synced_count = 0
        
        for migros_order in orders:
            migros_order_id = migros_order.get("id")
            
            # Bu sipariş zaten var mı?
            existing = await db.orders.find_one({
                "migros_data.order_id": migros_order_id
            })
            
            if existing:
                continue
            
            # Yeni sipariş oluştur
            shiftjet_order = transform_migros_order_to_shiftjet(
                migros_order, 
                restaurant_id, 
                restaurant.get("company_id")
            )
            
            await insert_order(shiftjet_order)
            synced_count += 1
            logger.info(f"Migros sipariş senkronize edildi: {migros_order_id}")
        
        return {
            "success": True,
            "total_fetched": len(orders),
            "total_synced": synced_count
        }
        
    except Exception as e:
        logger.error(f"Migros sync hatası: {e}")
        return {"success": False, "error": str(e)}


async def sync_all_company_migros_orders(company_id: str) -> dict:
    """
    Bir şirketin tüm restoranları için Migros siparişlerini senkronize et
    """
    from utils.database import db
    
    # Migros yapılandırması olan restoranları bul (hem migros_config hem integration_stores)
    restaurants = await db.restaurants.find(
        {
            "company_id": company_id,
            "$or": [
                {"migros_config.api_key": {"$exists": True, "$ne": ""}},
                {"integration_stores": {"$elemMatch": {"platform": "migros", "enabled": True}}}
            ]
        },
        {"_id": 0, "id": 1, "name": 1}
    ).to_list(100)
    
    total_synced = 0
    errors = []
    
    for restaurant in restaurants:
        result = await sync_restaurant_migros_orders(restaurant["id"])
        if result.get("success"):
            total_synced += result.get("total_synced", 0)
        else:
            errors.append(f"{restaurant['name']}: {result.get('error')}")
    
    return {
        "success": True,
        "total_synced": total_synced,
        "restaurants_checked": len(restaurants),
        "errors": errors if errors else None
    }
