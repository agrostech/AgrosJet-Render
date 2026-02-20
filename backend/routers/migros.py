"""
Migros Yemek Entegrasyon Router'ı
- Bağlantı testi
- Sipariş polling
- Durum güncelleme
"""

import logging
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from database import get_database
from services.migros_service import MigrosYemekService, transform_migros_order_to_shiftjet

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/migros", tags=["Migros Yemek"])

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
async def poll_orders(restaurant_id: str, db=Depends(get_database)):
    """
    Migros Yemek siparişlerini poll et ve sisteme ekle
    """
    try:
        # Restoran ayarlarını al
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
        
        # Bekleyen siparişleri al
        store_id = migros_config.get("store_id")
        result = await service.get_pending_orders(store_ids=[store_id])
        
        if not result.get("success", True):
            return {"success": False, "error": result.get("error")}
        
        orders_data = result.get("data", [])
        new_orders = []
        
        for migros_order in orders_data:
            external_id = f"migros_{migros_order.get('id')}"
            
            # Daha önce eklenmiş mi kontrol et
            existing = await db.orders.find_one({"external_id": external_id})
            if existing:
                continue
            
            # ShiftJet formatına dönüştür
            order_data = transform_migros_order_to_shiftjet(migros_order, restaurant_id)
            
            # Veritabanına ekle
            await db.orders.insert_one(order_data)
            new_orders.append(order_data)
            
            logger.info(f"Migros sipariş eklendi: {external_id}")
        
        return {
            "success": True,
            "total_pending": len(orders_data),
            "new_orders": len(new_orders),
            "orders": [o.get("external_id") for o in new_orders]
        }
        
    except Exception as e:
        logger.error(f"Migros poll hatası: {e}")
        raise HTTPException(status_code=500, detail=str(e))
