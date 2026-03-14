"""
Vardiya İhlalleri (Shift Violations)
Kuryeler ve yöneticiler için vardiya uyumsuzluk logları
"""
from fastapi import APIRouter, HTTPException
from datetime import datetime, timezone, timedelta
from typing import Optional, List
import uuid

from utils.database import db
from utils.helpers import get_turkey_now, ensure_turkey_timezone, TURKEY_TZ

router = APIRouter(prefix="/api", tags=["Vardiya İhlalleri"])


# ========== İhlal Türleri ==========
VIOLATION_TYPES = {
    "shift_started_not_active": "Vardiyası başladı ama aktif değil",
    "active_without_shift": "Vardiyası yok ama aktif",
    "offline_before_shift_end": "Vardiya bitmeden çevrimdışı",
    "still_active_after_shift_end": "Vardiya bitti ama çevrimdışı olmadı",
    "break_limit_exceeded": "Mola limitini aştı",
    "package_not_confirmed": "Paketi onaylamadı, paket otomatik olarak üzerinden alındı"
}


# ========== Ceza Ayarları Endpoints ==========

@router.get("/penalty-settings/{company_id}")
async def get_penalty_settings(company_id: str):
    """Şirketin ceza ayarlarını getir"""
    settings = await db.penalty_settings.find_one(
        {"company_id": company_id}, {"_id": 0}
    )
    if not settings:
        # Varsayılan ayarlar oluştur
        settings = {
            "company_id": company_id,
            "enabled": False,
            "penalties": {}
        }
    return settings


@router.put("/penalty-settings/{company_id}")
async def update_penalty_settings(company_id: str, data: dict):
    """Şirketin ceza ayarlarını güncelle"""
    update_doc = {
        "company_id": company_id,
        "enabled": data.get("enabled", False),
        "penalties": data.get("penalties", {}),
        "updated_at": get_turkey_now()
    }
    await db.penalty_settings.update_one(
        {"company_id": company_id},
        {"$set": update_doc},
        upsert=True
    )
    return {"message": "Ceza ayarları güncellendi"}


async def apply_penalty_if_needed(company_id: str, entity_type: str, entity_id: str, entity_name: str, violation_type: str, violation_id: str):
    """İhlal için ceza uygula (eğer aktifse)"""
    settings = await db.penalty_settings.find_one(
        {"company_id": company_id}, {"_id": 0}
    )
    if not settings or not settings.get("enabled"):
        return None

    penalty_config = settings.get("penalties", {}).get(violation_type)
    if not penalty_config or not penalty_config.get("enabled"):
        return None

    amount = penalty_config.get("amount", 0)
    if amount <= 0:
        return None

    # Yönetici ise bağlı courier_id'yi bul
    actual_entity_type = entity_type
    actual_entity_id = entity_id
    if entity_type == "admin":
        admin = await db.admins.find_one(
            {"id": entity_id}, {"_id": 0, "linked_courier_id": 1, "role": 1}
        )
        # Superadmin'e ceza uygulanmaz
        if admin and admin.get("role") == "super_admin":
            return None
        if admin and admin.get("linked_courier_id"):
            actual_entity_type = "courier"
            actual_entity_id = admin["linked_courier_id"]
        else:
            # Bağlı kurye yoksa ceza uygulanamaz
            return None

    # Transaction oluştur (payment_out = verilen/yeşil bakiye)
    violation_label = VIOLATION_TYPES.get(violation_type, violation_type)
    transaction = {
        "id": str(uuid.uuid4()),
        "entity_type": actual_entity_type,
        "entity_id": actual_entity_id,
        "company_id": company_id,
        "type": "payment_out",
        "amount": amount,
        "description": f"Ceza: {violation_label}",
        "is_hakedis": False,
        "created_at": get_turkey_now(),
        "penalty_violation_id": violation_id
    }
    await db.transactions.insert_one(transaction)
    transaction.pop("_id", None)

    # İhlal kaydına ceza bilgisini ekle
    await db.shift_violations.update_one(
        {"id": violation_id},
        {"$set": {
            "penalty_amount": amount,
            "penalty_transaction_id": transaction["id"]
        }}
    )

    return {"amount": amount, "transaction_id": transaction["id"]}


# ========== Models ==========

# ========== Helpers ==========

async def check_and_log_violations_internal(company_id: str):
    """
    Şirket için mevcut durumu kontrol et ve ihlalleri logla.
    Scheduler ve API endpoint tarafından kullanılır.
    """
    # Türkiye saatini kullan (UTC+3)
    turkey_tz = timezone(timedelta(hours=3))
    now = datetime.now(turkey_tz)
    current_hour = now.hour
    current_minute = now.minute
    
    # Bugünün günü (pazartesi=0, pazar=6)
    days_map = ["pazartesi", "sali", "carsamba", "persembe", "cuma", "cumartesi", "pazar"]
    today_key = days_map[now.weekday()]
    
    # Vardiyaları getir
    shifts = await db.shifts.find(
        {"company_id": company_id},
        {"_id": 0}
    ).to_list(100)
    
    # Atanmaları getir
    assignments = await db.shift_assignments.find(
        {"company_id": company_id, "day": today_key},
        {"_id": 0}
    ).to_list(500)
    
    # Kuryeleri getir
    couriers = await db.couriers.find(
        {"company_id": company_id, "is_archived": {"$ne": True}},
        {"_id": 0, "id": 1, "name": 1, "availability_status": 1, "is_admin_linked": 1}
    ).to_list(500)
    
    courier_map = {c["id"]: c for c in couriers}
    
    # Admin-kurye bağlantılarını getir
    admin_courier_map = await get_admin_couriers_map(company_id)
    
    # Şu an aktif olan vardiyaları bul
    def is_shift_active(shift):
        start_h, start_m = map(int, shift["start_time"].split(":"))
        end_h, end_m = map(int, shift["end_time"].split(":"))
        
        start_minutes = start_h * 60 + start_m
        end_minutes = end_h * 60 + end_m
        current_minutes = current_hour * 60 + current_minute
        
        # Gece geçişi
        if end_minutes <= start_minutes:
            return current_minutes >= start_minutes or current_minutes < end_minutes
        return start_minutes <= current_minutes < end_minutes
    
    active_shifts = [s for s in shifts if is_shift_active(s)]
    active_shift_ids = {s["id"] for s in active_shifts}
    
    # Aktif vardiyada olması gereken kuryeler
    couriers_should_be_active = set()
    for a in assignments:
        if a["shift_id"] in active_shift_ids:
            couriers_should_be_active.add(a["courier_id"])
    
    # Herhangi bir vardiyası olan kuryeler (bugün)
    couriers_with_any_shift = {a["courier_id"] for a in assignments}
    
    violations_logged = []
    
    # Aynı ihlali tekrar loglamamak için son 10 dakikada loglanmış ihlalleri kontrol et
    recent_cutoff = (now - timedelta(minutes=10)).isoformat()
    recent_violations = await db.shift_violations.find(
        {
            "company_id": company_id,
            "created_at": {"$gte": recent_cutoff}
        },
        {"_id": 0, "entity_id": 1, "violation_type": 1}
    ).to_list(1000)
    recent_keys = {(v["entity_id"], v["violation_type"]) for v in recent_violations}
    
    # İhlal 1: Vardiyası başladı ama aktif değil
    for courier_id in couriers_should_be_active:
        courier = courier_map.get(courier_id)
        if not courier:
            continue
        
        # Kurye aktif mi? (available veya active)
        courier_active = courier.get("availability_status") in ["available", "active"]
        
        # Admin-kurye ise hem admin hem kurye aktifliğini kontrol et
        admin_info = admin_courier_map.get(courier_id)
        
        # is_admin_linked True ama admin_info yoksa, admin bilgisini doğrudan çek
        if not admin_info and courier.get("is_admin_linked"):
            admin_doc = await db.admins.find_one(
                {"linked_courier_id": courier_id},
                {"_id": 0, "id": 1, "name": 1, "is_active": 1}
            )
            if admin_doc:
                admin_info = admin_doc
        
        if admin_info:
            # Admin panelden aktif mi kontrol et
            admin_active = admin_info.get("is_active", False)
            
            # İkisinden biri aktifse sorun yok
            if admin_active or courier_active:
                continue
            
            # Son 10 dakikada aynı ihlal loglandı mı?
            if (admin_info["id"], "shift_started_not_active") in recent_keys:
                continue
            
            # İkisi de aktif değilse ihlal logla (admin olarak)
            v = await log_violation(
                company_id=company_id,
                entity_type="admin",
                entity_id=admin_info["id"],
                entity_name=admin_info["name"],
                violation_type="shift_started_not_active",
                details={
                    "linked_courier_id": courier_id,
                    "shift_ids": list(active_shift_ids)
                }
            )
            violations_logged.append(v)
        else:
            # Normal kurye
            if not courier_active:
                # Son 10 dakikada aynı ihlal loglandı mı?
                if (courier_id, "shift_started_not_active") in recent_keys:
                    continue
                    
                v = await log_violation(
                    company_id=company_id,
                    entity_type="courier",
                    entity_id=courier_id,
                    entity_name=courier.get("name", ""),
                    violation_type="shift_started_not_active",
                    details={"shift_ids": list(active_shift_ids)}
                )
                violations_logged.append(v)
    
    # İhlal 2: Vardiyası yok ama aktif
    for courier in couriers:
        courier_id = courier["id"]
        
        # Bu kuryenin bugün vardiyası var mı?
        if courier_id in couriers_with_any_shift:
            continue
        
        # Kurye aktif mi? (available veya active)
        courier_active = courier.get("availability_status") in ["available", "active"]
        
        # Admin-kurye mi?
        admin_info = admin_courier_map.get(courier_id)
        
        # is_admin_linked True ama admin_info yoksa, admin bilgisini doğrudan çek
        if not admin_info and courier.get("is_admin_linked"):
            admin_doc = await db.admins.find_one(
                {"linked_courier_id": courier_id},
                {"_id": 0, "id": 1, "name": 1, "is_active": 1}
            )
            if admin_doc:
                admin_info = admin_doc
        
        if admin_info:
            admin_active = admin_info.get("is_active", False)
            
            if admin_active or courier_active:
                # Son 10 dakikada aynı ihlal loglandı mı?
                if (admin_info["id"], "active_without_shift") in recent_keys:
                    continue
                    
                # Vardiyası yok ama aktif - ihlal
                v = await log_violation(
                    company_id=company_id,
                    entity_type="admin",
                    entity_id=admin_info["id"],
                    entity_name=admin_info["name"],
                    violation_type="active_without_shift",
                    details={"linked_courier_id": courier_id}
                )
                violations_logged.append(v)
        else:
            # Normal kurye
            if courier_active:
                # Son 10 dakikada aynı ihlal loglandı mı?
                if (courier_id, "active_without_shift") in recent_keys:
                    continue
                    
                v = await log_violation(
                    company_id=company_id,
                    entity_type="courier",
                    entity_id=courier_id,
                    entity_name=courier.get("name", ""),
                    violation_type="active_without_shift",
                    details={}
                )
                violations_logged.append(v)
    
    return violations_logged


async def get_admin_couriers_map(company_id: str) -> dict:
    """
    Admin-kurye bağlantılarını getir.
    Returns: {courier_id: admin_info}
    """
    # admins collection'dan ara (users değil)
    admins = await db.admins.find(
        {
            "company_id": company_id,
            "linked_courier_id": {"$exists": True, "$ne": None, "$ne": ""}
        },
        {"_id": 0, "id": 1, "name": 1, "linked_courier_id": 1, "is_active": 1}
    ).to_list(500)
    
    return {a["linked_courier_id"]: a for a in admins}


async def log_violation(
    company_id: str,
    entity_type: str,  # "courier" or "admin"
    entity_id: str,
    entity_name: str,
    violation_type: str,
    details: dict = None
):
    """Yeni ihlal kaydı oluştur"""
    violation = {
        "id": str(uuid.uuid4()),
        "company_id": company_id,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "entity_name": entity_name,
        "violation_type": violation_type,
        "violation_label": VIOLATION_TYPES.get(violation_type, violation_type),
        "details": details or {},
        "created_at": get_turkey_now(),
        "resolved": False
    }
    
    await db.shift_violations.insert_one(violation)
    # MongoDB adds _id, remove it before returning
    violation.pop("_id", None)
    
    # Ceza uygula (eğer aktifse)
    penalty_result = await apply_penalty_if_needed(
        company_id, entity_type, entity_id, entity_name, violation_type, violation["id"]
    )
    if penalty_result:
        violation["penalty_amount"] = penalty_result["amount"]
        violation["penalty_transaction_id"] = penalty_result["transaction_id"]
    
    return violation


# ========== Endpoints ==========

@router.get("/shift-violations/{company_id}")
async def get_shift_violations(
    company_id: str,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    violation_type: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    limit: int = 100,
    skip: int = 0
):
    """
    Vardiya ihlallerini getir.
    Filtreler: entity_type (courier/admin), entity_id, violation_type, tarih aralığı
    """
    query = {"company_id": company_id}
    
    if entity_type:
        query["entity_type"] = entity_type
    
    if entity_id:
        query["entity_id"] = entity_id
    
    if violation_type:
        query["violation_type"] = violation_type
    
    if start_date:
        if "created_at" not in query:
            query["created_at"] = {}
        query["created_at"]["$gte"] = start_date
    
    if end_date:
        if "created_at" not in query:
            query["created_at"] = {}
        query["created_at"]["$lte"] = end_date
    
    violations = await db.shift_violations.find(
        query,
        {"_id": 0}
    ).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    total = await db.shift_violations.count_documents(query)
    
    return {
        "violations": violations,
        "total": total,
        "limit": limit,
        "skip": skip
    }


@router.get("/shift-violations/{company_id}/summary")
async def get_violations_summary(company_id: str, days: int = 7):
    """Son X gün için ihlal özeti"""
    cutoff = (datetime.now(TURKEY_TZ) - timedelta(days=days)).isoformat()
    
    pipeline = [
        {
            "$match": {
                "company_id": company_id,
                "created_at": {"$gte": cutoff}
            }
        },
        {
            "$group": {
                "_id": {
                    "entity_type": "$entity_type",
                    "violation_type": "$violation_type"
                },
                "count": {"$sum": 1}
            }
        }
    ]
    
    results = await db.shift_violations.aggregate(pipeline).to_list(100)
    
    summary = {
        "courier": {},
        "admin": {}
    }
    
    for r in results:
        entity_type = r["_id"]["entity_type"]
        violation_type = r["_id"]["violation_type"]
        if entity_type in summary:
            summary[entity_type][violation_type] = r["count"]
    
    return {
        "period_days": days,
        "summary": summary,
        "violation_types": VIOLATION_TYPES
    }


@router.get("/shift-violations/{company_id}/entities")
async def get_entities_with_violations(company_id: str, entity_type: Optional[str] = None):
    """
    İhlali olan entity'leri getir (kurye/admin filtreleme için).
    """
    query = {"company_id": company_id}
    if entity_type:
        query["entity_type"] = entity_type
    
    pipeline = [
        {"$match": query},
        {
            "$group": {
                "_id": {
                    "entity_id": "$entity_id",
                    "entity_name": "$entity_name",
                    "entity_type": "$entity_type"
                },
                "violation_count": {"$sum": 1},
                "last_violation": {"$max": "$created_at"}
            }
        },
        {"$sort": {"last_violation": -1}}
    ]
    
    results = await db.shift_violations.aggregate(pipeline).to_list(500)
    
    entities = []
    for r in results:
        entities.append({
            "entity_id": r["_id"]["entity_id"],
            "entity_name": r["_id"]["entity_name"],
            "entity_type": r["_id"]["entity_type"],
            "violation_count": r["violation_count"],
            "last_violation": r["last_violation"]
        })
    
    return entities


@router.post("/shift-violations/{company_id}/check")
async def check_and_log_violations(company_id: str):
    """
    Şirket için mevcut durumu kontrol et ve ihlalleri logla.
    Bu endpoint periyodik olarak çağrılabilir (cron) veya manuel.
    """
    violations_logged = await check_and_log_violations_internal(company_id)
    
    return {
        "message": f"{len(violations_logged)} ihlal kaydedildi",
        "violations": violations_logged
    }


@router.delete("/shift-violations/{company_id}/{violation_id}")
async def delete_violation(company_id: str, violation_id: str):
    """İhlal kaydını sil"""
    result = await db.shift_violations.delete_one({
        "id": violation_id,
        "company_id": company_id
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="İhlal kaydı bulunamadı")
    
    return {"message": "İhlal kaydı silindi"}


@router.delete("/shift-violations/{company_id}/clear-all")
async def clear_all_violations(company_id: str, entity_type: Optional[str] = None):
    """Tüm ihlal kayıtlarını temizle (opsiyonel: entity_type ile filtrele)"""
    query = {"company_id": company_id}
    if entity_type:
        query["entity_type"] = entity_type
    
    result = await db.shift_violations.delete_many(query)
    
    return {"message": f"{result.deleted_count} ihlal kaydı silindi"}
