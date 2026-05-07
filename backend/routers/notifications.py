from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone, timedelta
import uuid

from utils.database import db
from utils.helpers import get_turkey_now, ensure_turkey_timezone, TURKEY_TZ
from utils.jwt_utils import require_admin

router = APIRouter(prefix="/api/notifications", tags=["Notifications"], dependencies=[Depends(require_admin)])


# ============ PYDANTIC MODELS ============

class NotificationCreate(BaseModel):
    company_id: str
    type: str  # muhasebe_hareket, zimmet_hareket, jetpuan_siparis, evrak_yuklendi, fesih_3_gun, fesih_yarin
    title: str
    message: str
    entity_type: Optional[str] = None  # courier, business, vendor, order, document
    entity_id: Optional[str] = None


# ============ ENDPOINTS ============

@router.get("/company/{company_id}")
async def get_notifications(company_id: str, limit: int = 50, include_read: bool = False, target: str = None):
    """
    Get notifications for a company
    target: "admin" = sadece admin bildirimleri (admin paneli için)
            "courier" = sadece kurye bildirimleri
            None = tüm bildirimler (varsayılan, ama admin panelinde kurye bildirimlerini hariç tutar)
    """
    query = {"company_id": company_id}
    if not include_read:
        query["is_read"] = False
    
    # Admin panelinde kurye'ye özel bildirimleri gösterme
    # target="courier" olan bildirimler sadece kuryenin mobil uygulamasında görünmeli
    if target == "admin":
        query["target"] = {"$ne": "courier"}  # courier olmayanlar
    elif target == "courier":
        query["target"] = "courier"
    else:
        # Varsayılan: target="courier" olanları hariç tut (admin paneli için)
        query["$or"] = [
            {"target": {"$exists": False}},  # eski bildirimler
            {"target": {"$ne": "courier"}}   # admin veya belirtilmemiş
        ]
    
    notifications = await db.notifications.find(
        query,
        {"_id": 0}
    ).sort("created_at", -1).to_list(limit)
    
    return notifications


@router.get("/company/{company_id}/unread-count")
async def get_unread_count(company_id: str, target: str = None, type: str = None):
    """
    Get count of unread notifications
    Admin panelinde kurye bildirimlerini ve break_request'leri sayma
    (break_request ayrı sekmede gösteriliyor)
    type: belirli bir bildirim tipi için sayı (ör: "basvuru")
    """
    # Belirli tip için filtre
    if type:
        query = {"company_id": company_id, "is_read": False, "type": type}
        count = await db.notifications.count_documents(query)
        return {"count": count}

    query = {
        "company_id": company_id,
        "is_read": False,
        "type": {"$ne": "break_request"}  # break_request ayrı sekmede
    }
    
    # Admin panelinde kurye bildirimlerini sayma
    if target == "admin":
        query["target"] = {"$ne": "courier"}
    elif target == "courier":
        query["target"] = "courier"
    else:
        # Varsayılan: kurye bildirimlerini hariç tut
        query["$and"] = [
            {"type": {"$ne": "break_request"}},
            {"$or": [
                {"target": {"$exists": False}},
                {"target": {"$ne": "courier"}}
            ]}
        ]
        del query["type"]  # $and içinde zaten var
    
    count = await db.notifications.count_documents(query)
    return {"count": count}


@router.put("/{notification_id}/read")
async def mark_as_read(notification_id: str):
    """Mark a notification as read"""
    result = await db.notifications.update_one(
        {"id": notification_id},
        {"$set": {"is_read": True, "read_at": get_turkey_now()}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Bildirim bulunamadı")
    return {"message": "Okundu olarak işaretlendi"}


@router.post("/company/{company_id}/mark-read-by-type")
async def mark_read_by_type(company_id: str, type: str = None):
    """Belirli tipteki tüm bildirimleri okundu işaretle"""
    query = {"company_id": company_id, "is_read": False}
    if type:
        query["type"] = type
    result = await db.notifications.update_many(
        query,
        {"$set": {"is_read": True, "read_at": get_turkey_now()}}
    )
    return {"marked": result.modified_count}



@router.put("/company/{company_id}/read-all")
async def mark_all_as_read(company_id: str):
    """Mark all notifications as read for a company"""
    result = await db.notifications.update_many(
        {"company_id": company_id, "is_read": False},
        {"$set": {"is_read": True, "read_at": get_turkey_now()}}
    )
    return {"message": f"{result.modified_count} bildirim okundu olarak işaretlendi"}


@router.delete("/{notification_id}")
async def delete_notification(notification_id: str):
    """Delete a notification and track it to prevent recreation"""
    # First get the notification to track its entity_id and type
    notification = await db.notifications.find_one({"id": notification_id}, {"_id": 0})
    
    if not notification:
        raise HTTPException(status_code=404, detail="Bildirim bulunamadı")
    
    # Track dismissed notification to prevent recreation (especially for fatura_eksik)
    if notification.get("type") == "fatura_eksik" and notification.get("entity_id"):
        await db.dismissed_notifications.update_one(
            {
                "company_id": notification["company_id"],
                "entity_id": notification["entity_id"],
                "type": notification["type"]
            },
            {
                "$set": {
                    "dismissed_at": get_turkey_now()
                }
            },
            upsert=True
        )
    
    # Delete the notification
    await db.notifications.delete_one({"id": notification_id})
    return {"message": "Bildirim silindi"}


@router.delete("/company/{company_id}/all")
async def delete_all_notifications(company_id: str):
    """Delete all notifications for a company and track fatura_eksik ones"""
    # First get fatura_eksik notifications to track them
    fatura_notifications = await db.notifications.find(
        {"company_id": company_id, "type": "fatura_eksik", "entity_id": {"$exists": True}},
        {"_id": 0, "entity_id": 1, "type": 1}
    ).to_list(1000)
    
    # Track them in dismissed_notifications
    for notif in fatura_notifications:
        await db.dismissed_notifications.update_one(
            {
                "company_id": company_id,
                "entity_id": notif["entity_id"],
                "type": notif["type"]
            },
            {"$set": {"dismissed_at": get_turkey_now()}},
            upsert=True
        )
    
    result = await db.notifications.delete_many({"company_id": company_id})
    return {"message": f"{result.deleted_count} bildirim silindi"}


@router.get("/company/{company_id}/check-fesih")
async def check_fesih_notifications(company_id: str):
    """Check and create fesih notifications for couriers"""
    # Get company's couriers with active termination
    company_courier_ids = await db.company_couriers.find(
        {"company_id": company_id},
        {"_id": 0, "courier_id": 1}
    ).to_list(1000)
    
    courier_ids = [cc["courier_id"] for cc in company_courier_ids]
    
    now = datetime.now(TURKEY_TZ)
    notifications_created = 0
    
    for courier_id in courier_ids:
        courier = await db.couriers.find_one(
            {"id": courier_id, "termination_end_at": {"$ne": None}},
            {"_id": 0}
        )
        
        if not courier or not courier.get("termination_end_at"):
            continue
        
        end_date = datetime.fromisoformat(courier["termination_end_at"].replace("Z", "+00:00"))
        days_remaining = (end_date - now).days
        
        # Check if notification already exists for today
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        
        if days_remaining == 3:
            # Check if 3-day notification exists
            existing = await db.notifications.find_one({
                "company_id": company_id,
                "entity_id": courier_id,
                "type": "fesih_3_gun",
                "created_at": {"$gte": today_start.isoformat()}
            })
            
            if not existing:
                await create_notification(
                    company_id=company_id,
                    notification_type="fesih_3_gun",
                    title="Fesih Süresi - 3 Gün Kaldı",
                    message=f"{courier['name']} için fesih süresinin dolmasına 3 gün kaldı.",
                    entity_type="courier",
                    entity_id=courier_id
                )
                notifications_created += 1
        
        elif days_remaining == 1:
            # Check if 1-day notification exists
            existing = await db.notifications.find_one({
                "company_id": company_id,
                "entity_id": courier_id,
                "type": "fesih_yarin",
                "created_at": {"$gte": today_start.isoformat()}
            })
            
            if not existing:
                await create_notification(
                    company_id=company_id,
                    notification_type="fesih_yarin",
                    title="Fesih Süresi - Yarın Doluyor!",
                    message=f"{courier['name']} için fesih süresi yarın doluyor!",
                    entity_type="courier",
                    entity_id=courier_id
                )
                notifications_created += 1
    
    return {"notifications_created": notifications_created}


@router.get("/company/{company_id}/check-missing-invoices")
async def check_missing_invoice_notifications(company_id: str):
    """Check and create notifications for hakediş transactions older than 1 day without invoice"""
    now = datetime.now(TURKEY_TZ)
    one_day_ago = now - timedelta(days=1)
    
    # Find hakediş transactions older than 1 day without invoice
    transactions = await db.transactions.find(
        {
            "company_id": company_id,
            "is_hakedis": True,
            "entity_type": "courier",
            "created_at": {"$lte": one_day_ago.isoformat()},
            "$or": [
                {"invoice_id": {"$exists": False}},
                {"invoice_id": None},
                {"invoice_id": ""}
            ]
        },
        {"_id": 0}
    ).to_list(500)
    
    notifications_created = 0
    
    for tx in transactions:
        # Check if notification already exists for this transaction (not just today - ever)
        # Also check dismissed_notifications collection
        existing = await db.notifications.find_one({
            "company_id": company_id,
            "entity_id": tx["id"],
            "type": "fatura_eksik"
        })
        
        if existing:
            continue
        
        # Check if this notification was dismissed
        dismissed = await db.dismissed_notifications.find_one({
            "company_id": company_id,
            "entity_id": tx["id"],
            "type": "fatura_eksik"
        })
        
        if dismissed:
            continue
        
        # Get courier name
        courier_name = tx.get("courier_name")
        if not courier_name:
            courier = await db.couriers.find_one({"id": tx["entity_id"]}, {"_id": 0, "name": 1})
            courier_name = courier["name"] if courier else "Bilinmeyen Kurye"
        
        # Create notification with title
        tx_date = datetime.fromisoformat(tx["created_at"].replace("Z", "+00:00"))
        date_str = tx_date.strftime("%d.%m.%Y")
        amount = tx.get("amount", 0)
        
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()),
            "company_id": company_id,
            "type": "fatura_eksik",
            "title": "Eksik Fatura",
            "message": f"{courier_name} - {date_str} tarihli {amount:.2f} TL hakediş faturası yüklenmedi",
            "entity_type": "transaction",
            "entity_id": tx["id"],
            "is_read": False,
            "created_at": get_turkey_now(),
            "link": "/admin/muhasebe"
        })
        notifications_created += 1
    
    return {"notifications_created": notifications_created, "missing_count": len(transactions)}


# ============ HELPER FUNCTION ============

from concurrent.futures import ThreadPoolExecutor

# Thread pool for email sending (completely non-blocking)
_email_executor = ThreadPoolExecutor(max_workers=2)


def _send_email_thread(smtp_host, smtp_port, smtp_user, smtp_password, from_email, from_name, to_email, subject, html_body):
    """Send email in thread (pure sync, no async)"""
    import smtplib
    import ssl
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart
    
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{from_name} <{from_email}>"
        msg["To"] = to_email
        
        part = MIMEText(html_body, "html", "utf-8")
        msg.attach(part)
        
        context = ssl.create_default_context()
        
        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.starttls(context=context)
            server.login(smtp_user, smtp_password)
            server.sendmail(from_email, to_email, msg.as_string())
        
        print(f"Email sent to {to_email}")
    except Exception as e:
        print(f"Email thread error: {e}")


async def create_notification(
    company_id: str,
    notification_type: str,
    title: str,
    message: str,
    entity_type: str = None,
    entity_id: str = None,
    send_email: bool = True,
    actor_id: str = None,  # İşlemi yapan kişinin ID'si
    actor_role: str = None  # İşlemi yapan kişinin rolü (admin, superadmin, courier)
):
    """Create a new notification (called from other routers)
    
    actor_id ve actor_role parametreleri ile bildirim mantığı:
    - Superadmin kendi işlemlerinde bildirim almaz
    - Admin işlem yaptığında sadece superadmin bildirim alır
    - Kurye işlem yaptığında hem admin hem superadmin bildirim alır
    """
    # Superadmin kendi işlemlerinde bildirim oluşturma
    if actor_role == "superadmin":
        return None
    
    notification = {
        "id": str(uuid.uuid4()),
        "company_id": company_id,
        "type": notification_type,
        "title": title,
        "message": message,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "is_read": False,
        "created_at": get_turkey_now(),
        "actor_id": actor_id,
        "actor_role": actor_role
    }
    await db.notifications.insert_one(notification)
    
    # Send email in separate thread if enabled
    if send_email:
        try:
            # Quick check: get email settings
            settings = await db.email_settings.find_one({"company_id": company_id}, {"_id": 0})
            if not settings or not settings.get("enabled"):
                return notification
            
            # Check notification type setting
            type_to_setting = {
                "muhasebe_hareket": "notify_muhasebe",
                "zimmet_hareket": "notify_zimmet",
                "evrak_yuklendi": "notify_evrak",
                "jetpuan_siparis": "notify_jetpuan",
                "fesih_3_gun": "notify_fesih",
                "fesih_yarin": "notify_fesih",
                "payout_request": "notify_payout_request",
            }
            setting_key = type_to_setting.get(notification_type)
            if setting_key and not settings.get(setting_key, True):
                return notification
            
            # Get super admin email
            superadmin = await db.admins.find_one(
                {"company_id": company_id, "role": "superadmin"},
                {"_id": 0, "email": 1}
            )
            to_email = superadmin.get("email") if superadmin else None
            if not to_email:
                return notification
            
            # Prepare email content
            subject = f"[ShiftJet] {title}"
            html_body = f"""
            <div style="font-family: sans-serif; padding: 20px; max-width: 600px;">
                <h2 style="color: #0f172a; margin-bottom: 16px;">{title}</h2>
                <p style="color: #475569; line-height: 1.6;">{message}</p>
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
                <p style="color: #94a3b8; font-size: 12px;">ShiftJet Kurye Yönetim Sistemi</p>
            </div>
            """
            
            # Submit to thread pool (non-blocking)
            _email_executor.submit(
                _send_email_thread,
                settings.get("smtp_host"),
                settings.get("smtp_port", 587),
                settings.get("smtp_user"),
                settings.get("smtp_password"),
                settings.get("from_email") or settings.get("smtp_user"),
                settings.get("from_name", "ShiftJet"),
                to_email,
                subject,
                html_body
            )
        except Exception as e:
            print(f"Email setup error: {e}")
    
    return notification
