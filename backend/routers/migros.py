"""
Migros Yemek Entegrasyon Router'ı
- Bağlantı testi
- Sipariş polling
- Durum güncelleme
"""

import logging
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from utils.database import db
from services.migros_service import MigrosYemekService, transform_migros_order_to_shiftjet
from services.credit_service import insert_order

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/migros", tags=["Migros Yemek"])

# Test ortamı bilgileri
MIGROS_TEST_SECRET = "YRwPHEl09DTCFkw5qrAHswr9e4h7Wex7"


class MigrosConfigRequest(BaseModel):
    api_key: str
    secret_key: str
    store_id: int
    store_group_id: int
    is_test: bool = True


class MigrosStatusUpdateRequest(BaseModel):
    order_id: int
    store_id: int
    status: str  # Approved, Rejected, Prepared, Delivery, Completed
    cancel_reason_id: Optional[int] = None


@router.get("/health")
async def health_check():
    """Migros Yemek entegrasyon durumu"""
    return {
        "status": "healthy",
        "service": "migros_yemek_integration",
        "test_endpoint": "https://test.gourmet.migrosonline.com",
        "prod_endpoint": "https://gourmet.migrosonline.com"
    }


@router.post("/test-connection")
async def test_connection(config: MigrosConfigRequest):
    """
    Migros Yemek bağlantı testi
    """
    try:
        service = MigrosYemekService(
            api_key=config.api_key,
            secret_key=config.secret_key,
            is_test=config.is_test
        )
        
        result = await service.test_connection()
        return result
        
    except Exception as e:
        logger.error(f"Migros bağlantı testi hatası: {e}")
        return {"success": False, "error": str(e)}


@router.post("/test-encryption")
async def test_encryption():
    """
    Şifreleme testi - Migros test secret key ile
    """
    try:
        service = MigrosYemekService(
            api_key="test",
            secret_key=MIGROS_TEST_SECRET,
            is_test=True
        )
        
        # Test verisi
        test_data = {"storeIds": [23000000101833], "limit": 5, "offset": 0}
        
        # Şifrele
        encrypted = service.encrypt(test_data)
        
        # Çöz
        decrypted = service.decrypt(encrypted)
        
        return {
            "success": True,
            "original": test_data,
            "encrypted": encrypted[:50] + "...",
            "decrypted": decrypted,
            "match": test_data == decrypted
        }
        
    except Exception as e:
        logger.error(f"Şifreleme testi hatası: {e}")
        return {"success": False, "error": str(e)}


@router.get("/order-status-list")
async def get_order_status_list(api_key: str):
    """
    Sipariş durum listesini getir (şifreleme gerektirmez)
    """
    try:
        service = MigrosYemekService(
            api_key=api_key,
            secret_key=MIGROS_TEST_SECRET,
            is_test=True
        )
        
        result = await service.get_order_status_list()
        return result
        
    except Exception as e:
        logger.error(f"Sipariş durum listesi hatası: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/cancel-reasons")
async def get_cancel_reasons(api_key: str):
    """
    İptal sebeplerini getir
    """
    try:
        service = MigrosYemekService(
            api_key=api_key,
            secret_key=MIGROS_TEST_SECRET,
            is_test=True
        )
        
        result = await service.get_cancel_reasons()
        return result
        
    except Exception as e:
        logger.error(f"İptal sebepleri hatası: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/pending-orders")
async def get_pending_orders(config: MigrosConfigRequest):
    """
    Bekleyen siparişleri getir
    """
    try:
        service = MigrosYemekService(
            api_key=config.api_key,
            secret_key=config.secret_key,
            is_test=config.is_test
        )
        
        result = await service.get_pending_orders(
            store_ids=[config.store_id],
            limit=20,
            offset=0
        )
        return result
        
    except Exception as e:
        logger.error(f"Bekleyen siparişler hatası: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/active-orders")
async def get_active_orders(config: MigrosConfigRequest):
    """
    Aktif siparişleri getir
    """
    try:
        service = MigrosYemekService(
            api_key=config.api_key,
            secret_key=config.secret_key,
            is_test=config.is_test
        )
        
        result = await service.get_active_orders(
            store_ids=[config.store_id],
            limit=20,
            offset=0
        )
        return result
        
    except Exception as e:
        logger.error(f"Aktif siparişler hatası: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/update-order-status")
async def update_order_status(
    config: MigrosConfigRequest,
    status_update: MigrosStatusUpdateRequest
):
    """
    Sipariş durumunu güncelle
    """
    try:
        service = MigrosYemekService(
            api_key=config.api_key,
            secret_key=config.secret_key,
            is_test=config.is_test
        )
        
        result = await service.update_order_status(
            order_id=status_update.order_id,
            store_id=status_update.store_id,
            status=status_update.status,
            cancel_reason_id=status_update.cancel_reason_id
        )
        return result
        
    except Exception as e:
        logger.error(f"Sipariş durumu güncelleme hatası: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/poll-orders/{restaurant_id}")
async def poll_orders(restaurant_id: str):
    """
    Migros Yemek siparişlerini poll et, sisteme ekle ve otomatik onayla
    """
    try:
        # Restoran ayarlarını al
        restaurant = await db.restaurants.find_one({"id": restaurant_id})
        if not restaurant:
            raise HTTPException(status_code=404, detail="Restoran bulunamadı")
        
        # Önce migros_credentials, sonra migros_config, sonra integration_stores'a bak
        migros_config = restaurant.get("migros_credentials", {})
        
        if not migros_config.get("api_key"):
            migros_config = restaurant.get("migros_config", {})
        
        if not migros_config.get("api_key"):
            # integration_stores'dan Migros config'i bul
            integration_stores = restaurant.get("integration_stores", [])
            for store in integration_stores:
                if store.get("platform") == "migros" and store.get("enabled"):
                    creds = store.get("credentials", {})
                    migros_config = {
                        "enabled": True,
                        "api_key": creds.get("api_key"),
                        "secret_key": creds.get("secret_key"),
                        "store_id": creds.get("store_id"),
                        "is_test": creds.get("is_test", False)
                    }
                    break
        
        if not migros_config.get("api_key"):
            return {"success": False, "error": "Migros entegrasyonu aktif değil"}
        
        service = MigrosYemekService(
            api_key=migros_config.get("api_key"),
            secret_key=migros_config.get("secret_key"),
            is_test=migros_config.get("is_test", True)
        )
        
        # Bekleyen siparişleri al
        store_id = migros_config.get("store_id")
        result = await service.get_pending_orders(store_ids=[store_id])
        
        if not result.get("success", True):
            return {"success": False, "error": result.get("error")}
        
        orders_data = result.get("data", [])
        new_orders = []
        approved_orders = []
        
        for migros_order in orders_data:
            external_id = f"migros_{migros_order.get('id')}"
            migros_order_id = migros_order.get('id')
            migros_store_id = migros_order.get('store', {}).get('id')
            
            # Daha önce eklenmiş mi kontrol et
            existing = await db.orders.find_one({"external_id": external_id})
            if existing:
                continue
            
            # ShiftJet formatına dönüştür
            order_data = transform_migros_order_to_shiftjet(migros_order, restaurant_id)
            
            # Veritabanına ekle (ve kontör düş)
            await insert_order(order_data)
            new_orders.append(order_data)
            
            logger.info(f"Migros sipariş eklendi: {external_id}")
            
            # Otomatik olarak Migros'a "Approved" durumu gönder
            try:
                approve_result = await service.update_order_status(
                    order_id=migros_order_id,
                    store_id=migros_store_id,
                    status="Approved"
                )
                if approve_result.get("success", True):
                    approved_orders.append(external_id)
                    logger.info(f"Migros sipariş otomatik onaylandı: {external_id}")
                    
                    # ShiftJet'te durumu da güncelle
                    await db.orders.update_one(
                        {"external_id": external_id},
                        {"$set": {"migros_status": "Approved"}}
                    )
                else:
                    logger.warning(f"Migros sipariş onaylama başarısız: {external_id} - {approve_result}")
            except Exception as approve_error:
                logger.error(f"Migros sipariş onaylama hatası: {external_id} - {approve_error}")
        
        return {
            "success": True,
            "total_pending": len(orders_data),
            "new_orders": len(new_orders),
            "approved_orders": len(approved_orders),
            "orders": [o.get("external_id") for o in new_orders]
        }
        
    except Exception as e:
        logger.error(f"Migros poll hatası: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/sync-order-status/{order_id}")
async def sync_order_status_to_migros(order_id: str):
    """
    ShiftJet sipariş durumunu Migros'a senkronize et
    
    ShiftJet Durum -> Migros Durum:
    - pending -> (otomatik Approved)
    - preparing -> Prepared
    - ready -> Prepared
    - on_the_way / delivering -> Delivery
    - delivered -> Completed
    - cancelled -> Rejected
    """
    try:
        # Siparişi bul
        order = await db.orders.find_one({"id": order_id})
        if not order:
            raise HTTPException(status_code=404, detail="Sipariş bulunamadı")
        
        # Migros siparişi mi kontrol et
        if order.get("source") != "migros" and order.get("platform") != "migros":
            return {"success": False, "error": "Bu sipariş Migros siparişi değil"}
        
        migros_data = order.get("migros_data", {})
        migros_order_id = migros_data.get("order_id")
        migros_store_id = migros_data.get("store_id")
        
        if not migros_order_id or not migros_store_id:
            return {"success": False, "error": "Migros sipariş bilgileri eksik"}
        
        # Restoran ayarlarını al
        restaurant_id = order.get("restaurant_id")
        restaurant = await db.restaurants.find_one({"id": restaurant_id})
        if not restaurant:
            raise HTTPException(status_code=404, detail="Restoran bulunamadı")
        
        migros_config = restaurant.get("migros_credentials", {})
        if not migros_config.get("enabled"):
            return {"success": False, "error": "Migros entegrasyonu aktif değil"}
        
        service = MigrosYemekService(
            api_key=migros_config.get("api_key"),
            secret_key=migros_config.get("secret_key"),
            is_test=migros_config.get("is_test", True)
        )
        
        # ShiftJet durumunu Migros durumuna çevir
        shiftjet_status = order.get("status", "")
        migros_status = None
        
        status_map = {
            "preparing": "Prepared",
            "ready": "Prepared", 
            "on_the_way": "Delivery",
            "delivering": "Delivery",
            "delivered": "Completed",
            "cancelled": "Rejected"
        }
        
        migros_status = status_map.get(shiftjet_status)
        
        if not migros_status:
            return {"success": False, "error": f"Bu durum için Migros güncellemesi gerekmiyor: {shiftjet_status}"}
        
        # Migros'a gönder
        result = await service.update_order_status(
            order_id=migros_order_id,
            store_id=migros_store_id,
            status=migros_status
        )
        
        if result.get("success", True):
            # Veritabanında migros_status güncelle
            await db.orders.update_one(
                {"id": order_id},
                {"$set": {"migros_status": migros_status}}
            )
            logger.info(f"Migros durum güncellendi: {order_id} -> {migros_status}")
            return {"success": True, "migros_status": migros_status}
        else:
            return {"success": False, "error": result.get("error", "Bilinmeyen hata")}
        
    except Exception as e:
        logger.error(f"Migros durum senkronizasyonu hatası: {e}")
        raise HTTPException(status_code=500, detail=str(e))
