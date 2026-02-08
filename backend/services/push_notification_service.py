"""
Push Notification Service
Sends web push notifications to couriers when orders are assigned
"""
from pywebpush import webpush, WebPushException
from utils.database import db
import json
import os

# VAPID keys for web push
# In production, these should be environment variables
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


async def send_push_notification(courier_id: str, title: str, body: str, data: dict = None):
    """Send push notification to a courier"""
    if not VAPID_PRIVATE_KEY or not VAPID_PUBLIC_KEY:
        print("VAPID keys not configured, skipping push notification")
        return False
    
    subscription = await get_push_subscription(courier_id)
    if not subscription:
        print(f"No push subscription found for courier {courier_id}")
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
        print(f"Push notification sent to courier {courier_id}")
        return True
    except WebPushException as e:
        print(f"Push notification failed: {e}")
        # If subscription is invalid, remove it
        if e.response and e.response.status_code in [404, 410]:
            await db.push_subscriptions.delete_one({"courier_id": courier_id})
        return False
    except Exception as e:
        print(f"Push notification error: {e}")
        return False


async def notify_courier_new_order(courier_id: str, order: dict):
    """Send notification to courier about new order assignment"""
    return await send_push_notification(
        courier_id=courier_id,
        title="🔔 YENİ SİPARİŞ!",
        body=f"{order.get('restaurant_name', 'Restoran')}\n{order.get('order_number', '')}",
        data={
            "orderId": order.get("id"),
            "orderNumber": order.get("order_number"),
            "restaurantName": order.get("restaurant_name")
        }
    )
