import firebase_admin
from firebase_admin import credentials, messaging
import os

# Firebase Admin SDK'yı başlat (singleton pattern)
_firebase_app = None

def get_firebase_app():
    global _firebase_app
    if _firebase_app is None:
        cred_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'firebase-admin.json')
        if os.path.exists(cred_path):
            cred = credentials.Certificate(cred_path)
            _firebase_app = firebase_admin.initialize_app(cred)
            print("Firebase Admin SDK initialized successfully")
        else:
            print(f"Firebase credentials not found at {cred_path}")
    return _firebase_app


async def send_push_notification(fcm_token: str, title: str, body: str, data: dict = None, sound: str = "default") -> bool:
    """
    Tek bir cihaza push notification gönder
    
    Args:
        fcm_token: Kurye cihazının FCM token'ı
        title: Bildirim başlığı
        body: Bildirim içeriği
        data: Ek veri (opsiyonel)
        sound: Zil sesi - "notification", "urgent" veya "default"
    
    Returns:
        bool: Başarılı ise True
    """
    try:
        app = get_firebase_app()
        if app is None:
            print("Firebase not initialized")
            return False
        
        message = messaging.Message(
            notification=messaging.Notification(
                title=title,
                body=body,
            ),
            data=data or {},
            token=fcm_token,
            android=messaging.AndroidConfig(
                priority='high',
                notification=messaging.AndroidNotification(
                    sound=sound,
                    click_action='OPEN_ORDER',
                    channel_id='orders_v4'
                )
            ),
            apns=messaging.APNSConfig(
                payload=messaging.APNSPayload(
                    aps=messaging.Aps(
                        sound=f'{sound}.mp3' if sound != 'default' else 'default',
                        badge=1
                    )
                )
            )
        )
        
        response = messaging.send(message)
        print(f"Push notification sent: {response}")
        return True
        
    except messaging.UnregisteredError:
        print(f"FCM token is invalid or unregistered: {fcm_token[:20]}...")
        return False
    except Exception as e:
        print(f"Push notification error: {e}")
        return False


async def send_new_order_notification(fcm_token: str, order_id: str, restaurant_name: str, address: str) -> bool:
    """
    Kuryeye yeni sipariş atandığında bildirim gönder
    """
    return await send_push_notification(
        fcm_token=fcm_token,
        title="Yeni Sipariş!",
        body=f"{restaurant_name}",
        data={
            "type": "NEW_ORDER",
            "order_id": order_id,
            "restaurant_name": restaurant_name,
            "address": address
        },
        sound="notification"
    )


async def send_order_cancelled_notification(fcm_token: str, order_id: str, restaurant_name: str) -> bool:
    """
    Sipariş iptal edildiğinde kuryeye bildirim gönder
    """
    return await send_push_notification(
        fcm_token=fcm_token,
        title="Sipariş İptal Edildi",
        body=f"{restaurant_name} siparişi iptal edildi",
        data={
            "type": "ORDER_CANCELLED",
            "order_id": order_id
        }
    )


# Firebase'i uygulama başlatıldığında initialize et
get_firebase_app()
