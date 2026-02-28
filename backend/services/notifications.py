"""
Firebase Push Notification Service
AgrosJet Kurye Mobil App için bildirim gönderimi
"""
import firebase_admin
from firebase_admin import credentials, messaging
import os
import logging
from typing import Optional
from utils.database import db

logger = logging.getLogger(__name__)

# Firebase başlatıldı mı?
_firebase_initialized = False

def init_firebase():
    """Firebase Admin SDK'yı başlat"""
    global _firebase_initialized
    
    if _firebase_initialized:
        return True
    
    try:
        # Service account key dosyasını kontrol et
        key_path = os.environ.get("FIREBASE_ADMIN_KEY_PATH", "/app/backend/firebase-admin-key.json")
        
        if os.path.exists(key_path):
            cred = credentials.Certificate(key_path)
            firebase_admin.initialize_app(cred)
            _firebase_initialized = True
            logger.info("Firebase Admin SDK başlatıldı")
            return True
        else:
            logger.warning(f"Firebase key dosyası bulunamadı: {key_path}")
            return False
            
    except Exception as e:
        logger.error(f"Firebase başlatma hatası: {e}")
        return False


async def send_push_notification(
    fcm_token: str, 
    title: str, 
    body: str, 
    data: dict = None
) -> dict:
    """
    Tek bir cihaza push bildirim gönder
    
    Args:
        fcm_token: Kuryenin FCM token'ı
        title: Bildirim başlığı
        body: Bildirim içeriği
        data: Ekstra veri (opsiyonel)
    
    Returns:
        dict: {success: bool, message_id/error: str}
    """
    if not init_firebase():
        return {"success": False, "error": "Firebase başlatılamadı"}
    
    if not fcm_token:
        return {"success": False, "error": "FCM token boş"}
    
    try:
        message = messaging.Message(
            notification=messaging.Notification(
                title=title,
                body=body,
            ),
            android=messaging.AndroidConfig(
                priority="high",
                notification=messaging.AndroidNotification(
                    icon="notification_icon",
                    color="#e13c10",  # AgrosJet turuncu
                    sound="default",
                    channel_id="orders",
                ),
            ),
            apns=messaging.APNSConfig(
                payload=messaging.APNSPayload(
                    aps=messaging.Aps(
                        sound="default",
                        badge=1,
                    )
                )
            ),
            data={k: str(v) for k, v in (data or {}).items()},  # String'e çevir
            token=fcm_token,
        )
        
        response = messaging.send(message)
        logger.info(f"Bildirim gönderildi: {response}")
        return {"success": True, "message_id": response}
        
    except messaging.UnregisteredError:
        logger.warning(f"Geçersiz FCM token: {fcm_token[:20]}...")
        return {"success": False, "error": "Token geçersiz veya kullanıcı uygulamayı silmiş"}
    except Exception as e:
        logger.error(f"Bildirim hatası: {e}")
        return {"success": False, "error": str(e)}


async def send_push_to_multiple(
    fcm_tokens: list, 
    title: str, 
    body: str, 
    data: dict = None
) -> dict:
    """
    Birden fazla cihaza bildirim gönder
    
    Args:
        fcm_tokens: FCM token listesi
        title: Bildirim başlığı
        body: Bildirim içeriği
        data: Ekstra veri
    
    Returns:
        dict: {success_count, failure_count}
    """
    if not init_firebase():
        return {"success_count": 0, "failure_count": len(fcm_tokens), "error": "Firebase başlatılamadı"}
    
    if not fcm_tokens:
        return {"success_count": 0, "failure_count": 0}
    
    try:
        message = messaging.MulticastMessage(
            notification=messaging.Notification(
                title=title,
                body=body,
            ),
            android=messaging.AndroidConfig(
                priority="high",
                notification=messaging.AndroidNotification(
                    icon="notification_icon",
                    color="#e13c10",
                    sound="default",
                    channel_id="orders",
                ),
            ),
            data={k: str(v) for k, v in (data or {}).items()},
            tokens=fcm_tokens,
        )
        
        response = messaging.send_multicast(message)
        logger.info(f"Toplu bildirim: {response.success_count} başarılı, {response.failure_count} başarısız")
        
        return {
            "success_count": response.success_count,
            "failure_count": response.failure_count,
        }
        
    except Exception as e:
        logger.error(f"Toplu bildirim hatası: {e}")
        return {"success_count": 0, "failure_count": len(fcm_tokens), "error": str(e)}


async def send_order_notification(courier_id: str, order_data: dict) -> dict:
    """
    Kuryeye yeni sipariş bildirimi gönder
    
    Args:
        courier_id: Kurye ID
        order_data: Sipariş bilgileri
    """
    # Kuryenin FCM token'ını al
    courier = await db.couriers.find_one(
        {"id": courier_id},
        {"_id": 0, "fcm_token": 1, "name": 1}
    )
    
    if not courier or not courier.get("fcm_token"):
        logger.warning(f"Kurye {courier_id} için FCM token bulunamadı")
        return {"success": False, "error": "FCM token bulunamadı"}
    
    # Bildirim gönder
    return await send_push_notification(
        fcm_token=courier["fcm_token"],
        title="🚚 Yeni Sipariş!",
        body=f"{order_data.get('restaurant_name', 'Restoran')}",
        data={
            "type": "NEW_ORDER",
            "order_id": order_data.get("id", ""),
            "platform": order_data.get("platform", ""),
            "action": "open_order_details"
        }
    )


async def send_delivery_assigned_notification(courier_id: str, delivery_data: dict) -> dict:
    """
    Kuryeye teslimat atandı bildirimi gönder
    """
    courier = await db.couriers.find_one(
        {"id": courier_id},
        {"_id": 0, "fcm_token": 1}
    )
    
    if not courier or not courier.get("fcm_token"):
        return {"success": False, "error": "FCM token bulunamadı"}
    
    return await send_push_notification(
        fcm_token=courier["fcm_token"],
        title="📦 Teslimat Atandı!",
        body=f"Sipariş #{delivery_data.get('order_number', '')} size atandı",
        data={
            "type": "DELIVERY_ASSIGNED",
            "delivery_id": delivery_data.get("id", ""),
            "action": "open_delivery_details"
        }
    )
