"""
Mola Sistemi Scheduler Jobs
- Sırası gelen kuryeyi molaya alma
- Mola biten kuryeyi aktif yapma
- Bildirimler gönderme
- Paket teslimi sonrası mola başlatma
"""

import logging
from datetime import datetime, timedelta, timezone
from utils.database import db

logger = logging.getLogger("break_scheduler")
TURKEY_TZ = timezone(timedelta(hours=3))


async def process_break_queue():
    """
    Mola sırasını işle:
    1. Sırası gelen kuryeleri molaya al
    2. Limit kontrolü yap
    3. 10dk kala bildirim gönder
    """
    now = datetime.now(TURKEY_TZ)
    logger.debug(f"Mola sırası işleniyor: {now.isoformat()}")
    
    try:
        # Tüm şirketler için işle
        companies = await db.companies.find(
            {"break_settings.break_mode": "automatic"},
            {"_id": 0, "id": 1, "break_settings": 1}
        ).to_list(100)
        
        for company in companies:
            company_id = company.get("id")
            break_settings = company.get("break_settings", {})
            
            await process_company_break_queue(company_id, break_settings)
            
    except Exception as e:
        logger.error(f"Mola sırası işleme hatası: {e}")


async def process_company_break_queue(company_id: str, break_settings: dict):
    """Tek bir şirketin mola sırasını işle"""
    now = datetime.now(TURKEY_TZ)
    
    try:
        # Mevcut vardiyayı ve limitini bul
        current_time = now.strftime("%H:%M")
        shifts = await db.shifts.find({"company_id": company_id}, {"_id": 0}).to_list(100)
        
        active_shift = None
        for shift in shifts:
            start_time = shift.get("start_time", "00:00")
            end_time = shift.get("end_time", "23:59")
            
            if start_time > end_time:
                if current_time >= start_time or current_time < end_time:
                    active_shift = shift
                    break
            else:
                if start_time <= current_time < end_time:
                    active_shift = shift
                    break
        
        if not active_shift:
            return  # Aktif vardiya yok
        
        break_limit = active_shift.get("break_limit", 2)
        
        # Şu an moladaki kurye sayısı (company_ids veya company_id kontrolü)
        on_break_count = await db.couriers.count_documents({
            "$or": [
                {"company_ids": company_id},
                {"company_id": company_id}
            ],
            "availability_status": "on_break"
        })
        
        # Sıradaki "waiting" kuryeler
        queue = await db.break_queue.find(
            {"company_id": company_id, "status": "waiting"},
            {"_id": 0}
        ).sort("queue_position", 1).to_list(50)
        
        # Limit müsaitse sıradaki kuryeyi molaya al
        for queue_entry in queue:
            if on_break_count >= break_limit:
                break  # Limit doldu
            
            courier_id = queue_entry.get("courier_id")
            duration = queue_entry.get("duration", 30)
            
            # Kuryenin yolda paketi var mı kontrol et
            on_way_orders = await db.orders.count_documents({
                "courier_id": courier_id,
                "status": "on_the_way"
            })
            
            if on_way_orders > 0:
                # Yolda paket var - "ready" durumuna al, mola başlasın ama süre teslimde başlayacak
                await db.break_queue.update_one(
                    {"id": queue_entry["id"]},
                    {"$set": {
                        "status": "ready",
                        "updated_at": now.isoformat()
                    }}
                )
                
                await db.couriers.update_one(
                    {"id": courier_id},
                    {"$set": {
                        "availability_status": "on_break",
                        "break_pending_delivery": True,
                        "requested_break_duration": duration,
                        "break_approved_at": now.isoformat()
                    }}
                )
                
                # Bildirim gönder
                await send_break_notification_internal(
                    company_id, courier_id,
                    "break_ready",
                    "Mola sıranız geldi! Paketinizi teslim ettiğinizde mola süreniz başlayacak."
                )
                
                on_break_count += 1
                
            else:
                # Yolda paket yok - direkt molaya al
                await db.break_queue.update_one(
                    {"id": queue_entry["id"]},
                    {"$set": {
                        "status": "active",
                        "started_at": now.isoformat(),
                        "updated_at": now.isoformat()
                    }}
                )
                
                await db.couriers.update_one(
                    {"id": courier_id},
                    {"$set": {
                        "availability_status": "on_break",
                        "break_start_time": now.isoformat(),
                        "requested_break_duration": duration,
                        "break_pending_delivery": False
                    }}
                )
                
                # Bildirim gönder
                await send_break_notification_internal(
                    company_id, courier_id,
                    "break_started",
                    f"Mola süreniz başladı! ({duration} dakika)"
                )
                
                on_break_count += 1
        
        # Sıradaki kuryeler için tahmini süre güncelle ve bildirim gönder
        await update_queue_estimates(company_id, break_settings)
        
    except Exception as e:
        logger.error(f"Şirket mola sırası hatası ({company_id}): {e}")


async def update_queue_estimates(company_id: str, break_settings: dict):
    """Sıradaki kuryeler için tahmini bekleme süresini güncelle"""
    now = datetime.now(TURKEY_TZ)
    assignment_restriction = break_settings.get("break_assignment_restriction", 10)
    
    try:
        # Moladaki kuryeler ve kalan süreleri (company_ids veya company_id kontrolü)
        on_break = await db.couriers.find(
            {
                "$or": [
                    {"company_ids": company_id},
                    {"company_id": company_id}
                ],
                "availability_status": "on_break"
            },
            {"_id": 0, "id": 1, "break_start_time": 1, "requested_break_duration": 1}
        ).to_list(50)
        
        total_remaining = 0
        for c in on_break:
            break_start = c.get("break_start_time")
            duration = c.get("requested_break_duration", 30)
            if break_start:
                try:
                    start = datetime.fromisoformat(break_start.replace('Z', '+00:00'))
                    if start.tzinfo is None:
                        start = start.replace(tzinfo=TURKEY_TZ)
                    elapsed = (now - start).total_seconds() / 60
                    remaining = max(0, duration - elapsed)
                    total_remaining += remaining
                except:
                    total_remaining += duration
            else:
                total_remaining += duration
        
        # Sıradaki kuryeler
        queue = await db.break_queue.find(
            {"company_id": company_id, "status": "waiting"},
            {"_id": 0}
        ).sort("queue_position", 1).to_list(50)
        
        cumulative_wait = total_remaining
        for i, entry in enumerate(queue):
            estimated_start = now + timedelta(minutes=cumulative_wait)
            
            # Güncelle
            await db.break_queue.update_one(
                {"id": entry["id"]},
                {"$set": {
                    "queue_position": i + 1,
                    "estimated_wait_minutes": int(cumulative_wait),
                    "estimated_start_time": estimated_start.isoformat(),
                    "updated_at": now.isoformat()
                }}
            )
            
            # Eğer tahmini süre < assignment_restriction ise bildirim gönder
            if cumulative_wait <= assignment_restriction and not entry.get("approaching_notified"):
                await send_break_notification_internal(
                    company_id, entry["courier_id"],
                    "break_approaching",
                    f"Mola sıranız yaklaşıyor! Tahmini {int(cumulative_wait)} dakika kaldı."
                )
                await db.break_queue.update_one(
                    {"id": entry["id"]},
                    {"$set": {"approaching_notified": True}}
                )
            
            cumulative_wait += entry.get("duration", 30)
            
    except Exception as e:
        logger.error(f"Sıra güncelleme hatası: {e}")


async def check_break_completions():
    """
    Mola süresi dolan kuryeleri kontrol et ve aktif yap
    """
    now = datetime.now(TURKEY_TZ)
    logger.debug(f"Mola bitiş kontrolü: {now.isoformat()}")
    
    try:
        # Moladaki tüm kuryeler
        on_break_couriers = await db.couriers.find(
            {
                "availability_status": "on_break",
                "break_pending_delivery": {"$ne": True}  # Paket beklemeyenler
            },
            {"_id": 0, "id": 1, "company_ids": 1, "break_start_time": 1, "requested_break_duration": 1, "name": 1}
        ).to_list(200)
        
        for courier in on_break_couriers:
            break_start = courier.get("break_start_time")
            duration = courier.get("requested_break_duration", 30)
            
            if not break_start:
                continue
            
            try:
                start = datetime.fromisoformat(break_start.replace('Z', '+00:00'))
                if start.tzinfo is None:
                    start = start.replace(tzinfo=TURKEY_TZ)
                
                elapsed = (now - start).total_seconds() / 60
                
                if elapsed >= duration:
                    # Mola süresi doldu - kuryeyi aktif yap
                    courier_id = courier.get("id")
                    company_ids = courier.get("company_ids") or []
                    if not company_ids and courier.get("company_id"):
                        company_ids = [courier.get("company_id")]
                    company_id = company_ids[0] if company_ids else None
                    
                    # Kullanılan mola süresini güncelle
                    await db.couriers.update_one(
                        {"id": courier_id},
                        {
                            "$set": {
                                "availability_status": "active",
                                "break_start_time": None,
                                "requested_break_duration": None,
                                "break_pending_delivery": False
                            },
                            "$inc": {
                                "used_break_time": duration
                            }
                        }
                    )
                    
                    # Break queue'dan kaldır
                    await db.break_queue.update_one(
                        {"courier_id": courier_id, "status": "active"},
                        {"$set": {"status": "completed", "completed_at": now.isoformat()}}
                    )
                    
                    logger.info(f"Mola bitti, kurye aktif: {courier.get('name')} ({courier_id})")
                    
                    # Bildirim gönder
                    if company_id:
                        await send_break_notification_internal(
                            company_id, courier_id,
                            "break_ended",
                            "Mola süreniz doldu. Aktif duruma geçtiniz."
                        )
                        
                elif duration - elapsed <= 5 and duration - elapsed > 4:
                    # 5 dakika kaldı bildirimi (sadece bir kez)
                    company_ids = courier.get("company_ids") or []
                    if not company_ids and courier.get("company_id"):
                        company_ids = [courier.get("company_id")]
                    company_id = company_ids[0] if company_ids else None
                    if company_id:
                        await send_break_notification_internal(
                            company_id, courier.get("id"),
                            "break_ending_soon",
                            "Mola sürenizin bitmesine 5 dakika kaldı!"
                        )
                        
            except Exception as e:
                logger.error(f"Kurye mola kontrol hatası ({courier.get('id')}): {e}")
                
    except Exception as e:
        logger.error(f"Mola bitiş kontrolü hatası: {e}")


async def check_delivery_completion_for_break():
    """
    Paket bekleyen moladaki kuryeleri kontrol et.
    Paket teslim edildiyse mola süresini başlat.
    """
    now = datetime.now(TURKEY_TZ)
    
    try:
        # Paket bekleyen moladaki kuryeler
        pending_break_couriers = await db.couriers.find(
            {
                "availability_status": "on_break",
                "break_pending_delivery": True
            },
            {"_id": 0, "id": 1, "company_ids": 1, "requested_break_duration": 1, "name": 1}
        ).to_list(100)
        
        for courier in pending_break_couriers:
            courier_id = courier.get("id")
            
            # Yolda paketi var mı kontrol et
            on_way_orders = await db.orders.count_documents({
                "courier_id": courier_id,
                "status": "on_the_way"
            })
            
            if on_way_orders == 0:
                # Paket teslim edilmiş - mola süresini başlat
                duration = courier.get("requested_break_duration", 30)
                company_ids = courier.get("company_ids") or []
                if not company_ids and courier.get("company_id"):
                    company_ids = [courier.get("company_id")]
                company_id = company_ids[0] if company_ids else None
                
                await db.couriers.update_one(
                    {"id": courier_id},
                    {"$set": {
                        "break_start_time": now.isoformat(),
                        "break_pending_delivery": False
                    }}
                )
                
                # Break queue'u güncelle
                await db.break_queue.update_one(
                    {"courier_id": courier_id, "status": "ready"},
                    {"$set": {
                        "status": "active",
                        "started_at": now.isoformat(),
                        "updated_at": now.isoformat()
                    }}
                )
                
                logger.info(f"Paket teslim edildi, mola başladı: {courier.get('name')} ({courier_id})")
                
                # Bildirim gönder
                if company_id:
                    await send_break_notification_internal(
                        company_id, courier_id,
                        "break_started",
                        f"Paketinizi teslim ettiniz. Mola süreniz başladı! ({duration} dakika)"
                    )
                    
    except Exception as e:
        logger.error(f"Paket teslim kontrolü hatası: {e}")


async def reset_daily_break_time():
    """
    Her gün gece yarısı tüm kuryelerin günlük mola kullanımını sıfırla
    """
    logger.info("Günlük mola süreleri sıfırlanıyor...")
    
    try:
        result = await db.couriers.update_many(
            {},
            {"$set": {"used_break_time": 0}}
        )
        logger.info(f"Günlük mola süreleri sıfırlandı: {result.modified_count} kurye")
        
    except Exception as e:
        logger.error(f"Günlük mola sıfırlama hatası: {e}")


async def send_break_notification_internal(company_id: str, courier_id: str, notification_type: str, message: str, target: str = "courier"):
    """
    Internal bildirim gönderme fonksiyonu - DB + Push Notification
    target: "courier" = kuryeye bildirim (push notification gönderilir, admin panelinde görünmez)
            "admin" = admine bildirim (admin panelinde görünür, push gönderilmez)
    """
    import uuid
    from services.push_notification_service import send_push_notification
    
    now = datetime.now(TURKEY_TZ)
    
    try:
        # Aynı bildirim yakın zamanda gönderilmiş mi kontrol et (spam önleme)
        recent = await db.notifications.find_one({
            "courier_id": courier_id,
            "type": notification_type,
            "created_at": {"$gte": (now - timedelta(minutes=5)).isoformat()}
        })
        
        if recent:
            return  # Son 5 dakikada aynı bildirim gönderilmiş
        
        # Bildirim başlığı belirle
        title_map = {
            "break_approaching": "Mola Yaklaşıyor",
            "break_started": "Mola Başladı",
            "break_ended": "Mola Bitti",
            "break_ready": "Mola Sıranız Geldi",
            "break_ending_soon": "Mola Bitiyor",
            "break_approved": "Mola Onaylandı",
            "break_rejected": "Mola Reddedildi",
            "break_request": "Mola Talebi"
        }
        title = title_map.get(notification_type, "Mola Sistemi")
        
        # DB'ye kaydet
        notification = {
            "id": str(uuid.uuid4()),
            "company_id": company_id,
            "type": notification_type,
            "title": title,
            "message": message,
            "courier_id": courier_id,
            "target": target,  # "courier" veya "admin"
            "is_read": False,
            "created_at": now.isoformat()
        }
        
        await db.notifications.insert_one(notification)
        logger.debug(f"Bildirim DB'ye kaydedildi: {notification_type} -> {target} ({courier_id})")
        
        # Push Notification sadece kuryeye gönderilir
        if target == "courier":
            try:
                await send_push_notification(
                    courier_id=courier_id,
                    title=title,
                    body=message,
                    data={
                        "type": notification_type,
                        "notification_id": notification["id"]
                    },
                    sound="notification"
                )
                logger.debug(f"Push notification gönderildi: {notification_type} -> {courier_id}")
            except Exception as push_err:
                logger.warning(f"Push notification gönderilemedi: {push_err}")
        
    except Exception as e:
        logger.error(f"Bildirim gönderme hatası: {e}")
