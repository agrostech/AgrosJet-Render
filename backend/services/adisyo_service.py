"""
Adisyo API Entegrasyon Servisi
- Sipariş çekme (polling)
- Sipariş durumu güncelleme
- Webhook işleme
"""
import httpx
import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from utils.database import db

ADISYO_BASE_URL = "https://ext.adisyo.com/api/External/v2"


async def get_adisyo_headers(restaurant: dict) -> dict:
    """Adisyo API için gerekli header'ları oluştur"""
    return {
        "x-api-key": restaurant.get("adisyo_api_key", ""),
        "x-api-secret": restaurant.get("adisyo_api_secret", ""),
        "x-api-consumer": restaurant.get("name", "ShiftJet"),
        "Content-Type": "application/json"
    }


async def test_adisyo_connection(restaurant_id: str) -> dict:
    """Adisyo API bağlantısını test et"""
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0}
    )
    
    if not restaurant:
        return {"success": False, "error": "Restoran bulunamadı"}
    
    if not restaurant.get("adisyo_api_key") or not restaurant.get("adisyo_api_secret"):
        return {"success": False, "error": "Adisyo API bilgileri eksik"}
    
    try:
        headers = await get_adisyo_headers(restaurant)
        async with httpx.AsyncClient(timeout=10.0) as client:
            # Recent orders endpoint'ini test amaçlı çağır
            response = await client.get(
                f"{ADISYO_BASE_URL}/RecentOrders",
                headers=headers,
                params={"onlyRestaurantCourier": "true"}
            )
            
            if response.status_code == 200:
                return {"success": True, "message": "Bağlantı başarılı"}
            elif response.status_code == 401:
                return {"success": False, "error": "API anahtarları geçersiz"}
            else:
                return {"success": False, "error": f"API hatası: {response.status_code}"}
                
    except httpx.TimeoutException:
        return {"success": False, "error": "Bağlantı zaman aşımı"}
    except Exception as e:
        return {"success": False, "error": f"Bağlantı hatası: {str(e)}"}


async def fetch_recent_orders(restaurant_id: str) -> dict:
    """Adisyo'dan son siparişleri çek"""
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0}
    )
    
    if not restaurant:
        return {"success": False, "error": "Restoran bulunamadı", "orders": []}
    
    if not restaurant.get("adisyo_api_key") or not restaurant.get("adisyo_api_secret"):
        return {"success": False, "error": "Adisyo API bilgileri eksik", "orders": []}
    
    try:
        headers = await get_adisyo_headers(restaurant)
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(
                f"{ADISYO_BASE_URL}/RecentOrders",
                headers=headers,
                params={"onlyRestaurantCourier": "true"}
            )
            
            if response.status_code == 200:
                data = response.json()
                orders = data.get("data", [])
                return {"success": True, "orders": orders, "total": data.get("totalCount", 0)}
            else:
                return {"success": False, "error": f"API hatası: {response.status_code}", "orders": []}
                
    except Exception as e:
        return {"success": False, "error": str(e), "orders": []}


async def get_order_details(restaurant_id: str, adisyo_order_id: int) -> dict:
    """Adisyo'dan sipariş detaylarını çek"""
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0}
    )
    
    if not restaurant:
        return {"success": False, "error": "Restoran bulunamadı"}
    
    try:
        headers = await get_adisyo_headers(restaurant)
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{ADISYO_BASE_URL}/Order/{adisyo_order_id}",
                headers=headers
            )
            
            if response.status_code == 200:
                data = response.json()
                return {"success": True, "order": data.get("data")}
            else:
                return {"success": False, "error": f"API hatası: {response.status_code}"}
                
    except Exception as e:
        return {"success": False, "error": str(e)}


def map_adisyo_status(status_id: int, status_name: str) -> str:
    """Adisyo status ID'sini ShiftJet durumuna çevir"""
    # Adisyo status'ları:
    # 1: Beklemede, 2: Hazırlanıyor, 3: Hazır, 4: Teslimatta, 5: Teslim Edildi, 6: İptal
    status_map = {
        1: "preparing",      # Beklemede -> Hazırlanıyor
        2: "preparing",      # Hazırlanıyor
        3: "ready",          # Hazır
        4: "on_the_way",     # Teslimatta -> Yolda
        5: "delivered",      # Teslim Edildi
        6: "cancelled"       # İptal
    }
    return status_map.get(status_id, "preparing")


def map_adisyo_payment(payment_method_id: int, payment_method_name: str) -> str:
    """Adisyo ödeme yöntemini ShiftJet'e çevir"""
    # 1: Nakit, 2: Kredi Kartı, 3: Online
    if payment_method_id == 1 or "nakit" in payment_method_name.lower():
        return "cash"
    elif payment_method_id == 3 or "online" in payment_method_name.lower():
        return "online"
    else:
        return "card"


async def convert_adisyo_order_to_shiftjet(adisyo_order: dict, restaurant: dict) -> dict:
    """Adisyo sipariş formatını ShiftJet formatına çevir"""
    customer = adisyo_order.get("customer", {})
    products = adisyo_order.get("products", [])
    
    # Ürünleri dönüştür
    items = []
    for product in products:
        items.append({
            "name": product.get("productName", "Ürün"),
            "quantity": int(product.get("quantity", 1)),
            "price": float(product.get("unitPrice", 0)),
            "notes": product.get("productNote", "")
        })
    
    # Müşteri adresi
    address_parts = []
    if customer.get("address"):
        address_parts.append(customer["address"])
    if customer.get("addressDescription"):
        address_parts.append(customer["addressDescription"])
    if customer.get("region"):
        address_parts.append(customer["region"])
    
    delivery_address = ", ".join(filter(None, address_parts)) or "Adres belirtilmemiş"
    
    return {
        "id": str(uuid.uuid4()),
        "order_number": f"ADY-{adisyo_order.get('orderNumber', adisyo_order.get('id'))}",
        "adisyo_order_id": adisyo_order.get("id"),
        "external_app_id": adisyo_order.get("externalAppId"),
        "external_app_name": adisyo_order.get("externalAppName", "Adisyo"),
        "company_id": restaurant.get("company_id"),
        "restaurant_id": restaurant.get("id"),
        "restaurant_name": restaurant.get("name"),
        "restaurant_location": {
            "latitude": restaurant.get("latitude"),
            "longitude": restaurant.get("longitude")
        },
        "customer_name": f"{customer.get('customerName', '')} {customer.get('customerSurname', '')}".strip() or "Müşteri",
        "customer_phone": customer.get("customerPhone", ""),
        "delivery_address": delivery_address,
        "delivery_location": {
            "latitude": adisyo_order.get("customerLatitude"),
            "longitude": adisyo_order.get("customerLongitude")
        },
        "items": items,
        "total_amount": float(adisyo_order.get("orderTotal", 0)),
        "payment_method": map_adisyo_payment(
            adisyo_order.get("paymentMethodId", 1),
            adisyo_order.get("paymentMethodName", "Nakit")
        ),
        "status": map_adisyo_status(
            adisyo_order.get("statusId", 1),
            adisyo_order.get("status", "Beklemede")
        ),
        "notes": adisyo_order.get("orderNote", ""),
        "source": "adisyo",
        "created_at": adisyo_order.get("insertDate") or datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "courier_id": None,
        "courier_name": None
    }


async def sync_restaurant_orders(restaurant_id: str) -> dict:
    """Restoran için Adisyo siparişlerini senkronize et"""
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0}
    )
    
    if not restaurant:
        return {"success": False, "error": "Restoran bulunamadı", "synced": 0}
    
    if not restaurant.get("adisyo_connected"):
        return {"success": False, "error": "Adisyo bağlantısı aktif değil", "synced": 0}
    
    # Adisyo'dan siparişleri çek
    result = await fetch_recent_orders(restaurant_id)
    
    if not result["success"]:
        return {"success": False, "error": result["error"], "synced": 0}
    
    synced_count = 0
    skipped_count = 0
    
    for adisyo_order in result["orders"]:
        adisyo_order_id = adisyo_order.get("id")
        
        # Bu sipariş zaten var mı kontrol et
        existing = await db.orders.find_one({"adisyo_order_id": adisyo_order_id})
        
        if existing:
            # Sipariş zaten var, durumu güncelle (eğer değiştiyse)
            new_status = map_adisyo_status(
                adisyo_order.get("statusId", 1),
                adisyo_order.get("status", "")
            )
            if existing.get("status") != new_status:
                await db.orders.update_one(
                    {"adisyo_order_id": adisyo_order_id},
                    {"$set": {
                        "status": new_status,
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }}
                )
            skipped_count += 1
            continue
        
        # Yeni sipariş - dönüştür ve kaydet
        shiftjet_order = await convert_adisyo_order_to_shiftjet(adisyo_order, restaurant)
        await db.orders.insert_one(shiftjet_order)
        synced_count += 1
    
    # Son senkronizasyon zamanını güncelle
    await db.restaurants.update_one(
        {"id": restaurant_id},
        {"$set": {"adisyo_last_sync": datetime.now(timezone.utc).isoformat()}}
    )
    
    return {
        "success": True,
        "synced": synced_count,
        "skipped": skipped_count,
        "total": len(result["orders"])
    }


async def sync_all_company_orders(company_id: str) -> dict:
    """Şirketteki tüm restoranların Adisyo siparişlerini senkronize et"""
    restaurants = await db.restaurants.find(
        {
            "company_id": company_id,
            "adisyo_connected": True,
            "is_archived": {"$ne": True}
        },
        {"_id": 0, "id": 1, "name": 1}
    ).to_list(100)
    
    total_synced = 0
    results = []
    
    for restaurant in restaurants:
        result = await sync_restaurant_orders(restaurant["id"])
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


# --- Adisyo'ya durum güncelleme ---
async def update_adisyo_order_status(restaurant_id: str, adisyo_order_id: int, status: str) -> dict:
    """Adisyo'da sipariş durumunu güncelle"""
    restaurant = await db.restaurants.find_one(
        {"id": restaurant_id},
        {"_id": 0}
    )
    
    if not restaurant:
        return {"success": False, "error": "Restoran bulunamadı"}
    
    try:
        headers = await get_adisyo_headers(restaurant)
        async with httpx.AsyncClient(timeout=10.0) as client:
            # Status endpoint'leri
            endpoint_map = {
                "ready": f"{ADISYO_BASE_URL}/Order/{adisyo_order_id}/Prepared",
                "on_the_way": f"{ADISYO_BASE_URL}/Order/{adisyo_order_id}/OnDelivery",
                "delivered": f"{ADISYO_BASE_URL}/Order/{adisyo_order_id}/Deliver",
                "cancelled": f"{ADISYO_BASE_URL}/Order/{adisyo_order_id}/Cancel"
            }
            
            endpoint = endpoint_map.get(status)
            if not endpoint:
                return {"success": False, "error": f"Geçersiz durum: {status}"}
            
            response = await client.post(endpoint, headers=headers)
            
            if response.status_code == 200:
                return {"success": True, "message": "Durum güncellendi"}
            else:
                return {"success": False, "error": f"API hatası: {response.status_code}"}
                
    except Exception as e:
        return {"success": False, "error": str(e)}
