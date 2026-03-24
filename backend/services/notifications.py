"""
Firebase Push Notification Service
AgrosJet Kurye Mobil App için bildirim gönderimi
Expo Push (iOS) ve Firebase FCM (Android) destekli
"""
import firebase_admin
from firebase_admin import credentials, messaging
import os
import logging
import httpx
from typing import Optional
from utils.database import db
from services.integration_log_service import save_integration_log

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"

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


async def _send_expo_push(token: str, title: str, body: str, data: dict = None) -> dict:
    """Expo Push API ile bildirim gönder"""
    try:
        payload = {
            "to": token,
            "title": title,
            "body": body,
            "sound": "default",
            "channelId": "orders_v6"
        }
        if data:
            payload["data"] = {k: str(v) for k, v in data.items()}

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(EXPO_PUSH_URL, json=payload, headers={"Content-Type": "application/json"})
            result = response.json()
            status = result.get("data", {}).get("status", "")
            if status == "ok":
                logger.info(f"Expo push gönderildi: {token[:30]}...")
                await save_integration_log("expo_push", "INFO", f"Push bildirim gönderildi: {title}", {"token": token[:30], "title": title})
                return {"success": True, "message_id": "expo_ok"}
            else:
                error = result.get("data", {}).get("message", str(result))
                logger.warning(f"Expo push hatası: {error}")
                await save_integration_log("expo_push", "WARNING", f"Push bildirim hatası: {error}", {"title": title})
                return {"success": False, "error": error}
    except Exception as e:
        logger.error(f"Expo push exception: {e}")
        await save_integration_log("expo_push", "ERROR", f"Push bildirim hatası: {str(e)}", {"title": title})
        return {"success": False, "error": str(e)}


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
    if not fcm_token:
        return {"success": False, "error": "FCM token boş"}
    
    # Expo token ise Expo Push API kullan
    if fcm_token.startswith("ExponentPushToken"):
        return await _send_expo_push(fcm_token, title, body, data)
    
    # FCM token ise Firebase kullan
    if not init_firebase():
        return {"success": False, "error": "Firebase başlatılamadı"}
    
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
        await save_integration_log("firebase", "INFO", f"Push bildirim gönderildi: {title}", {"message_id": response, "title": title, "body": body})
        return {"success": True, "message_id": response}
        
    except messaging.UnregisteredError:
        logger.warning(f"Geçersiz FCM token: {fcm_token[:20]}...")
        await save_integration_log("firebase", "WARNING", f"Geçersiz FCM token: {fcm_token[:20]}...", {"title": title})
        return {"success": False, "error": "Token geçersiz veya kullanıcı uygulamayı silmiş"}
    except Exception as e:
        logger.error(f"Bildirim hatası: {e}")
        await save_integration_log("firebase", "ERROR", f"Push bildirim hatası: {str(e)}", {"title": title, "body": body})
        return {"success": False, "error": str(e)}


async def send_push_to_multiple(
    fcm_tokens: list, 
    title: str, 
    body: str, 
    data: dict = None
) -> dict:
    """
    Birden fazla cihaza bildirim gönder
    Expo ve FCM token'ları ayrı ayrı işlenir
    """
    if not fcm_tokens:
        return {"success_count": 0, "failure_count": 0}

    # Token'ları ayır
    expo_tokens = [t for t in fcm_tokens if t.startswith("ExponentPushToken")]
    firebase_tokens = [t for t in fcm_tokens if not t.startswith("ExponentPushToken")]

    success_count = 0
    failure_count = 0

    # Expo token'ları tek tek gönder
    for token in expo_tokens:
        result = await _send_expo_push(token, title, body, data)
        if result.get("success"):
            success_count += 1
        else:
            failure_count += 1

    # Firebase token'ları toplu gönder
    if firebase_tokens:
        if not init_firebase():
            failure_count += len(firebase_tokens)
        else:
            try:
                message = messaging.MulticastMessage(
                    notification=messaging.Notification(title=title, body=body),
                    android=messaging.AndroidConfig(
                        priority="high",
                        notification=messaging.AndroidNotification(
                            icon="notification_icon", color="#e13c10",
                            sound="default", channel_id="orders",
                        ),
                    ),
                    data={k: str(v) for k, v in (data or {}).items()},
                    tokens=firebase_tokens,
                )
                response = messaging.send_multicast(message)
                success_count += response.success_count
                failure_count += response.failure_count
                logger.info(f"Toplu bildirim: {response.success_count} başarılı, {response.failure_count} başarısız")
                await save_integration_log("firebase", "INFO", f"Toplu bildirim: {response.success_count} başarılı", {"title": title, "token_count": len(firebase_tokens)})
            except Exception as e:
                logger.error(f"Toplu bildirim hatası: {e}")
                failure_count += len(firebase_tokens)

    return {"success_count": success_count, "failure_count": failure_count}


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
