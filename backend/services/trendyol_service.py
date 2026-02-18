"""
Trendyol Yemek API Entegrasyon Servisi
- Sipariş çekme (polling)
- Sipariş durumu güncelleme
- Restoran çalışma durumu yönetimi
"""
import httpx
import uuid
import base64
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any
from utils.database import db

logger = logging.getLogger(__name__)

TRENDYOL_BASE_URL = "https://api.trendyol.com/mealgw/suppliers"


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
        "User-Agent": f"ShiftJet-{restaurant.get('id', 'unknown')}"
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
                f"{TRENDYOL_BASE_URL}/{supplier_id}/orders",
                headers=headers,
                params={
                    "status": "Created",
                    "size": 1,
                    "page": 0
                }
            )
            
            if response.status_code == 200:
                return {"success": True, "message": "Trendyol bağlantısı başarılı"}
            elif response.status_code == 401:
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


def map_trendyol_status(status: str) -> str:
    """Trendyol status'unu ShiftJet durumuna çevir"""
    status_map = {
        "Created": "preparing",        # Yeni sipariş
        "Picking": "preparing",        # Kabul edildi, hazırlanıyor
        "Invoiced": "ready",           # Hazır
        "Shipped": "on_the_way",       # Yola çıktı
        "Delivered": "delivered",      # Teslim edildi
        "Unsupplied": "cancelled",     # İptal/Tedarik edilemedi
        "Cancelled": "cancelled"       # İptal
    }
    return status_map.get(status, "preparing")


def map_trendyol_payment(payment_type: str) -> str:
    """Trendyol ödeme yöntemini ShiftJet'e çevir"""
    payment_lower = (payment_type or "").lower()
    
    if "nakit" in payment_lower or "cash" in payment_lower:
        return "cash"
    elif "kart" in payment_lower or "card" in payment_lower:
        if "online" in payment_lower:
            return "online"
        return "card"
    elif "online" in payment_lower:
        return "online"
    
    # Trendyol default olarak online ödeme
    return "online"


async def fetch_trendyol_orders(restaurant_id: str, status: str = None, page: int = 0, size: int = 50) -> dict:
    """Trendyol'dan siparişleri çek"""
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0}
    )
    
    if not restaurant:
        return {"success": False, "error": "Restoran bulunamadı", "orders": []}
    
    integration = restaurant.get("platform_integrations", {}).get("trendyol", {})
    supplier_id = integration.get("supplier_id")
    
    if not supplier_id:
        return {"success": False, "error": "Trendyol Supplier ID eksik", "orders": []}
    
    try:
        headers = await get_trendyol_headers(restaurant)
        params = {
            "size": size,
            "page": page
        }
        
        if status:
            params["status"] = status
        
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.get(
                f"{TRENDYOL_BASE_URL}/{supplier_id}/orders",
                headers=headers,
                params=params
            )
            
            if response.status_code == 200:
                data = response.json()
                content = data.get("content", [])
                return {
                    "success": True,
                    "orders": content,
                    "total": data.get("totalElements", 0),
                    "page": data.get("number", 0),
                    "total_pages": data.get("totalPages", 0)
                }
            else:
                return {"success": False, "error": f"API hatası: {response.status_code}", "orders": []}
                
    except Exception as e:
        logger.exception("Trendyol sipariş çekme hatası")
        return {"success": False, "error": str(e), "orders": []}


async def convert_trendyol_order_to_shiftjet(trendyol_order: dict, restaurant: dict) -> dict:
    """Trendyol sipariş formatını ShiftJet formatına çevir"""
    
    # Trendyol sipariş yapısı
    order_number = trendyol_order.get("orderNumber", "")
    customer_name = trendyol_order.get("customerName", "Müşteri")
    
    # Adres bilgisi
    delivery_address = trendyol_order.get("deliveryAddress", {})
    address_text = delivery_address.get("fullAddress", "")
    if not address_text:
        address_parts = []
        if delivery_address.get("neighborhood"):
            address_parts.append(delivery_address["neighborhood"])
        if delivery_address.get("street"):
            address_parts.append(delivery_address["street"])
        if delivery_address.get("buildingNo"):
            address_parts.append(f"No: {delivery_address['buildingNo']}")
        if delivery_address.get("flatNo"):
            address_parts.append(f"Daire: {delivery_address['flatNo']}")
        address_text = ", ".join(address_parts) or "Adres belirtilmemiş"
    
    # Ürünleri dönüştür
    items = []
    lines = trendyol_order.get("lines", [])
    for line in lines:
        item_name = line.get("productName", "Ürün")
        quantity = int(line.get("quantity", 1))
        price = float(line.get("price", 0))
        
        # Seçenekler/opsiyonlar varsa ekle
        options = line.get("selectedOptions", [])
        if options:
            option_names = [opt.get("name", "") for opt in options if opt.get("name")]
            if option_names:
                item_name += f" ({', '.join(option_names)})"
        
        items.append({
            "name": item_name,
            "quantity": quantity,
            "price": price,
            "notes": line.get("note", "")
        })
    
    # Toplam tutar
    total_amount = float(trendyol_order.get("totalPrice", 0))
    
    # Ödeme yöntemi
    payment_type = trendyol_order.get("paymentType", "Online")
    
    # Sipariş notları
    notes_parts = []
    if trendyol_order.get("customerNote"):
        notes_parts.append(f"CUSTOMER:{trendyol_order['customerNote']}")
    if delivery_address.get("addressDescription"):
        notes_parts.append(f"ADDRESS:{delivery_address['addressDescription']}")
    order_notes = "|".join(notes_parts)
    
    # Koordinatlar
    delivery_lat = delivery_address.get("latitude")
    delivery_lng = delivery_address.get("longitude")
    
    # Telefon - Trendyol genelde gizler ama bazen gelir
    customer_phone = trendyol_order.get("customerPhone", "")
    
    return {
        "id": str(uuid.uuid4()),
        "order_number": f"TY-{order_number}",
        "trendyol_order_id": trendyol_order.get("id"),
        "trendyol_order_number": order_number,
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
        "payment_method": map_trendyol_payment(payment_type),
        "status": map_trendyol_status(trendyol_order.get("status", "Created")),
        "notes": order_notes,
        "source": "trendyol",
        "created_at": trendyol_order.get("orderDate") or datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "courier_id": None,
        "courier_name": None,
        "trendyol_raw": {
            "status": trendyol_order.get("status"),
            "paymentType": trendyol_order.get("paymentType"),
            "deliveryType": trendyol_order.get("deliveryType"),
            "estimatedDeliveryTime": trendyol_order.get("estimatedDeliveryTime")
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
    
    # ShiftJet'te daha ileri durumlar
    shiftjet_priority_statuses = ["assigned", "confirmed", "on_the_way", "delivered", "cancelled"]
    
    # Aktif siparişleri çek (Created, Picking, Invoiced, Shipped)
    active_statuses = ["Created", "Picking", "Invoiced", "Shipped"]
    
    for status in active_statuses:
        result = await fetch_trendyol_orders(restaurant_id, status=status, page=0, size=100)
        
        if not result["success"]:
            continue
        
        for trendyol_order in result["orders"]:
            trendyol_order_number = trendyol_order.get("orderNumber")
            
            # Bu sipariş zaten var mı kontrol et
            existing = await db.orders.find_one({"trendyol_order_number": trendyol_order_number})
            
            if existing:
                current_status = existing.get("status")
                
                # Eğer ShiftJet'te kurye atanmış veya ilerlemiş ise, durumu DEĞİŞTİRME
                if current_status in shiftjet_priority_statuses:
                    skipped_count += 1
                    continue
                
                # Trendyol'dan durum güncellemesi varsa uygula
                new_status = map_trendyol_status(trendyol_order.get("status", "Created"))
                if current_status != new_status and new_status in ["delivered", "cancelled"]:
                    await db.orders.update_one(
                        {"trendyol_order_number": trendyol_order_number},
                        {"$set": {
                            "status": new_status,
                            "updated_at": datetime.now(timezone.utc).isoformat()
                        }}
                    )
                
                skipped_count += 1
                continue
            
            # Yeni sipariş - dönüştür ve kaydet
            shiftjet_order = await convert_trendyol_order_to_shiftjet(trendyol_order, restaurant)
            
            # Hazırlama süresini hesapla
            try:
                from routers.orders import calculate_preparation_time_async
                prep_time = await calculate_preparation_time_async(restaurant_id, shiftjet_order.get("items", []))
            except:
                prep_time = 20  # Default 20 dakika
            
            prep_end = datetime.now(timezone.utc) + timedelta(minutes=prep_time)
            shiftjet_order["preparation_time"] = prep_time
            shiftjet_order["preparation_end_at"] = prep_end.isoformat()
            
            await db.orders.insert_one(shiftjet_order)
            synced_count += 1
    
    # Son senkronizasyon zamanını güncelle
    await db.restaurants.update_one(
        {"id": restaurant_id},
        {"$set": {"platform_integrations.trendyol.last_sync": datetime.now(timezone.utc).isoformat()}}
    )
    
    return {
        "success": True,
        "synced": synced_count,
        "skipped": skipped_count
    }


# --- Trendyol'a durum güncelleme ---

async def update_trendyol_order_status(restaurant_id: str, order_id: str, new_status: str) -> dict:
    """Trendyol'da sipariş durumunu güncelle
    
    ShiftJet durumu -> Trendyol endpoint'i:
    - preparing (kabul) -> picked
    - ready -> invoiced
    - on_the_way -> manual-shipped
    - delivered -> manual-delivered
    - cancelled -> unsupplied
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
    
    trendyol_order_number = order.get("trendyol_order_number")
    if not trendyol_order_number:
        return {"success": False, "error": "Bu sipariş Trendyol siparişi değil"}
    
    # Status endpoint mapping
    endpoint_map = {
        "preparing": "picked",           # Siparişi kabul et
        "ready": "invoiced",             # Hazırlandı
        "on_the_way": "manual-shipped",  # Yola çıktı
        "delivered": "manual-delivered", # Teslim edildi
        "cancelled": "unsupplied"        # İptal/Tedarik edilemedi
    }
    
    endpoint_action = endpoint_map.get(new_status)
    if not endpoint_action:
        return {"success": False, "error": f"Geçersiz durum: {new_status}"}
    
    try:
        headers = await get_trendyol_headers(restaurant)
        async with httpx.AsyncClient(timeout=15.0) as client:
            url = f"{TRENDYOL_BASE_URL}/{supplier_id}/orders/{trendyol_order_number}/{endpoint_action}"
            
            # unsupplied için body gerekli
            if endpoint_action == "unsupplied":
                body = {
                    "unsuppliedReasonId": 1  # Genel iptal nedeni
                }
                response = await client.put(url, headers=headers, json=body)
            else:
                response = await client.put(url, headers=headers)
            
            if response.status_code == 200:
                logger.info(f"Trendyol sipariş {trendyol_order_number} durumu güncellendi: {new_status}")
                return {"success": True, "message": "Durum güncellendi"}
            else:
                error_detail = ""
                try:
                    error_data = response.json()
                    error_detail = error_data.get("message", response.text[:200])
                except:
                    error_detail = response.text[:200]
                
                logger.warning(f"Trendyol durum güncelleme hatası: {response.status_code} - {error_detail}")
                return {"success": False, "error": f"API hatası: {response.status_code} - {error_detail}"}
                
    except Exception as e:
        logger.exception("Trendyol durum güncelleme hatası")
        return {"success": False, "error": str(e)}


async def update_restaurant_working_status(restaurant_id: str, is_open: bool) -> dict:
    """Trendyol'da restoran çalışma durumunu güncelle"""
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
    
    try:
        headers = await get_trendyol_headers(restaurant)
        async with httpx.AsyncClient(timeout=15.0) as client:
            url = f"{TRENDYOL_BASE_URL}/{supplier_id}/working-status"
            body = {"isOpen": is_open}
            
            response = await client.put(url, headers=headers, json=body)
            
            if response.status_code == 200:
                status_text = "açık" if is_open else "kapalı"
                logger.info(f"Trendyol restoran durumu güncellendi: {status_text}")
                return {"success": True, "message": f"Restoran durumu {status_text} olarak güncellendi"}
            else:
                return {"success": False, "error": f"API hatası: {response.status_code}"}
                
    except Exception as e:
        logger.exception("Trendyol restoran durumu güncelleme hatası")
        return {"success": False, "error": str(e)}


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
            "error": result.get("error")
        })
    
    return {
        "success": True,
        "total_synced": total_synced,
        "restaurants": results
    }
