from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel, ConfigDict
from typing import Optional, List
import uuid
from services import courier_service
from utils.database import db
from utils.helpers import get_turkey_now, ensure_turkey_timezone, TURKEY_TZ

router = APIRouter(prefix="/api", tags=["Couriers"])


# --- Pydantic Models ---
class AddCourierToCompany(BaseModel):
    phone: str


class GhostCourierCreate(BaseModel):
    name: str


class MergeCouriersRequest(BaseModel):
    ghost_courier_id: str
    real_courier_id: str


class CourierUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    plate: Optional[str] = None
    address: Optional[str] = None
    password: Optional[str] = None


class CourierResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    phone: str
    address: str
    iban: str
    plate: str
    status: str
    created_at: str


# --- Courier Management ---
@router.get("/couriers/all")
async def get_all_couriers_system():
    """Get all couriers in the system with company info (for system admin)"""
    return await courier_service.get_all_couriers()


@router.get("/couriers")
async def get_all_couriers():
    """Get all couriers in the system (for system admin)"""
    return await courier_service.get_all_couriers()


@router.get("/couriers/{courier_id}")
async def get_courier_by_id(courier_id: str):
    """Get single courier by ID"""
    courier = await db.couriers.find_one({"id": courier_id}, {"_id": 0})
    if not courier:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")
    # Set default availability if not present
    if "availability_status" not in courier:
        courier["availability_status"] = "offline"
    return courier


@router.delete("/couriers/{courier_id}/permanent")
async def delete_courier_permanently(courier_id: str):
    """Permanently delete a courier account and all related data"""
    # Check if courier exists
    courier = await db.couriers.find_one({"id": courier_id})
    if not courier:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")
    
    # Delete courier from all companies (company_couriers)
    await db.company_couriers.delete_many({"courier_id": courier_id})
    
    # Delete courier's transactions (optional - might want to keep for records)
    # await db.transactions.delete_many({"entity_id": courier_id, "entity_type": "courier"})
    
    # Delete courier
    await db.couriers.delete_one({"id": courier_id})
    
    return {"message": "Kurye hesabı kalıcı olarak silindi"}


@router.get("/couriers/search")
async def search_courier(phone: str):
    """Search courier by phone number"""
    courier = await courier_service.search_courier_by_phone(phone)
    if not courier:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")
    return courier


@router.get("/companies/{company_id}/couriers")
async def get_company_couriers(company_id: str, include_archived: bool = False, include_inactive: bool = False):
    """Get couriers assigned to a specific company"""
    return await courier_service.get_company_couriers(company_id, include_inactive, include_archived)


@router.get("/companies/{company_id}/couriers/inactive")
async def get_inactive_company_couriers(company_id: str):
    """Get inactive couriers assigned to a specific company"""
    return await courier_service.get_inactive_company_couriers(company_id)


@router.post("/companies/{company_id}/couriers")
async def add_courier_to_company(
    company_id: str, 
    data: AddCourierToCompany
):
    """Add a courier to company by phone number"""
    result, error = await courier_service.add_courier_to_company(company_id, data.phone)
    if error:
        raise HTTPException(status_code=400 if "ekli" in error or "bulunamadı" not in error else 404, detail=error)
    return result


@router.post("/companies/{company_id}/couriers/ghost")
async def create_ghost_courier(
    company_id: str,
    data: GhostCourierCreate
):
    """Create a ghost courier (only name, no login capability) for accounting purposes"""
    result, error = await courier_service.create_ghost_courier(company_id, data.name)
    if error:
        raise HTTPException(status_code=400, detail=error)
    return result


@router.post("/couriers/merge")
async def merge_couriers(data: MergeCouriersRequest):
    """Merge a ghost courier into a real courier - transfer all transactions, invoices, etc."""
    result, error = await courier_service.merge_couriers(data.ghost_courier_id, data.real_courier_id)
    if error:
        raise HTTPException(status_code=400, detail=error)
    return result


@router.put("/couriers/{courier_id}")
async def update_courier(
    courier_id: str, 
    data: CourierUpdate
):
    """Update courier info (by Super Admin)"""
    result, error = await courier_service.update_courier(
        courier_id, 
        name=data.name, 
        phone=data.phone, 
        plate=data.plate, 
        address=data.address, 
        password=data.password
    )
    if error:
        raise HTTPException(status_code=400 if "bulunamadı" not in error else 404, detail=error)
    return result


@router.put("/companies/{company_id}/couriers/{courier_id}/deactivate")
async def deactivate_company_courier(
    company_id: str, 
    courier_id: str
):
    """Deactivate a courier (set to passive)"""
    result, error = await courier_service.deactivate_courier(company_id, courier_id)
    if error:
        raise HTTPException(status_code=400 if "bulunamadı" not in error else 404, detail=error)
    return result


@router.put("/companies/{company_id}/couriers/{courier_id}/activate")
async def activate_company_courier(
    company_id: str, 
    courier_id: str
):
    """Activate a courier (set to active)"""
    result, error = await courier_service.activate_courier(company_id, courier_id)
    if error:
        raise HTTPException(status_code=404, detail=error)
    return result


@router.delete("/companies/{company_id}/couriers/{courier_id}")
async def remove_courier_from_company(
    company_id: str, 
    courier_id: str
):
    """Remove courier from company"""
    result, error = await courier_service.remove_courier_from_company(company_id, courier_id)
    if error:
        raise HTTPException(status_code=400 if "zimmetli" in error else 404, detail=error)
    return result


@router.put("/companies/{company_id}/couriers/{courier_id}/archive")
async def archive_company_courier(
    company_id: str, 
    courier_id: str
):
    """Archive a courier (move to archive list)"""
    result, error = await courier_service.archive_courier(company_id, courier_id)
    if error:
        raise HTTPException(status_code=400 if "bulunamadı" not in error else 404, detail=error)
    return result


@router.put("/companies/{company_id}/couriers/{courier_id}/unarchive")
async def unarchive_company_courier(
    company_id: str, 
    courier_id: str
):
    """Unarchive a courier (restore from archive)"""
    result, error = await courier_service.unarchive_courier(company_id, courier_id)
    if error:
        raise HTTPException(status_code=404, detail=error)
    return result


# --- Fesih (Termination) Endpoints ---
@router.post("/companies/{company_id}/couriers/{courier_id}/start-termination")
async def start_termination(
    company_id: str, 
    courier_id: str
):
    """Start 15-day termination period for a courier"""
    result, error = await courier_service.start_termination(company_id, courier_id)
    if error:
        raise HTTPException(status_code=400 if "başlatılmış" in error else 404, detail=error)
    return result


@router.post("/companies/{company_id}/couriers/{courier_id}/cancel-termination")
async def cancel_termination(
    company_id: str, 
    courier_id: str
):
    """Cancel termination process"""
    result, error = await courier_service.cancel_termination(company_id, courier_id)
    if error:
        raise HTTPException(status_code=400 if "bulunmuyor" in error else 404, detail=error)
    return result


@router.get("/couriers/{courier_id}/termination-status")
async def get_termination_status(courier_id: str, company_id: str):
    """Get termination status for a courier"""
    return await courier_service.get_termination_status(company_id, courier_id)



# --- Kurye Availability Status (Aktif/Molada/Çevrimdışı) ---
class AvailabilityStatusUpdate(BaseModel):
    availability_status: str  # active, on_break, offline
    force: bool = False  # Admin için limit kontrolünü bypass et


@router.put("/couriers/{courier_id}/availability")
async def update_courier_availability(courier_id: str, data: AvailabilityStatusUpdate):
    """Update courier availability status (active/on_break/offline)"""
    from datetime import datetime, timezone, timedelta
    from routers.courier_status_logs import create_status_log
    from routers.shift_violations import log_violation
    
    valid_statuses = ["active", "on_break", "offline"]
    if data.availability_status not in valid_statuses:
        raise HTTPException(status_code=400, detail="Geçersiz durum. active, on_break veya offline olmalı")
    
    # Kurye bilgilerini al
    courier = await db.couriers.find_one({"id": courier_id}, {"_id": 0})
    if not courier:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")
    
    current_status = courier.get("availability_status", "offline")
    now = datetime.now(TURKEY_TZ)
    
    # Durum değişmediyse log tutma
    if current_status == data.availability_status:
        status_labels = {"active": "Aktif", "on_break": "Molada", "offline": "Çevrimdışı"}
        return {"message": f"Kurye zaten {status_labels[data.availability_status]} durumunda"}
    
    update_data = {"availability_status": data.availability_status}
    
    # Aktif olma zamanını kaydet (vardiya ihlal kontrolü için)
    if data.availability_status == "active" and current_status != "active":
        update_data["activated_at"] = now.isoformat()
    
    # Molaya çıkış kontrolü
    if data.availability_status == "on_break" and current_status != "on_break":
        # Mola limitini kontrol et (force=True ise admin atlaması)
        if not data.force:
            daily_break_limit = courier.get("daily_break_limit", 30)  # Varsayılan 30dk
            used_break_time = courier.get("used_break_time", 0)
            remaining = daily_break_limit - used_break_time
            
            if remaining <= 0:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Günlük mola süreniz doldu. Limit: {daily_break_limit} dakika"
                )
        
        # Mola başlangıç zamanını kaydet
        update_data["break_start_time"] = now.isoformat()
    
    # Moladan çıkış - kullanılan süreyi hesapla
    if current_status == "on_break" and data.availability_status != "on_break":
        break_start = courier.get("break_start_time")
        if break_start:
            try:
                start_time = datetime.fromisoformat(break_start.replace('Z', '+00:00'))
                elapsed_minutes = int((now - start_time).total_seconds() / 60)
                used_break_time = courier.get("used_break_time", 0) + elapsed_minutes
                update_data["used_break_time"] = used_break_time
                update_data["break_start_time"] = None
            except:
                pass
    
    result = await db.couriers.update_one(
        {"id": courier_id},
        {"$set": update_data}
    )
    
    # Durum değişikliği logu kaydet
    company_id = courier.get("company_id") or (courier.get("company_ids", [None])[0] if courier.get("company_ids") else None)
    changed_by = "admin" if data.force else "courier"
    
    try:
        await create_status_log(
            courier_id=courier_id,
            old_status=current_status,
            new_status=data.availability_status,
            changed_by=changed_by,
            company_id=company_id
        )
    except Exception as e:
        print(f"Status log creation failed: {e}")
    
    # === ADMIN-KURYE SENKRONIZASYONU ===
    # Kurye panelinden aktif olunduğunda, bağlı admin hesabını çevrimdışı yap
    if data.availability_status == "active" and courier.get("is_admin_linked"):
        try:
            # Bağlı admin'i bul
            linked_admin = await db.admins.find_one(
                {"linked_courier_id": courier_id},
                {"_id": 0, "id": 1, "availability_status": 1, "status": 1, "company_id": 1}
            )
            
            # Admin aktif mi kontrol et (availability_status veya status alanı)
            admin_status = linked_admin.get("availability_status") or linked_admin.get("status") if linked_admin else None
            
            if linked_admin and admin_status == "active":
                # Admin'i çevrimdışı yap
                await db.admins.update_one(
                    {"id": linked_admin["id"]},
                    {"$set": {"status": "offline", "availability_status": "offline"}}
                )
                
                # Admin status log oluştur
                await db.admin_status_logs.insert_one({
                    "id": str(uuid.uuid4()),
                    "admin_id": linked_admin["id"],
                    "company_id": linked_admin.get("company_id"),
                    "status": "offline",
                    "timestamp": now.isoformat(),
                    "date": now.strftime("%Y-%m-%d")
                })
                print(f"Admin {linked_admin['id']} auto-deactivated due to courier panel activation")
        except Exception as e:
            print(f"Admin sync failed: {e}")
    
    # === VARDIYA İHLALİ KONTROLÜ ===
    # Kurye aktif olduğunda vardiyası var mı kontrol et
    if data.availability_status == "active" and company_id:
        try:
            from utils.shift_scheduler import get_company_tolerance
            
            # Türkiye saati
            turkey_tz = timezone(timedelta(hours=3))
            now_turkey = datetime.now(turkey_tz)
            days_map = ["pazartesi", "sali", "carsamba", "persembe", "cuma", "cumartesi", "pazar"]
            today_key = days_map[now_turkey.weekday()]
            current_minutes = now_turkey.hour * 60 + now_turkey.minute
            
            # Bugün bu kuryenin vardiyası var mı?
            assignments = await db.shift_assignments.find({
                "company_id": company_id,
                "courier_id": courier_id,
                "day": today_key
            }, {"_id": 0, "shift_id": 1}).to_list(10)
            
            # Tolerans süresini al
            tolerance = await get_company_tolerance(company_id)
            
            # Vardiya var mı kontrol et (tolerans dahil)
            has_valid_shift = False
            if assignments:
                shift_ids = [a["shift_id"] for a in assignments]
                shifts = await db.shifts.find(
                    {"id": {"$in": shift_ids}},
                    {"_id": 0, "start_time": 1, "end_time": 1}
                ).to_list(10)
                
                for shift in shifts:
                    start_h, start_m = map(int, shift["start_time"].split(":"))
                    end_h, end_m = map(int, shift["end_time"].split(":"))
                    start_minutes = start_h * 60 + start_m
                    end_minutes = end_h * 60 + end_m
                    
                    # Tolerans ile genişletilmiş aralık (erken giriş için)
                    effective_start = start_minutes - tolerance
                    
                    # Gece geçişi kontrolü
                    if end_minutes <= start_minutes:
                        # Gece vardiyası
                        if current_minutes >= effective_start or current_minutes < end_minutes + tolerance:
                            has_valid_shift = True
                            break
                    else:
                        # Normal vardiya - tolerans ile genişletilmiş aralık
                        if effective_start <= current_minutes < end_minutes + tolerance:
                            has_valid_shift = True
                            break
            
            # Admin-kurye ise yönetici olarak logla
            if not has_valid_shift:
                if courier.get("is_admin_linked"):
                    admin = await db.admins.find_one(
                        {"linked_courier_id": courier_id},
                        {"_id": 0, "id": 1, "name": 1}
                    )
                    if admin:
                        await log_violation(
                            company_id=company_id,
                            entity_type="admin",
                            entity_id=admin["id"],
                            entity_name=admin["name"],
                            violation_type="active_without_shift",
                            details={"linked_courier_id": courier_id, "triggered_by": "courier_activation"}
                        )
                else:
                    await log_violation(
                        company_id=company_id,
                        entity_type="courier",
                        entity_id=courier_id,
                        entity_name=courier.get("name", ""),
                        violation_type="active_without_shift",
                        details={"triggered_by": "courier_activation"}
                    )
        except Exception as e:
            print(f"Shift violation check failed: {e}")
    
    # === VARDIYA KAPANIŞ KONTROLÜ ===
    # Kurye pasif olduğunda:
    # 1. Şu an aktif vardiyası varsa → "Vardiya bitmeden çevrimdışı" ihlali
    # 2. Yoksa, bitmiş vardiyası varsa → "Geç kapattı" ihlali (tolerans dahilinde değilse)
    if data.availability_status == "offline" and company_id:
        try:
            from utils.shift_scheduler import get_company_tolerance
            
            # Türkiye saati
            turkey_tz = timezone(timedelta(hours=3))
            now_turkey = datetime.now(turkey_tz)
            days_map = ["pazartesi", "sali", "carsamba", "persembe", "cuma", "cumartesi", "pazar"]
            today_key = days_map[now_turkey.weekday()]
            current_minutes = now_turkey.hour * 60 + now_turkey.minute
            
            # Tolerans süresini al
            tolerance = await get_company_tolerance(company_id)
            
            # Bugün bu kuryenin vardiyalarını bul
            assignments = await db.shift_assignments.find({
                "company_id": company_id,
                "courier_id": courier_id,
                "day": today_key
            }, {"_id": 0, "shift_id": 1}).to_list(10)
            
            if assignments:
                shift_ids = [a["shift_id"] for a in assignments]
                shifts = await db.shifts.find(
                    {"id": {"$in": shift_ids}},
                    {"_id": 0, "id": 1, "start_time": 1, "end_time": 1}
                ).to_list(10)
                
                # Şu an aktif olan vardiya var mı kontrol et
                active_shift = None
                latest_ended_shift = None
                latest_end_minutes = -1
                within_tolerance = False  # Tolerans dahilinde biten vardiya var mı?
                
                for shift in shifts:
                    start_h, start_m = map(int, shift["start_time"].split(":"))
                    end_h, end_m = map(int, shift["end_time"].split(":"))
                    start_minutes = start_h * 60 + start_m
                    end_minutes = end_h * 60 + end_m
                    
                    # Gece geçişi kontrolü
                    if end_minutes <= start_minutes:
                        # Gece vardiyası (örn: 22:00 - 06:00)
                        if current_minutes >= start_minutes or current_minutes < end_minutes:
                            active_shift = shift
                            break
                    else:
                        # Normal vardiya - hala devam ediyor mu?
                        if start_minutes <= current_minutes < end_minutes:
                            # Vardiya hala devam ediyor, erken çıkış kontrolü
                            if current_minutes < (end_minutes - tolerance):
                                active_shift = shift
                                break
                            # Tolerans aralığında (bitiş-tolerans ile bitiş arası)
                            else:
                                within_tolerance = True
                                break
                    
                    # Bitmiş vardiyaları kontrol et
                    if end_minutes <= current_minutes:
                        minutes_since_end = current_minutes - end_minutes
                        # Tolerans dahilinde bittiyse, ihlal yok
                        if minutes_since_end <= tolerance:
                            within_tolerance = True
                        else:
                            # Tolerans aşıldı, en son biteni bul
                            if end_minutes > latest_end_minutes:
                                latest_ended_shift = shift
                                latest_end_minutes = end_minutes
                
                # Tolerans dahilinde bir vardiya varsa hiç ihlal yok
                if within_tolerance:
                    latest_ended_shift = None
                    active_shift = None
                
                # Admin-kurye bilgisini al
                admin_info = None
                if courier.get("is_admin_linked"):
                    admin_info = await db.admins.find_one(
                        {"linked_courier_id": courier_id},
                        {"_id": 0, "id": 1, "name": 1}
                    )
                
                # DURUM 1: Şu an aktif vardiyası var ama çevrimdışı oluyor (tolerans dahilinde değil)
                if active_shift:
                    if admin_info:
                        await log_violation(
                            company_id=company_id,
                            entity_type="admin",
                            entity_id=admin_info["id"],
                            entity_name=admin_info["name"],
                            violation_type="offline_before_shift_end",
                            details={
                                "linked_courier_id": courier_id,
                                "shift_id": active_shift["id"],
                                "shift_time": f"{active_shift['start_time']} - {active_shift['end_time']}",
                                "deactivated_at": now_turkey.strftime("%H:%M"),
                                "triggered_by": "courier_deactivation"
                            }
                        )
                    else:
                        await log_violation(
                            company_id=company_id,
                            entity_type="courier",
                            entity_id=courier_id,
                            entity_name=courier.get("name", ""),
                            violation_type="offline_before_shift_end",
                            details={
                                "shift_id": active_shift["id"],
                                "shift_time": f"{active_shift['start_time']} - {active_shift['end_time']}",
                                "deactivated_at": now_turkey.strftime("%H:%M"),
                                "triggered_by": "courier_deactivation"
                            }
                        )
                
                # DURUM 2: Aktif vardiyası yok ama bitmiş vardiya var → Geç mi kapattı?
                elif latest_ended_shift and latest_end_minutes > 0:
                    # Kuryenin aktif olma zamanını kontrol et
                    activated_at_str = courier.get("activated_at")
                    base_minutes = latest_end_minutes  # Varsayılan: vardiya bitiş saati
                    activated_after_shift = False  # Vardiya bittikten sonra mı aktif oldu?
                    activation_time_str = None
                    
                    if activated_at_str:
                        try:
                            activated_at = datetime.fromisoformat(activated_at_str.replace('Z', '+00:00'))
                            activated_at_turkey = activated_at.astimezone(turkey_tz)
                            activated_minutes = activated_at_turkey.hour * 60 + activated_at_turkey.minute
                            activation_time_str = activated_at_turkey.strftime("%H:%M")
                            
                            # Eğer aktif olma zamanı vardiya bitişinden sonraysa, süreyi aktivasyon zamanından hesapla
                            if activated_minutes > latest_end_minutes + tolerance:
                                base_minutes = activated_minutes
                                activated_after_shift = True
                        except Exception as e:
                            print(f"Error parsing activated_at: {e}")
                    
                    late_minutes = current_minutes - base_minutes
                    
                    # Tolerans kontrolü: Vardiya bittikten sonra aktif olanlar için tolerans YOK
                    should_log = False
                    if activated_after_shift:
                        # Vardiya dışında aktif olduysa, tolerans yok - her türlü logla
                        if late_minutes > 0:
                            should_log = True
                    else:
                        # Vardiya süresinde aktif olduysa, tolerans uygula
                        if late_minutes > tolerance:
                            should_log = True
                    
                    if should_log:
                        # Vardiya dışında aktif olduysa, aktivasyon saatini göster
                        violation_details = {
                            "shift_id": latest_ended_shift["id"],
                            "deactivated_at": now_turkey.strftime("%H:%M"),
                            "late_minutes": late_minutes,
                            "triggered_by": "courier_deactivation"
                        }
                        
                        if activated_after_shift and activation_time_str:
                            violation_details["activated_at"] = activation_time_str
                            violation_details["activated_after_shift"] = True
                        else:
                            violation_details["shift_end_time"] = latest_ended_shift["end_time"]
                            violation_details["tolerance_minutes"] = tolerance
                        
                        if admin_info:
                            violation_details["linked_courier_id"] = courier_id
                            await log_violation(
                                company_id=company_id,
                                entity_type="admin",
                                entity_id=admin_info["id"],
                                entity_name=admin_info["name"],
                                violation_type="still_active_after_shift_end",
                                details=violation_details
                            )
                        else:
                            await log_violation(
                                company_id=company_id,
                                entity_type="courier",
                                entity_id=courier_id,
                                entity_name=courier.get("name", ""),
                                violation_type="still_active_after_shift_end",
                                details=violation_details
                            )
        except Exception as e:
            print(f"Late deactivation check failed: {e}")
    
    status_labels = {"active": "Aktif", "on_break": "Molada", "offline": "Çevrimdışı"}
    return {"message": f"Kurye durumu güncellendi: {status_labels[data.availability_status]}"}


# --- Kurye Mola Limiti Ayarlama ---
class BreakLimitUpdate(BaseModel):
    daily_break_limit: int  # Dakika cinsinden


@router.put("/couriers/{courier_id}/break-limit")
async def update_courier_break_limit(courier_id: str, data: BreakLimitUpdate):
    """Kuryenin günlük mola limitini ayarla (dakika)"""
    if data.daily_break_limit < 0 or data.daily_break_limit > 480:  # Max 8 saat
        raise HTTPException(status_code=400, detail="Mola limiti 0-480 dakika arasında olmalı")
    
    result = await db.couriers.update_one(
        {"id": courier_id},
        {"$set": {"daily_break_limit": data.daily_break_limit}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")
    
    return {"message": f"Mola limiti güncellendi: {data.daily_break_limit} dakika"}


@router.get("/couriers/{courier_id}/break-status")
async def get_courier_break_status(courier_id: str):
    """Kuryenin mola durumunu ve kalan süresini al"""
    from datetime import datetime, timezone
    
    courier = await db.couriers.find_one({"id": courier_id}, {"_id": 0})
    if not courier:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")
    
    daily_break_limit = courier.get("daily_break_limit", 30)
    used_break_time = courier.get("used_break_time", 0)
    
    # Eğer şu an molada ise, geçen süreyi de ekle
    if courier.get("availability_status") == "on_break" and courier.get("break_start_time"):
        try:
            now = datetime.now(TURKEY_TZ)
            start_time = datetime.fromisoformat(courier["break_start_time"].replace('Z', '+00:00'))
            current_break_minutes = int((now - start_time).total_seconds() / 60)
            used_break_time += current_break_minutes
        except:
            pass
    
    remaining = max(0, daily_break_limit - used_break_time)
    
    return {
        "daily_break_limit": daily_break_limit,
        "used_break_time": used_break_time,
        "remaining_break_time": remaining,
        "is_on_break": courier.get("availability_status") == "on_break"
    }


# --- Courier Location Update ---
class CourierLocationUpdate(BaseModel):
    latitude: float
    longitude: float


@router.put("/couriers/{courier_id}/location")
async def update_courier_location(courier_id: str, data: CourierLocationUpdate):
    """Update courier's current location"""
    from datetime import datetime, timezone
    
    result = await db.couriers.update_one(
        {"id": courier_id},
        {"$set": {
            "current_location": {
                "latitude": data.latitude,
                "longitude": data.longitude,
                "updated_at": get_turkey_now()
            }
        }}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")
    
    return {"message": "Konum güncellendi"}


@router.get("/companies/{company_id}/couriers/with-availability")
async def get_couriers_with_availability(company_id: str):
    """Get couriers grouped by availability status"""
    # Kuryeler company_id field'ını kullanıyor (tekil veya array olabilir)
    couriers = await db.couriers.find(
        {
            "$or": [
                {"company_id": company_id},
                {"company_ids": company_id}
            ],
            "is_archived": {"$ne": True}
        },
        {"_id": 0}
    ).to_list(500)
    
    # Admin-kurye bağlantıları için admin durumlarını çek
    admin_linked_courier_ids = [c["id"] for c in couriers if c.get("is_admin_linked")]
    admin_statuses = {}
    
    if admin_linked_courier_ids:
        # Bu kuryelerle bağlantılı adminleri bul
        admins = await db.admins.find(
            {"linked_courier_id": {"$in": admin_linked_courier_ids}},
            {"_id": 0, "linked_courier_id": 1, "status": 1, "availability_status": 1}
        ).to_list(100)
        
        for admin in admins:
            # availability_status veya status alanını kontrol et
            admin_statuses[admin["linked_courier_id"]] = admin.get("availability_status") or admin.get("status", "offline")
    
    # Set default availability if not set and calculate effective status
    for c in couriers:
        if "availability_status" not in c:
            c["availability_status"] = "offline"
        
        # Admin-kurye için efektif durum hesapla
        if c.get("is_admin_linked"):
            courier_status = c.get("availability_status", "offline")
            admin_status = admin_statuses.get(c["id"], "offline")
            
            # Kurye panelinin durumuna göre kategorize et
            # Admin durumunu ayrıca sakla (frontend'de yeşil nokta göstermek için)
            c["effective_status"] = courier_status
            c["admin_status"] = admin_status
        else:
            c["effective_status"] = c.get("availability_status", "offline")
    
    # Group by courier's availability status (not effective)
    active = [c for c in couriers if c.get("availability_status") == "active"]
    on_break = [c for c in couriers if c.get("availability_status") == "on_break"]
    offline = [c for c in couriers if c.get("availability_status") not in ["active", "on_break"]]
    
    return {
        "active": active,
        "on_break": on_break,
        "offline": offline,
        "counts": {
            "active": len(active),
            "on_break": len(on_break),
            "offline": len(offline),
            "total": len(couriers)
        }
    }


# --- Push Notification Subscription ---
class PushSubscription(BaseModel):
    endpoint: str
    keys: dict


@router.post("/couriers/{courier_id}/push-subscription")
async def save_courier_push_subscription(courier_id: str, subscription: PushSubscription):
    """Save push notification subscription for courier"""
    from services.push_notification_service import save_push_subscription
    
    await save_push_subscription(courier_id, subscription.model_dump())
    return {"message": "Push subscription kaydedildi"}


@router.delete("/couriers/{courier_id}/push-subscription")
async def delete_courier_push_subscription(courier_id: str):
    """Delete push notification subscription for courier"""
    await db.push_subscriptions.delete_one({"courier_id": courier_id})
    return {"message": "Push subscription silindi"}



# --- Kurye Ücretlendirme ---
class KmRange(BaseModel):
    min_km: float
    max_km: Optional[float] = None  # None = sınırsız (10+ km gibi)
    price: float

class CourierPricingUpdate(BaseModel):
    pricing_type: str  # "per_package", "per_km" veya "tiered"
    per_package_price: Optional[float] = None
    km_ranges: Optional[List[KmRange]] = None
    tier_prices: Optional[List[float]] = None  # Kademeli fiyatlar [1., 2., 3., 4., 5. paket]
    hourly_rate: Optional[float] = None  # Saatlik ücret (opsiyonel)


@router.put("/couriers/{courier_id}/pricing")
async def update_courier_pricing(courier_id: str, data: CourierPricingUpdate):
    """Kurye ücretlendirme ayarlarını güncelle"""
    courier = await db.couriers.find_one({"id": courier_id}, {"_id": 0})
    if not courier:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")
    
    if data.pricing_type not in ["per_package", "per_km", "tiered"]:
        raise HTTPException(status_code=400, detail="Geçersiz ücretlendirme tipi")
    
    update_data = {"pricing_type": data.pricing_type}
    
    if data.pricing_type == "per_package":
        if data.per_package_price is None:
            raise HTTPException(status_code=400, detail="Paket başı fiyat gerekli")
        update_data["per_package_price"] = data.per_package_price
        update_data["km_ranges"] = None
        update_data["tier_prices"] = None
    elif data.pricing_type == "per_km":
        if not data.km_ranges or len(data.km_ranges) == 0:
            raise HTTPException(status_code=400, detail="KM aralıkları gerekli")
        update_data["km_ranges"] = [r.dict() for r in data.km_ranges]
        update_data["per_package_price"] = None
        update_data["tier_prices"] = None
    elif data.pricing_type == "tiered":
        if not data.tier_prices or len(data.tier_prices) != 5:
            raise HTTPException(status_code=400, detail="Kademeli fiyatlandırma için 5 kademe fiyatı gerekli")
        update_data["tier_prices"] = data.tier_prices
        update_data["per_package_price"] = None
        update_data["km_ranges"] = None
    
    # Saatlik ücret (opsiyonel - None ise silinir, 0 ise 0 olarak kalır)
    if data.hourly_rate is not None:
        update_data["hourly_rate"] = data.hourly_rate if data.hourly_rate > 0 else None
    
    await db.couriers.update_one(
        {"id": courier_id},
        {"$set": update_data}
    )
    
    return {"message": "Ücretlendirme güncellendi"}


@router.get("/couriers/{courier_id}/pricing")
async def get_courier_pricing(courier_id: str):
    """Kurye ücretlendirme ayarlarını getir"""
    courier = await db.couriers.find_one({"id": courier_id}, {"_id": 0, "pricing_type": 1, "per_package_price": 1, "km_ranges": 1, "hourly_rate": 1, "tier_prices": 1})
    if not courier:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")
    
    return {
        "pricing_type": courier.get("pricing_type"),
        "per_package_price": courier.get("per_package_price"),
        "km_ranges": courier.get("km_ranges"),
        "hourly_rate": courier.get("hourly_rate"),
        "tier_prices": courier.get("tier_prices")
    }



# --- Kurye Ödeme Yöntemleri ---
class PaymentMethodsUpdate(BaseModel):
    allowed_payment_methods: List[str]  # ["cash", "card", "online", "meal_card", "online_meal_card"]


@router.get("/couriers/{courier_id}/payment-methods")
async def get_courier_payment_methods(courier_id: str):
    """Kuryenin taşıyabileceği ödeme yöntemlerini getir"""
    courier = await db.couriers.find_one({"id": courier_id}, {"_id": 0, "allowed_payment_methods": 1})
    if not courier:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")
    
    # Varsayılan olarak tüm ödeme yöntemleri açık
    return {
        "allowed_payment_methods": courier.get("allowed_payment_methods", ["cash", "card", "online", "meal_card", "online_meal_card"])
    }


@router.put("/couriers/{courier_id}/payment-methods")
async def update_courier_payment_methods(courier_id: str, data: PaymentMethodsUpdate):
    """Kuryenin taşıyabileceği ödeme yöntemlerini güncelle"""
    valid_methods = ["cash", "card", "online", "meal_card", "online_meal_card"]
    for method in data.allowed_payment_methods:
        if method not in valid_methods:
            raise HTTPException(status_code=400, detail=f"Geçersiz ödeme yöntemi: {method}")
    
    result = await db.couriers.update_one(
        {"id": courier_id},
        {"$set": {"allowed_payment_methods": data.allowed_payment_methods}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")
    
    return {"message": "Ödeme yöntemleri güncellendi"}


class FCMTokenUpdate(BaseModel):
    fcm_token: str


@router.put("/couriers/{courier_id}/fcm-token")
async def update_courier_fcm_token(courier_id: str, data: FCMTokenUpdate):
    """Kuryenin FCM token'ını güncelle (push notification için)"""
    result = await db.couriers.update_one(
        {"id": courier_id},
        {"$set": {"fcm_token": data.fcm_token, "fcm_token_updated_at": get_turkey_now()}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")
    
    return {"message": "FCM token güncellendi"}


class FCMTokenRequest(BaseModel):
    fcm_token: str
    courier_id: Optional[str] = None


@router.post("/courier/fcm-token")
async def save_courier_fcm_token(data: FCMTokenRequest):
    """Native app için FCM token kaydetme endpoint'i (alternatif format)"""
    courier_id = data.courier_id
    
    if not courier_id:
        raise HTTPException(status_code=400, detail="courier_id gerekli")
    
    result = await db.couriers.update_one(
        {"id": courier_id},
        {"$set": {"fcm_token": data.fcm_token, "fcm_token_updated_at": get_turkey_now()}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")
    
    return {"success": True, "message": "FCM token kaydedildi"}



# --- Kurye Maksimum Paket Kapasitesi ---
class MaxPackagesUpdate(BaseModel):
    max_packages: int


@router.get("/couriers/{courier_id}/max-packages")
async def get_courier_max_packages(courier_id: str):
    """Kuryenin maksimum paket kapasitesini getir"""
    courier = await db.couriers.find_one(
        {"id": courier_id}, 
        {"_id": 0, "max_packages": 1}
    )
    if not courier:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")
    
    return {"max_packages": courier.get("max_packages", 5)}


@router.put("/couriers/{courier_id}/max-packages")
async def update_courier_max_packages(courier_id: str, data: MaxPackagesUpdate):
    """Kuryenin maksimum paket kapasitesini güncelle"""
    if data.max_packages < 1 or data.max_packages > 20:
        raise HTTPException(status_code=400, detail="Maksimum paket 1-20 arasında olmalı")
    
    result = await db.couriers.update_one(
        {"id": courier_id},
        {"$set": {"max_packages": data.max_packages}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")
    
    return {"message": "Maksimum paket kapasitesi güncellendi"}

