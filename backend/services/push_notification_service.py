"""
Push Notification Service
Sends push notifications to couriers when orders are assigned
Supports both Web Push (VAPID) and Firebase Cloud Messaging (FCM)
"""
from pywebpush import webpush, WebPushException
from utils.database import db
import json
import os

# VAPID keys for web push
VAPID_PRIVATE_KEY = os.environ.get("VAPID_PRIVATE_KEY", "")
VAPID_PUBLIC_KEY = os.environ.get("VAPID_PUBLIC_KEY", "")
VAPID_CLAIMS = {"sub": "mailto:admin@shiftjet.com"}


async def save_push_subscription(courier_id: str, subscription: dict):
    """Save push subscription for a courier"""
    await db.push_subscriptions.update_one(
        {"courier_id": courier_id},
        {"$set": {
            "courier_id": courier_id,
            "subscription": subscription
        }},
        upsert=True
    )
    return True


async def get_push_subscription(courier_id: str):
    """Get push subscription for a courier"""
    doc = await db.push_subscriptions.find_one(
        {"courier_id": courier_id},
        {"_id": 0}
    )
    return doc.get("subscription") if doc else None


async def send_web_push_notification(courier_id: str, title: str, body: str, data: dict = None):
    """Send Web Push notification to a courier (browser)"""
    if not VAPID_PRIVATE_KEY or not VAPID_PUBLIC_KEY:
        return False
    
    subscription = await get_push_subscription(courier_id)
    if not subscription:
        return False
    
    try:
        payload = json.dumps({
            "title": title,
            "body": body,
            "tag": "new-order",
            **(data or {})
        })
        
        webpush(
            subscription_info=subscription,
            data=payload,
            vapid_private_key=VAPID_PRIVATE_KEY,
            vapid_claims=VAPID_CLAIMS
        )
        print(f"Web push notification sent to courier {courier_id}")
        return True
    except WebPushException as e:
        print(f"Web push notification failed: {e}")
        if e.response and e.response.status_code in [404, 410]:
            await db.push_subscriptions.delete_one({"courier_id": courier_id})
        return False
    except Exception as e:
        print(f"Web push notification error: {e}")
        return False


async def send_fcm_notification(courier_id: str, title: str, body: str, data: dict = None, sound: str = "default"):
    """Send Firebase Cloud Messaging notification to a courier (native app)"""
    try:
        from services.firebase_service import send_push_notification
        
        # Kuryenin FCM token'ını al
        courier = await db.couriers.find_one(
            {"id": courier_id},
            {"_id": 0, "fcm_token": 1}
        )
        
        if not courier or not courier.get("fcm_token"):
            print(f"No FCM token found for courier {courier_id}")
            return False
        
        return await send_push_notification(
            fcm_token=courier["fcm_token"],
            title=title,
            body=body,
            data=data,
            sound=sound
        )
    except Exception as e:
        print(f"FCM notification error: {e}")
        return False


async def send_push_notification(courier_id: str, title: str, body: str, data: dict = None, sound: str = "default"):
    """Send push notification to a courier (tries both FCM and Web Push)"""
    # Önce FCM dene (native app)
    fcm_sent = await send_fcm_notification(courier_id, title, body, data, sound)
    
    # Sonra Web Push dene (browser)
    web_sent = await send_web_push_notification(courier_id, title, body, data)
    
    return fcm_sent or web_sent


async def notify_courier_new_order(courier_id: str, order: dict):
    """Send notification to courier about new order assignment"""
    restaurant_name = order.get('restaurant_name', 'Restoran')
    order_number = order.get('order_number', '')
    address = order.get('customer_address', order.get('address', ''))[:50]
    
    return await send_push_notification(
        courier_id=courier_id,
        title="Yeni Sipariş!",
        body=f"{restaurant_name}",
        data={
            "type": "NEW_ORDER",
            "orderId": order.get("id"),
            "orderNumber": order_number,
            "restaurantName": restaurant_name,
            "address": address
        },
        sound="notification"
    )
