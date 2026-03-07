"""
Mola Sistemi - Break System
Otomatik ve Manuel mola yönetimi

Şirket ayarları:
- break_mode: "automatic" | "manual"
- break_start_restriction: X dakika (vardiya başından itibaren molaya çıkılamaz)
- break_assignment_restriction: Y dakika (otomatik modda, molasına Y dk kala paket atanmaz)

Vardiya bazlı ayarlar:
- Eş zamanlı mola kişi limiti (her vardiya için ayrı)
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict
from datetime import datetime, timedelta
import uuid
import logging

from utils.database import db
from utils.helpers import get_turkey_now, TURKEY_TZ

router = APIRouter(prefix="/api", tags=["Break System"])
logger = logging.getLogger("break_system")


# --- Pydantic Models ---
class BreakSettingsUpdate(BaseModel):
    break_mode: Optional[str] = None  # "automatic" | "manual"
    break_start_restriction: Optional[int] = None  # Dakika
    break_assignment_restriction: Optional[int] = None  # Dakika (otomatik mod için)


class ShiftBreakLimitUpdate(BaseModel):
    break_limit: int  # Eş zamanlı mola kişi limiti


class BreakRequest(BaseModel):
    duration: int  # Dakika


class BreakRequestAction(BaseModel):
    action: str  # "approve" | "reject"


# --- Şirket Mola Ayarları ---
@router.get("/companies/{company_id}/break-settings")
async def get_break_settings(company_id: str):
    """Şirketin mola ayarlarını getir"""
    company = await db.companies.find_one(
        {"id": company_id},
        {"_id": 0, "id": 1, "break_settings": 1}
    )
    
    if not company or not company.get("id"):
        raise HTTPException(status_code=404, detail="Şirket bulunamadı")
    
    # Varsayılan ayarlar
    default_settings = {
        "break_mode": "automatic",
        "break_start_restriction": 30,  # Vardiya başından 30 dk molaya çıkılamaz
        "break_assignment_restriction": 10  # Molasına 10 dk kala paket atanmaz
    }
    
    settings = company.get("break_settings", {})
    return {**default_settings, **settings}


@router.put("/companies/{company_id}/break-settings")
async def update_break_settings(company_id: str, data: BreakSettingsUpdate):
    """Şirketin mola ayarlarını güncelle"""
    update_data = {}
    
    if data.break_mode is not None:
        if data.break_mode not in ["automatic", "manual"]:
            raise HTTPException(status_code=400, detail="break_mode 'automatic' veya 'manual' olmalı")
        update_data["break_settings.break_mode"] = data.break_mode
    
    if data.break_start_restriction is not None:
        if data.break_start_restriction < 0 or data.break_start_restriction > 480:
            raise HTTPException(status_code=400, detail="break_start_restriction 0-480 arasında olmalı")
        update_data["break_settings.break_start_restriction"] = data.break_start_restriction
    
    if data.break_assignment_restriction is not None:
        if data.break_assignment_restriction < 0 or data.break_assignment_restriction > 120:
            raise HTTPException(status_code=400, detail="break_assignment_restriction 0-120 arasında olmalı")
        update_data["break_settings.break_assignment_restriction"] = data.break_assignment_restriction
    
    if not update_data:
        raise HTTPException(status_code=400, detail="Güncellenecek veri yok")
    
    result = await db.companies.update_one(
        {"id": company_id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Şirket bulunamadı")
    
    return {"message": "Mola ayarları güncellendi"}


# --- Vardiya Bazlı Mola Limiti ---
@router.get("/shifts/{shift_id}/break-limit")
async def get_shift_break_limit(shift_id: str):
    """Vardiya mola limitini getir"""
    shift = await db.shifts.find_one({"id": shift_id}, {"_id": 0, "break_limit": 1, "name": 1})
    
    if not shift:
        raise HTTPException(status_code=404, detail="Vardiya bulunamadı")
    
    return {
        "shift_id": shift_id,
        "shift_name": shift.get("name"),
        "break_limit": shift.get("break_limit", 2)  # Varsayılan 2 kişi
    }


@router.put("/shifts/{shift_id}/break-limit")
async def update_shift_break_limit(shift_id: str, data: ShiftBreakLimitUpdate):
    """Vardiya mola limitini güncelle"""
    if data.break_limit < 0 or data.break_limit > 50:
        raise HTTPException(status_code=400, detail="break_limit 0-50 arasında olmalı")
    
    result = await db.shifts.update_one(
        {"id": shift_id},
        {"$set": {"break_limit": data.break_limit}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Vardiya bulunamadı")
    
    return {"message": f"Mola limiti güncellendi: {data.break_limit} kişi"}


@router.get("/companies/{company_id}/shifts-break-limits")
async def get_all_shifts_break_limits(company_id: str):
    """Şirketin tüm vardiyalarının mola limitlerini getir"""
    shifts = await db.shifts.find(
        {"company_id": company_id},
        {"_id": 0, "id": 1, "name": 1, "start_time": 1, "end_time": 1, "break_limit": 1}
    ).to_list(100)
    
    # Varsayılan değerleri ekle
    for shift in shifts:
        if "break_limit" not in shift:
            shift["break_limit"] = 2
    
    return shifts


# --- Mevcut Mola Durumu ---
@router.get("/companies/{company_id}/break-status")
async def get_company_break_status(company_id: str):
    """
    Şirketin mevcut mola durumunu getir:
    - Şu an moladaki kuryeler
    - Sıradaki kuryeler
    - Mevcut vardiya ve limiti
    """
    now = datetime.now(TURKEY_TZ)
    current_time = now.strftime("%H:%M")
    today = now.strftime("%Y-%m-%d")
    
    # Şirket ayarlarını al
    company = await db.companies.find_one(
        {"id": company_id},
        {"_id": 0, "break_settings": 1}
    )
    break_settings = company.get("break_settings", {}) if company else {}
    break_mode = break_settings.get("break_mode", "automatic")
    
    # Mevcut aktif vardiyayı bul
    shifts = await db.shifts.find({"company_id": company_id}, {"_id": 0}).to_list(100)
    active_shift = None
    
    for shift in shifts:
        start_time = shift.get("start_time", "00:00")
        end_time = shift.get("end_time", "23:59")
        
        # Gece vardiyası kontrolü (örn: 22:00 - 06:00)
        if start_time > end_time:
            if current_time >= start_time or current_time < end_time:
                active_shift = shift
                break
        else:
            if start_time <= current_time < end_time:
                active_shift = shift
                break
    
    # Moladaki kuryeler (company_ids veya company_id kontrolü)
    on_break_couriers = await db.couriers.find(
        {
            "$or": [
                {"company_ids": company_id},
                {"company_id": company_id}
            ],
            "availability_status": "on_break"
        },
        {"_id": 0, "id": 1, "name": 1, "break_start_time": 1, "requested_break_duration": 1}
    ).to_list(100)
    
    # Her kurye için kalan süre hesapla
    for courier in on_break_couriers:
        break_start = courier.get("break_start_time")
        duration = courier.get("requested_break_duration", 30)
        if break_start:
            try:
                start_time = datetime.fromisoformat(break_start.replace('Z', '+00:00'))
                if start_time.tzinfo is None:
                    start_time = start_time.replace(tzinfo=TURKEY_TZ)
                elapsed = (now - start_time).total_seconds() / 60
                courier["remaining_minutes"] = max(0, int(duration - elapsed))
            except:
                courier["remaining_minutes"] = duration
        else:
            courier["remaining_minutes"] = duration
    
    # Sıradaki kuryeler (otomatik mod için)
    queue = []
    if break_mode == "automatic":
        queue_items = await db.break_queue.find(
            {"company_id": company_id, "status": "waiting"},
            {"_id": 0}
        ).sort("queue_position", 1).to_list(100)
        
        # Kurye bilgilerini ekle
        for item in queue_items:
            courier = await db.couriers.find_one(
                {"id": item["courier_id"]},
                {"_id": 0, "name": 1}
            )
            if courier:
                item["courier_name"] = courier.get("name", "Bilinmiyor")
                queue.append(item)
    
    # Bekleyen talepler (manuel mod için)
    pending_requests = []
    if break_mode == "manual":
        pending_requests = await db.break_requests.find(
            {"company_id": company_id, "status": "pending"},
            {"_id": 0}
        ).sort("created_at", 1).to_list(100)
    
    return {
        "break_mode": break_mode,
        "active_shift": {
            "id": active_shift.get("id") if active_shift else None,
            "name": active_shift.get("name") if active_shift else "Vardiya yok",
            "start_time": active_shift.get("start_time") if active_shift else None,
            "end_time": active_shift.get("end_time") if active_shift else None,
            "break_limit": active_shift.get("break_limit", 2) if active_shift else 0
        },
        "on_break_count": len(on_break_couriers),
        "on_break_couriers": on_break_couriers,
        "queue": queue,
        "pending_requests": pending_requests,
        "current_time": current_time
    }


# --- Otomatik Mola Sistemi - Sıraya Girme ---
@router.post("/couriers/{courier_id}/break-queue")
async def join_break_queue(courier_id: str, data: BreakRequest):
    """Kurye mola sırasına girer (Otomatik mod)"""
    now = datetime.now(TURKEY_TZ)
    
    # Kurye kontrolü
    courier = await db.couriers.find_one({"id": courier_id}, {"_id": 0})
    if not courier:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")
    
    # company_ids veya company_id kontrolü
    company_ids = courier.get("company_ids") or []
    if not company_ids and courier.get("company_id"):
        company_ids = [courier.get("company_id")]
    
    if not company_ids:
        raise HTTPException(status_code=400, detail="Kurye bir şirkete bağlı değil")
    
    company_id = company_ids[0]
    
    # Şirket ayarlarını kontrol et
    company = await db.companies.find_one({"id": company_id}, {"_id": 0, "break_settings": 1})
    break_settings = company.get("break_settings", {}) if company else {}
    break_mode = break_settings.get("break_mode", "automatic")
    
    if break_mode != "automatic":
        raise HTTPException(status_code=400, detail="Şirket manuel mola modunda")
    
    # Günlük mola hakkı kontrolü
    daily_limit = courier.get("daily_break_limit", 30)
    used_break = courier.get("used_break_time", 0)
    remaining = daily_limit - used_break
    
    if remaining <= 0:
        raise HTTPException(status_code=400, detail="Günlük mola hakkınız doldu")
    
    # İstenen süre kontrolü
    if data.duration > remaining:
        raise HTTPException(
            status_code=400, 
            detail=f"İstenen süre kalan mola hakkınızdan fazla. Kalan: {remaining} dk"
        )
    
    # Vardiya başlangıç kısıtlaması kontrolü
    break_start_restriction = break_settings.get("break_start_restriction", 30)
    if await check_shift_start_restriction(company_id, courier_id, break_start_restriction):
        raise HTTPException(
            status_code=400, 
            detail=f"Vardiya başlangıcından {break_start_restriction} dakika geçmeden molaya çıkamazsınız"
        )
    
    # Zaten sırada mı kontrolü
    existing = await db.break_queue.find_one({
        "courier_id": courier_id,
        "status": {"$in": ["waiting", "ready"]}
    })
    if existing:
        raise HTTPException(status_code=400, detail="Zaten mola sırasındasınız")
    
    # Zaten molada mı kontrolü
    if courier.get("availability_status") == "on_break":
        raise HTTPException(status_code=400, detail="Zaten moldasınız")
    
    # Mevcut vardiya ve limiti al
    status = await get_company_break_status(company_id)
    active_shift = status.get("active_shift", {})
    break_limit = active_shift.get("break_limit", 2)
    on_break_count = status.get("on_break_count", 0)
    queue = status.get("queue", [])
    
    # Sıra pozisyonunu hesapla
    queue_position = len(queue) + 1
    
    # Tahmini bekleme süresi hesapla
    estimated_wait = await calculate_estimated_wait(company_id, queue_position, data.duration)
    
    # Sıraya ekle
    queue_entry = {
        "id": str(uuid.uuid4()),
        "courier_id": courier_id,
        "courier_name": courier.get("name"),
        "company_id": company_id,
        "duration": data.duration,
        "queue_position": queue_position,
        "status": "waiting",  # waiting, ready, active, completed, cancelled
        "estimated_wait_minutes": estimated_wait["wait_minutes"],
        "estimated_start_time": estimated_wait["start_time"],
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    await db.break_queue.insert_one(queue_entry)
    
    # Eğer limit müsaitse direkt molaya başlat
    if on_break_count < break_limit and queue_position == 1:
        return await start_break_from_queue(courier_id, queue_entry["id"])
    
    return {
        "message": "Mola sırasına girdiniz",
        "queue_position": queue_position,
        "estimated_wait_minutes": estimated_wait["wait_minutes"],
        "estimated_start_time": estimated_wait["start_time"],
        "queue_id": queue_entry["id"]
    }


@router.delete("/couriers/{courier_id}/break-queue")
async def leave_break_queue(courier_id: str):
    """Kurye mola sırasından çıkar"""
    result = await db.break_queue.delete_one({
        "courier_id": courier_id,
        "status": "waiting"
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Sırada değilsiniz")
    
    # Sıra pozisyonlarını güncelle
    # (Kuyruktaki diğer kişilerin pozisyonlarını düşür)
    # Bu işlem scheduler tarafından periyodik olarak da yapılabilir
    
    return {"message": "Mola sırasından çıktınız"}


# --- Manuel Mola Sistemi - Talep ---
@router.post("/couriers/{courier_id}/break-request")
async def create_break_request(courier_id: str, data: BreakRequest):
    """Kurye mola talebi oluşturur (Manuel mod)"""
    now = datetime.now(TURKEY_TZ)
    
    # Kurye kontrolü
    courier = await db.couriers.find_one({"id": courier_id}, {"_id": 0})
    if not courier:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")
    
    # company_ids veya company_id kontrolü
    company_ids = courier.get("company_ids") or []
    if not company_ids and courier.get("company_id"):
        company_ids = [courier.get("company_id")]
    
    if not company_ids:
        raise HTTPException(status_code=400, detail="Kurye bir şirkete bağlı değil")
    
    company_id = company_ids[0]
    
    # Şirket ayarlarını kontrol et
    company = await db.companies.find_one({"id": company_id}, {"_id": 0, "break_settings": 1})
    break_settings = company.get("break_settings", {}) if company else {}
    break_mode = break_settings.get("break_mode", "automatic")
    
    if break_mode != "manual":
        raise HTTPException(status_code=400, detail="Şirket otomatik mola modunda")
    
    # Günlük mola hakkı kontrolü
    daily_limit = courier.get("daily_break_limit", 30)
    used_break = courier.get("used_break_time", 0)
    remaining = daily_limit - used_break
    
    if remaining <= 0:
        raise HTTPException(status_code=400, detail="Günlük mola hakkınız doldu")
    
    if data.duration > remaining:
        raise HTTPException(
            status_code=400, 
            detail=f"İstenen süre kalan mola hakkınızdan fazla. Kalan: {remaining} dk"
        )
    
    # Vardiya başlangıç kısıtlaması kontrolü
    break_start_restriction = break_settings.get("break_start_restriction", 30)
    if await check_shift_start_restriction(company_id, courier_id, break_start_restriction):
        raise HTTPException(
            status_code=400, 
            detail=f"Vardiya başlangıcından {break_start_restriction} dakika geçmeden molaya çıkamazsınız"
        )
    
    # Mevcut limit kontrolü
    status = await get_company_break_status(company_id)
    active_shift = status.get("active_shift", {})
    break_limit = active_shift.get("break_limit", 2)
    on_break_count = status.get("on_break_count", 0)
    
    if on_break_count >= break_limit:
        raise HTTPException(status_code=400, detail="Şu an mola limiti dolu, daha sonra tekrar deneyin")
    
    # Bekleyen talep kontrolü
    existing = await db.break_requests.find_one({
        "courier_id": courier_id,
        "status": "pending"
    })
    if existing:
        raise HTTPException(status_code=400, detail="Zaten bekleyen bir talebiniz var")
    
    # Talep oluştur
    request = {
        "id": str(uuid.uuid4()),
        "courier_id": courier_id,
        "courier_name": courier.get("name"),
        "company_id": company_id,
        "duration": data.duration,
        "status": "pending",  # pending, approved, rejected
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    
    await db.break_requests.insert_one(request)
    
    # Admin'e bildirim gönder
    await send_break_notification(
        company_id=company_id,
        courier_id=courier_id,
        courier_name=courier.get("name"),
        notification_type="break_request",
        message=f"{courier.get('name')} {data.duration} dakikalık mola talep etti"
    )
    
    return {
        "message": "Mola talebi gönderildi",
        "request_id": request["id"]
    }


@router.put("/break-requests/{request_id}/action")
async def handle_break_request(request_id: str, data: BreakRequestAction):
    """Admin mola talebini onaylar veya reddeder"""
    now = datetime.now(TURKEY_TZ)
    
    if data.action not in ["approve", "reject"]:
        raise HTTPException(status_code=400, detail="action 'approve' veya 'reject' olmalı")
    
    request = await db.break_requests.find_one({"id": request_id}, {"_id": 0})
    if not request:
        raise HTTPException(status_code=404, detail="Talep bulunamadı")
    
    if request.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Talep zaten işlenmiş")
    
    courier_id = request.get("courier_id")
    company_id = request.get("company_id")
    courier_name = request.get("courier_name")
    duration = request.get("duration", 30)
    
    if data.action == "approve":
        # Kuryeyi molaya al
        courier = await db.couriers.find_one({"id": courier_id}, {"_id": 0})
        
        # Yolda paketi var mı kontrol et
        on_way_orders = await db.orders.count_documents({
            "courier_id": courier_id,
            "status": "on_the_way"
        })
        
        if on_way_orders > 0:
            # Yolda paket var, mola durumuna al ama süre başlamasın
            await db.couriers.update_one(
                {"id": courier_id},
                {"$set": {
                    "availability_status": "on_break",
                    "break_pending_delivery": True,
                    "requested_break_duration": duration,
                    "break_approved_at": now.isoformat()
                }}
            )
            message = "Mola talebiniz onaylandı. Paketinizi teslim ettiğinizde mola süreniz başlayacak."
        else:
            # Direkt molaya al
            await db.couriers.update_one(
                {"id": courier_id},
                {"$set": {
                    "availability_status": "on_break",
                    "break_start_time": now.isoformat(),
                    "requested_break_duration": duration,
                    "break_pending_delivery": False
                }}
            )
            message = "Mola talebiniz onaylandı. Mola süreniz başladı."
        
        await db.break_requests.update_one(
            {"id": request_id},
            {"$set": {"status": "approved", "updated_at": now.isoformat()}}
        )
        
        # Kuryeye bildirim
        await send_break_notification(
            company_id=company_id,
            courier_id=courier_id,
            courier_name=courier_name,
            notification_type="break_approved",
            message=message
        )
        
        return {"message": "Talep onaylandı"}
    
    else:  # reject
        await db.break_requests.update_one(
            {"id": request_id},
            {"$set": {"status": "rejected", "updated_at": now.isoformat()}}
        )
        
        # Kuryeye bildirim
        await send_break_notification(
            company_id=company_id,
            courier_id=courier_id,
            courier_name=courier_name,
            notification_type="break_rejected",
            message="Mola talebiniz reddedildi."
        )
        
        return {"message": "Talep reddedildi"}


# --- Helper Functions ---
async def check_shift_start_restriction(company_id: str, courier_id: str, restriction_minutes: int) -> bool:
    """
    Vardiya başlangıç kısıtlamasını kontrol et.
    True dönerse kısıtlama aktif (molaya çıkılamaz).
    """
    if restriction_minutes <= 0:
        return False
    
    now = datetime.now(TURKEY_TZ)
    current_time = now.strftime("%H:%M")
    today = now.strftime("%Y-%m-%d")
    today_weekday = now.strftime("%A").lower()
    
    # Bugün kuryenin vardiyalarını bul
    assignments = await db.shift_assignments.find({
        "company_id": company_id,
        "courier_id": courier_id,
        "day": today_weekday
    }, {"_id": 0, "shift_id": 1}).to_list(10)
    
    if not assignments:
        return False  # Bugün vardiyası yok
    
    shift_ids = [a["shift_id"] for a in assignments]
    shifts = await db.shifts.find({"id": {"$in": shift_ids}}, {"_id": 0}).to_list(10)
    
    for shift in shifts:
        start_time = shift.get("start_time", "00:00")
        end_time = shift.get("end_time", "23:59")
        
        # Gece vardiyası kontrolü
        if start_time > end_time:
            if current_time >= start_time or current_time < end_time:
                # Bu vardiya içindeyiz
                try:
                    start_hour, start_min = map(int, start_time.split(":"))
                    shift_start = now.replace(hour=start_hour, minute=start_min, second=0, microsecond=0)
                    if current_time < start_time:
                        shift_start -= timedelta(days=1)
                    
                    elapsed = (now - shift_start).total_seconds() / 60
                    if elapsed < restriction_minutes:
                        return True
                except:
                    pass
        else:
            if start_time <= current_time < end_time:
                # Bu vardiya içindeyiz
                try:
                    start_hour, start_min = map(int, start_time.split(":"))
                    shift_start = now.replace(hour=start_hour, minute=start_min, second=0, microsecond=0)
                    
                    elapsed = (now - shift_start).total_seconds() / 60
                    if elapsed < restriction_minutes:
                        return True
                except:
                    pass
    
    return False


async def calculate_estimated_wait(company_id: str, queue_position: int, duration: int) -> dict:
    """
    Tahmini bekleme süresini hesapla.
    Vardiya geçişlerini ve limitleri dikkate alır.
    """
    now = datetime.now(TURKEY_TZ)
    
    # Moladaki kuryeler ve kalan süreleri
    on_break = await db.couriers.find(
        {"company_ids": company_id, "availability_status": "on_break"},
        {"_id": 0, "break_start_time": 1, "requested_break_duration": 1}
    ).to_list(100)
    
    # Sıradaki kuryeler
    queue = await db.break_queue.find(
        {"company_id": company_id, "status": "waiting"},
        {"_id": 0, "duration": 1, "queue_position": 1}
    ).sort("queue_position", 1).to_list(100)
    
    # Önümdeki toplam süre hesapla
    total_wait = 0
    
    # Moladakilerin kalan süreleri
    for courier in on_break:
        break_start = courier.get("break_start_time")
        dur = courier.get("requested_break_duration", 30)
        if break_start:
            try:
                start = datetime.fromisoformat(break_start.replace('Z', '+00:00'))
                if start.tzinfo is None:
                    start = start.replace(tzinfo=TURKEY_TZ)
                elapsed = (now - start).total_seconds() / 60
                remaining = max(0, dur - elapsed)
                total_wait += remaining
            except:
                total_wait += dur
        else:
            total_wait += dur
    
    # Öndeki sıradakilerin süreleri
    for item in queue:
        if item.get("queue_position", 0) < queue_position:
            total_wait += item.get("duration", 30)
    
    # TODO: Vardiya geçişi ve limit=0 kontrolü eklenecek
    # Şimdilik basit hesaplama
    
    estimated_start = now + timedelta(minutes=total_wait)
    
    return {
        "wait_minutes": int(total_wait),
        "start_time": estimated_start.isoformat()
    }


async def start_break_from_queue(courier_id: str, queue_id: str) -> dict:
    """Sıradaki kuryenin molasını başlat"""
    now = datetime.now(TURKEY_TZ)
    
    courier = await db.couriers.find_one({"id": courier_id}, {"_id": 0})
    if not courier:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")
    
    queue_entry = await db.break_queue.find_one({"id": queue_id}, {"_id": 0})
    if not queue_entry:
        raise HTTPException(status_code=404, detail="Sıra kaydı bulunamadı")
    
    duration = queue_entry.get("duration", 30)
    
    # Yolda paketi var mı kontrol et
    on_way_orders = await db.orders.count_documents({
        "courier_id": courier_id,
        "status": "on_the_way"
    })
    
    if on_way_orders > 0:
        # Yolda paket var
        await db.couriers.update_one(
            {"id": courier_id},
            {"$set": {
                "availability_status": "on_break",
                "break_pending_delivery": True,
                "requested_break_duration": duration,
                "break_approved_at": now.isoformat()
            }}
        )
        await db.break_queue.update_one(
            {"id": queue_id},
            {"$set": {"status": "ready", "updated_at": now.isoformat()}}
        )
        message = "Mola sıranız geldi! Paketinizi teslim ettiğinizde mola süreniz başlayacak."
    else:
        # Direkt mola başlat
        await db.couriers.update_one(
            {"id": courier_id},
            {"$set": {
                "availability_status": "on_break",
                "break_start_time": now.isoformat(),
                "requested_break_duration": duration,
                "break_pending_delivery": False
            }}
        )
        await db.break_queue.update_one(
            {"id": queue_id},
            {"$set": {"status": "active", "started_at": now.isoformat(), "updated_at": now.isoformat()}}
        )
        message = "Mola süreniz başladı!"
    
    # Kuryeye bildirim
    await send_break_notification(
        company_id=queue_entry.get("company_id"),
        courier_id=courier_id,
        courier_name=courier.get("name"),
        notification_type="break_started",
        message=message
    )
    
    return {
        "message": message,
        "status": "break_started" if on_way_orders == 0 else "waiting_delivery"
    }


async def send_break_notification(
    company_id: str,
    courier_id: str,
    courier_name: str,
    notification_type: str,
    message: str
):
    """Mola bildirimi gönder"""
    now = datetime.now(TURKEY_TZ)
    
    notification = {
        "id": str(uuid.uuid4()),
        "company_id": company_id,
        "type": notification_type,
        "title": "Mola Sistemi",
        "message": message,
        "courier_id": courier_id,
        "courier_name": courier_name,
        "read": False,
        "created_at": now.isoformat()
    }
    
    await db.notifications.insert_one(notification)
    
    # TODO: Push notification gönderimi eklenecek
    logger.info(f"Break notification: {notification_type} - {courier_name} - {message}")



# --- Kurye Mola Durumu Kontrolü (Admin Atama için) ---
@router.get("/couriers/{courier_id}/break-queue-status")
async def check_courier_break_queue_status(courier_id: str):
    """
    Admin manuel atama yaparken kuryenin mola sırasında olup olmadığını kontrol et.
    Eğer sıradaysa ve tahmini süre X dk'dan azsa uyarı döndür.
    """
    now = datetime.now(TURKEY_TZ)
    
    # Kurye bilgisini al
    courier = await db.couriers.find_one(
        {"id": courier_id},
        {"_id": 0, "id": 1, "name": 1, "company_ids": 1, "company_id": 1}
    )
    
    if not courier:
        return {"in_queue": False, "warning": None}
    
    # company_ids veya company_id kontrolü
    company_ids = courier.get("company_ids") or []
    if not company_ids and courier.get("company_id"):
        company_ids = [courier.get("company_id")]
    company_id = company_ids[0] if company_ids else None
    
    if not company_id:
        return {"in_queue": False, "warning": None}
    
    # Şirket ayarlarını al
    company = await db.companies.find_one(
        {"id": company_id},
        {"_id": 0, "break_settings": 1}
    )
    break_settings = company.get("break_settings", {}) if company else {}
    break_mode = break_settings.get("break_mode", "automatic")
    
    if break_mode != "automatic":
        return {"in_queue": False, "warning": None}
    
    # Mola sırasında mı kontrol et
    queue_entry = await db.break_queue.find_one(
        {
            "courier_id": courier_id,
            "status": {"$in": ["waiting", "ready"]}
        },
        {"_id": 0, "estimated_wait_minutes": 1, "created_at": 1, "status": 1, "duration": 1}
    )
    
    if not queue_entry:
        return {"in_queue": False, "warning": None}
    
    # Tahmini bekleme süresini hesapla
    estimated_wait = queue_entry.get("estimated_wait_minutes", 0)
    created_at = queue_entry.get("created_at")
    
    if created_at:
        try:
            created_time = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
            if created_time.tzinfo is None:
                created_time = created_time.replace(tzinfo=TURKEY_TZ)
            elapsed = (now - created_time).total_seconds() / 60
            remaining_wait = max(0, estimated_wait - elapsed)
        except:
            remaining_wait = estimated_wait
    else:
        remaining_wait = estimated_wait
    
    # Uyarı mesajı oluştur
    assignment_restriction = break_settings.get("break_assignment_restriction", 10)
    
    if queue_entry.get("status") == "ready":
        # Sırası gelmiş, paket bekliyor
        return {
            "in_queue": True,
            "warning": f"Bu kuryenin mola sırası geldi ve paket teslimini bekliyor. Yine de atamak istiyor musunuz?",
            "remaining_minutes": 0,
            "status": "ready"
        }
    elif remaining_wait <= assignment_restriction:
        # Sırası yaklaşmış
        return {
            "in_queue": True,
            "warning": f"Bu kuryenin molasına {int(remaining_wait)} dakika kaldı. Yine de atamak istiyor musunuz?",
            "remaining_minutes": int(remaining_wait),
            "status": "approaching"
        }
    else:
        # Sırada ama henüz zamanı gelmemiş
        return {
            "in_queue": True,
            "warning": None,
            "remaining_minutes": int(remaining_wait),
            "status": "waiting"
        }
