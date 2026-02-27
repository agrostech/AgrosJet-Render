from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict
from typing import List, Optional, Dict
from datetime import datetime, timezone, timedelta
import uuid

from utils.database import db
from utils.helpers import hash_password, format_name

router = APIRouter(prefix="/api", tags=["Admins"])


# --- Default Permissions ---
def get_default_permissions() -> Dict[str, bool]:
    """Yeni admin için varsayılan izinler"""
    return {
        "vardiya": True,
        "muhasebe": True,
        "zimmet": True,
        "kuryeler": True,
        "market": True,
        "akademi": True,
        "sistem": False,  # Varsayılan kapalı
    }


def get_full_permissions() -> Dict[str, bool]:
    """Superadmin için tüm izinler"""
    return {
        "vardiya": True,
        "muhasebe": True,
        "zimmet": True,
        "kuryeler": True,
        "market": True,
        "akademi": True,
        "sistem": True,
    }


# --- Pydantic Models ---
class AdminCreate(BaseModel):
    name: str
    username: str
    password: str
    company_id: Optional[str] = None
    company_ids: Optional[List[str]] = None
    role: Optional[str] = "admin"


class SuperAdminCreate(BaseModel):
    name: str
    username: str
    password: str
    company_id: str
    email: Optional[str] = None


class AdminUpdate(BaseModel):
    name: Optional[str] = None
    password: Optional[str] = None
    email: Optional[str] = None
    linked_courier_id: Optional[str] = None
    hourly_rate: Optional[float] = None


class PermissionsUpdate(BaseModel):
    permissions: Dict[str, bool]


class AdminResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    username: str
    role: str
    permissions: Optional[Dict[str, bool]] = None
    company_id: Optional[str] = None
    company_ids: Optional[List[str]] = None
    email: Optional[str] = None
    linked_courier_id: Optional[str] = None
    hourly_rate: Optional[float] = None
    availability_status: Optional[str] = None
    last_active_at: Optional[str] = None
    created_at: str


# --- Admin Management ---
@router.get("/admins/all", response_model=List[AdminResponse])
async def get_all_admins():
    """Tüm adminleri getir (systemadmin hariç) - Sistem paneli için"""
    admins = await db.admins.find(
        {"role": {"$ne": "systemadmin"}}, 
        {"_id": 0, "password": 0}
    ).to_list(500)
    
    # Simple permission keys
    simple_keys = {"vardiya", "muhasebe", "zimmet", "kuryeler", "market", "akademi", "sistem"}
    
    # Normalize permissions to simple format
    for admin in admins:
        db_permissions = admin.get("permissions", {})
        has_simple_format = any(key in db_permissions for key in simple_keys)
        
        if has_simple_format:
            admin["permissions"] = {k: db_permissions.get(k, False) for k in simple_keys}
        else:
            if admin.get("role") == "superadmin":
                admin["permissions"] = get_full_permissions()
            else:
                admin["permissions"] = get_default_permissions()
    
    return admins


@router.get("/admins", response_model=List[AdminResponse])
async def get_admins(company_id: Optional[str] = None):
    if company_id:
        query = {"company_id": company_id}
    else:
        query = {"role": {"$ne": "systemadmin"}}
    admins = await db.admins.find(query, {"_id": 0, "password": 0}).to_list(100)
    
    # Simple permission keys
    simple_keys = {"vardiya", "muhasebe", "zimmet", "kuryeler", "market", "akademi", "sistem"}
    
    # Normalize permissions to simple format
    for admin in admins:
        db_permissions = admin.get("permissions", {})
        has_simple_format = any(key in db_permissions for key in simple_keys)
        
        if has_simple_format:
            # Extract only simple keys
            admin["permissions"] = {k: db_permissions.get(k, False) for k in simple_keys}
        else:
            # No simple format, assign defaults
            if admin.get("role") == "superadmin":
                admin["permissions"] = get_full_permissions()
            else:
                admin["permissions"] = get_default_permissions()
    
    return admins


@router.post("/admins")
async def create_admin(data: AdminCreate):
    existing = await db.admins.find_one({"username": data.username})
    if existing:
        raise HTTPException(status_code=400, detail="Bu kullanıcı adı zaten kullanılıyor")
    
    # Handle company_ids
    company_ids = data.company_ids or []
    if data.company_id and data.company_id not in company_ids:
        company_ids.insert(0, data.company_id)
    
    primary_company_id = company_ids[0] if company_ids else None
    
    # Determine role and permissions
    role = data.role if data.role in ["admin", "superadmin"] else "admin"
    permissions = get_full_permissions() if role == "superadmin" else get_default_permissions()
    
    admin = {
        "id": str(uuid.uuid4()),
        "name": format_name(data.name),
        "username": data.username,
        "password": hash_password(data.password),
        "role": role,
        "permissions": permissions,
        "company_id": primary_company_id,
        "company_ids": company_ids,
        "created_at": get_turkey_now()
    }
    await db.admins.insert_one(admin)
    return {"message": "Yönetici oluşturuldu", "id": admin["id"]}


@router.post("/admins/superadmin")
async def create_superadmin(data: SuperAdminCreate):
    existing_super = await db.admins.find_one({"company_id": data.company_id, "role": "superadmin"})
    if existing_super:
        raise HTTPException(status_code=400, detail="Bu şirketin zaten bir süper admini var")
    
    existing = await db.admins.find_one({"username": data.username})
    if existing:
        raise HTTPException(status_code=400, detail="Bu kullanıcı adı zaten kullanılıyor")
    
    admin = {
        "id": str(uuid.uuid4()),
        "name": format_name(data.name),
        "username": data.username,
        "password": hash_password(data.password),
        "role": "superadmin",
        "permissions": get_full_permissions(),
        "company_id": data.company_id,
        "email": data.email,
        "created_at": get_turkey_now()
    }
    await db.admins.insert_one(admin)
    return {"message": "Süper admin oluşturuldu", "id": admin["id"]}


@router.put("/admins/{admin_id}/permissions")
async def update_admin_permissions(admin_id: str, data: PermissionsUpdate):
    """Admin izinlerini güncelle"""
    admin = await db.admins.find_one({"id": admin_id})
    if not admin:
        raise HTTPException(status_code=404, detail="Yönetici bulunamadı")
    if admin["role"] != "admin":
        raise HTTPException(status_code=400, detail="Sadece admin izinleri güncellenebilir")
    
    # Sadece geçerli izin anahtarlarını kabul et
    valid_keys = {"vardiya", "muhasebe", "zimmet", "kuryeler", "market", "akademi", "sistem"}
    filtered_permissions = {k: v for k, v in data.permissions.items() if k in valid_keys}
    
    # İzin güncellendiğinde timestamp kaydet (otomatik çıkış için)
    await db.admins.update_one(
        {"id": admin_id},
        {"$set": {
            "permissions": filtered_permissions,
            "permissions_updated_at": get_turkey_now()
        }}
    )
    return {"message": "İzinler güncellendi"}


@router.delete("/admins/{admin_id}")
async def delete_admin(admin_id: str):
    admin = await db.admins.find_one({"id": admin_id})
    if not admin:
        raise HTTPException(status_code=404, detail="Yönetici bulunamadı")
    if admin["role"] == "systemadmin":
        raise HTTPException(status_code=403, detail="Sistem yöneticisi silinemez")
    await db.admins.delete_one({"id": admin_id})
    return {"message": "Yönetici silindi"}


@router.put("/admins/{admin_id}")
async def update_admin(admin_id: str, data: AdminUpdate):
    admin = await db.admins.find_one({"id": admin_id})
    if not admin:
        raise HTTPException(status_code=404, detail="Yönetici bulunamadı")
    if admin["role"] == "systemadmin":
        raise HTTPException(status_code=403, detail="Sistem yöneticisi düzenlenemez")
    
    update_data = {}
    if data.name:
        update_data["name"] = format_name(data.name)
    if data.password:
        update_data["password"] = hash_password(data.password)
    if data.email is not None:
        update_data["email"] = data.email
    if data.hourly_rate is not None:
        update_data["hourly_rate"] = data.hourly_rate
    
    # Kurye bağlantısı
    if data.linked_courier_id is not None:
        if data.linked_courier_id == "":
            # Bağlantıyı kaldır
            old_courier_id = admin.get("linked_courier_id")
            if old_courier_id:
                await db.couriers.update_one(
                    {"id": old_courier_id},
                    {"$unset": {"is_admin_linked": "", "linked_admin_id": ""}}
                )
            update_data["linked_courier_id"] = None
        else:
            # Yeni bağlantı
            courier = await db.couriers.find_one({"id": data.linked_courier_id})
            if not courier:
                raise HTTPException(status_code=404, detail="Kurye bulunamadı")
            
            # Eski bağlantıyı kaldır
            old_courier_id = admin.get("linked_courier_id")
            if old_courier_id and old_courier_id != data.linked_courier_id:
                await db.couriers.update_one(
                    {"id": old_courier_id},
                    {"$unset": {"is_admin_linked": "", "linked_admin_id": ""}}
                )
            
            # Yeni kuryeyi işaretle
            await db.couriers.update_one(
                {"id": data.linked_courier_id},
                {"$set": {"is_admin_linked": True, "linked_admin_id": admin_id}}
            )
            update_data["linked_courier_id"] = data.linked_courier_id
    
    if not update_data:
        raise HTTPException(status_code=400, detail="Güncellenecek veri yok")
    
    await db.admins.update_one({"id": admin_id}, {"$set": update_data})
    
    return {"message": "Yönetici güncellendi", "password_changed": bool(data.password)}


# --- Admin Aktiflik Yönetimi ---
@router.post("/admins/{admin_id}/toggle-status")
async def toggle_admin_status(admin_id: str):
    """
    Admin aktif/pasif durumunu değiştir.
    Admin aktif olursa bağlı kurye pasif olur ve vice versa.
    """
    admin = await db.admins.find_one({"id": admin_id}, {"_id": 0})
    if not admin:
        raise HTTPException(status_code=404, detail="Yönetici bulunamadı")
    
    current_status = admin.get("availability_status", "offline")
    new_status = "offline" if current_status == "active" else "active"
    now = datetime.now(TURKEY_TZ)
    
    company_id = admin.get("company_id")
    linked_courier_id = admin.get("linked_courier_id")
    
    # Admin aktif OLUYORSA
    if new_status == "active":
        # Admin'i aktif yap
        await db.admins.update_one(
            {"id": admin_id},
            {"$set": {
                "availability_status": "active",
                "last_active_at": now.isoformat()
            }}
        )
        
        # Bağlı kurye varsa pasif yap
        if linked_courier_id:
            courier = await db.couriers.find_one({"id": linked_courier_id}, {"_id": 0, "availability_status": 1, "last_active_at": 1})
            if courier and courier.get("availability_status") == "active":
                # Kuryenin aktiflik süresini kaydet
                await _save_courier_active_time(linked_courier_id, courier.get("last_active_at"), company_id)
                
                # Kurye pasif yap
                await db.couriers.update_one(
                    {"id": linked_courier_id},
                    {"$set": {"availability_status": "offline"}, "$unset": {"last_active_at": ""}}
                )
                
                # Kurye log
                await db.courier_status_logs.insert_one({
                    "id": str(uuid.uuid4()),
                    "courier_id": linked_courier_id,
                    "company_id": company_id,
                    "status": "offline",
                    "changed_by": "admin_toggle",
                    "changed_by_name": admin.get("name"),
                    "timestamp": now.isoformat(),
                    "date": now.strftime("%Y-%m-%d")
                })
    
    # Admin pasif OLUYORSA
    else:
        # Admin'in aktiflik süresini kaydet
        await _save_admin_active_time(admin_id, admin.get("last_active_at"), company_id, linked_courier_id)
        
        # Admin'i pasif yap
        await db.admins.update_one(
            {"id": admin_id},
            {"$set": {"availability_status": "offline"}, "$unset": {"last_active_at": ""}}
        )
    
    # Admin durum logu
    await db.admin_status_logs.insert_one({
        "id": str(uuid.uuid4()),
        "admin_id": admin_id,
        "company_id": company_id,
        "status": new_status,
        "timestamp": now.isoformat(),
        "date": now.strftime("%Y-%m-%d")
    })
    
    # === VARDIYA İHLALİ KONTROLÜ ===
    # Admin aktif olduğunda vardiyası var mı kontrol et
    if new_status == "active" and company_id and linked_courier_id:
        try:
            from routers.shift_violations import log_violation
            from utils.shift_scheduler import get_company_tolerance
            
            # Türkiye saati
            turkey_tz = timezone(timedelta(hours=3))
            now_turkey = datetime.now(turkey_tz)
            days_map = ["pazartesi", "sali", "carsamba", "persembe", "cuma", "cumartesi", "pazar"]
            today_key = days_map[now_turkey.weekday()]
            current_minutes = now_turkey.hour * 60 + now_turkey.minute
            
            # Bugün bu admin'in bağlı kuryesinin vardiyaları var mı?
            assignments = await db.shift_assignments.find({
                "company_id": company_id,
                "courier_id": linked_courier_id,
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
            
            if not has_valid_shift:
                await log_violation(
                    company_id=company_id,
                    entity_type="admin",
                    entity_id=admin_id,
                    entity_name=admin.get("name", ""),
                    violation_type="active_without_shift",
                    details={"linked_courier_id": linked_courier_id, "triggered_by": "admin_activation"}
                )
        except Exception as e:
            print(f"Admin shift violation check failed: {e}")
    
    # === VARDIYA KAPANIŞ KONTROLÜ ===
    # Admin pasif olduğunda:
    # 1. Şu an aktif vardiyası varsa → "Vardiya bitmeden çevrimdışı" ihlali
    # 2. Yoksa, bitmiş vardiyası varsa → "Geç kapattı" ihlali (tolerans dahilinde değilse)
    if new_status == "offline" and company_id and linked_courier_id:
        try:
            from routers.shift_violations import log_violation
            from utils.shift_scheduler import get_company_tolerance
            
            # Türkiye saati
            turkey_tz = timezone(timedelta(hours=3))
            now_turkey = datetime.now(turkey_tz)
            days_map = ["pazartesi", "sali", "carsamba", "persembe", "cuma", "cumartesi", "pazar"]
            today_key = days_map[now_turkey.weekday()]
            current_minutes = now_turkey.hour * 60 + now_turkey.minute
            
            # Tolerans süresini al
            tolerance = await get_company_tolerance(company_id)
            
            # Bugün bu admin'in bağlı kuryesinin vardiyalarını bul
            assignments = await db.shift_assignments.find({
                "company_id": company_id,
                "courier_id": linked_courier_id,
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
                            # Tolerans aralığında
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
                
                # DURUM 1: Şu an aktif vardiyası var ama çevrimdışı oluyor (tolerans dahilinde değil)
                if active_shift:
                    await log_violation(
                        company_id=company_id,
                        entity_type="admin",
                        entity_id=admin_id,
                        entity_name=admin.get("name", ""),
                        violation_type="offline_before_shift_end",
                        details={
                            "linked_courier_id": linked_courier_id,
                            "shift_id": active_shift["id"],
                            "shift_time": f"{active_shift['start_time']} - {active_shift['end_time']}",
                            "deactivated_at": now_turkey.strftime("%H:%M"),
                            "triggered_by": "admin_deactivation"
                        }
                    )
                
                # DURUM 2: Aktif vardiyası yok ama bitmiş vardiya var → Geç mi kapattı?
                elif latest_ended_shift and latest_end_minutes > 0:
                    # Admin'in aktif olma zamanını kontrol et
                    last_active_at_str = admin.get("last_active_at")
                    base_minutes = latest_end_minutes  # Varsayılan: vardiya bitiş saati
                    activated_after_shift = False  # Vardiya bittikten sonra mı aktif oldu?
                    activation_time_str = None
                    
                    if last_active_at_str:
                        try:
                            activated_at = datetime.fromisoformat(last_active_at_str.replace('Z', '+00:00'))
                            activated_at_turkey = activated_at.astimezone(turkey_tz)
                            activated_minutes = activated_at_turkey.hour * 60 + activated_at_turkey.minute
                            activation_time_str = activated_at_turkey.strftime("%H:%M")
                            
                            # Eğer aktif olma zamanı vardiya bitişinden sonraysa, süreyi aktivasyon zamanından hesapla
                            if activated_minutes > latest_end_minutes + tolerance:
                                base_minutes = activated_minutes
                                activated_after_shift = True
                        except Exception as e:
                            print(f"Error parsing last_active_at: {e}")
                    
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
                            "linked_courier_id": linked_courier_id,
                            "shift_id": latest_ended_shift["id"],
                            "deactivated_at": now_turkey.strftime("%H:%M"),
                            "late_minutes": late_minutes,
                            "triggered_by": "admin_deactivation"
                        }
                        
                        if activated_after_shift and activation_time_str:
                            violation_details["activated_at"] = activation_time_str
                            violation_details["activated_after_shift"] = True
                        else:
                            violation_details["shift_end_time"] = latest_ended_shift["end_time"]
                            violation_details["tolerance_minutes"] = tolerance
                        
                        await log_violation(
                            company_id=company_id,
                            entity_type="admin",
                            entity_id=admin_id,
                            entity_name=admin.get("name", ""),
                            violation_type="still_active_after_shift_end",
                            details=violation_details
                        )
        except Exception as e:
            print(f"Admin late deactivation check failed: {e}")
    
    return {
        "message": f"Durum değiştirildi: {new_status}",
        "new_status": new_status
    }


async def _save_admin_active_time(admin_id: str, last_active_at: str, company_id: str, linked_courier_id: str = None):
    """Admin aktiflik süresini kaydet (bağlı kurye'nin daily_active tablosuna)"""
    if not last_active_at:
        return
    
    try:
        now = datetime.now(TURKEY_TZ)
        last_active = datetime.fromisoformat(last_active_at.replace('Z', '+00:00'))
        active_minutes = int((now - last_active).total_seconds() / 60)
        
        if active_minutes > 0 and linked_courier_id:
            # Bağlı kurye'nin daily_active tablosuna kaydet
            today = now.strftime("%Y-%m-%d")
            await db.courier_daily_active.update_one(
                {"courier_id": linked_courier_id, "date": today},
                {
                    "$inc": {"active_minutes": active_minutes},
                    "$setOnInsert": {
                        "courier_id": linked_courier_id,
                        "date": today,
                        "company_id": company_id
                    }
                },
                upsert=True
            )
    except (ValueError, TypeError):
        pass


async def _save_courier_active_time(courier_id: str, last_active_at: str, company_id: str):
    """Kurye aktiflik süresini kaydet"""
    if not last_active_at:
        return
    
    try:
        now = datetime.now(TURKEY_TZ)
        last_active = datetime.fromisoformat(last_active_at.replace('Z', '+00:00'))
        active_minutes = int((now - last_active).total_seconds() / 60)
        
        if active_minutes > 0:
            today = now.strftime("%Y-%m-%d")
            await db.courier_daily_active.update_one(
                {"courier_id": courier_id, "date": today},
                {
                    "$inc": {"active_minutes": active_minutes},
                    "$setOnInsert": {
                        "courier_id": courier_id,
                        "date": today,
                        "company_id": company_id
                    }
                },
                upsert=True
            )
    except (ValueError, TypeError):
        pass


@router.get("/admins/{admin_id}/status")
async def get_admin_status(admin_id: str):
    """Admin'in aktiflik durumunu getir"""
    admin = await db.admins.find_one(
        {"id": admin_id}, 
        {"_id": 0, "availability_status": 1, "last_active_at": 1, "linked_courier_id": 1}
    )
    if not admin:
        raise HTTPException(status_code=404, detail="Yönetici bulunamadı")
    
    # Bağlı kuryenin durumunu da getir
    linked_courier_status = None
    if admin.get("linked_courier_id"):
        courier = await db.couriers.find_one(
            {"id": admin["linked_courier_id"]},
            {"_id": 0, "availability_status": 1}
        )
        if courier:
            linked_courier_status = courier.get("availability_status", "offline")
    
    return {
        "availability_status": admin.get("availability_status", "offline"),
        "last_active_at": admin.get("last_active_at"),
        "linked_courier_id": admin.get("linked_courier_id"),
        "linked_courier_status": linked_courier_status
    }


# --- Entegrasyon Logları ---
@router.get("/integration-logs")
async def get_integration_logs(
    integration: str = None,
    limit: int = 500
):
    """Entegrasyon loglarını getir (dosya + MongoDB)"""
    from services.integration_log_service import read_file_logs, get_db_logs

    # Dosyadan logları oku
    file_logs = read_file_logs(integration_filter=integration, limit=limit)
    
    # MongoDB'den logları oku
    db_logs = await get_db_logs(integration_filter=integration, limit=limit)
    
    # Birleştir: DB logları + dosya logları
    all_logs = []
    
    for log in db_logs:
        all_logs.append({
            "timestamp": log.get("timestamp", ""),
            "level": log.get("level", "INFO"),
            "message": log.get("message", ""),
            "source": "db",
            "integration": log.get("integration", ""),
        })
    
    for log in file_logs:
        all_logs.append({
            "timestamp": log.get("timestamp", ""),
            "level": log.get("level", "INFO"),
            "message": log.get("message", ""),
            "source": "file",
        })
    
    # Tarihe göre sırala
    all_logs.sort(key=lambda x: x.get("timestamp", ""))
    
    # Son N kayıt
    return {"logs": all_logs[-limit:], "total": len(all_logs)}
