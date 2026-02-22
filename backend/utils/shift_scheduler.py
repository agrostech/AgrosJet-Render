"""
Vardiya İhlali Scheduler Yönetimi
Vardiya başlangıç saatlerine göre dinamik job yönetimi
"""
from datetime import datetime, timezone, timedelta
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from utils.database import db

# Global scheduler referansı
_scheduler: AsyncIOScheduler = None


def set_scheduler(scheduler: AsyncIOScheduler):
    """Scheduler referansını ayarla"""
    global _scheduler
    _scheduler = scheduler


def get_scheduler() -> AsyncIOScheduler:
    """Scheduler referansını al"""
    return _scheduler


async def check_shift_start_violations(start_time: str):
    """
    Belirli bir başlangıç saatindeki vardiyalar için ihlal kontrolü yap.
    """
    from routers.shift_violations import log_violation
    
    # Türkiye saati
    turkey_tz = timezone(timedelta(hours=3))
    now = datetime.now(turkey_tz)
    days_map = ["pazartesi", "sali", "carsamba", "persembe", "cuma", "cumartesi", "pazar"]
    today_key = days_map[now.weekday()]
    
    # Bu saatte başlayan tüm vardiyaları bul (tüm şirketler)
    shifts = await db.shifts.find(
        {"start_time": start_time},
        {"_id": 0, "id": 1, "company_id": 1}
    ).to_list(500)
    
    if not shifts:
        return
    
    # Şirket bazında grupla
    company_shifts = {}
    for s in shifts:
        cid = s["company_id"]
        if cid not in company_shifts:
            company_shifts[cid] = []
        company_shifts[cid].append(s["id"])
    
    # Her şirket için kontrol
    for company_id, shift_ids in company_shifts.items():
        try:
            # Bu vardiyalara atanmış kuryeler
            assignments = await db.shift_assignments.find({
                "company_id": company_id,
                "day": today_key,
                "shift_id": {"$in": shift_ids}
            }, {"_id": 0}).to_list(500)
            
            if not assignments:
                continue
            
            courier_ids = [a["courier_id"] for a in assignments]
            
            # Kuryelerin durumlarını al
            couriers = await db.couriers.find(
                {"id": {"$in": courier_ids}},
                {"_id": 0, "id": 1, "name": 1, "availability_status": 1, "is_admin_linked": 1}
            ).to_list(500)
            
            courier_map = {c["id"]: c for c in couriers}
            
            # Admin-kurye bağlantılarını al
            admin_linked_ids = [c["id"] for c in couriers if c.get("is_admin_linked")]
            admin_map = {}
            if admin_linked_ids:
                admins = await db.admins.find(
                    {"linked_courier_id": {"$in": admin_linked_ids}},
                    {"_id": 0, "id": 1, "name": 1, "linked_courier_id": 1, "is_active": 1}
                ).to_list(100)
                admin_map = {a["linked_courier_id"]: a for a in admins}
            
            for a in assignments:
                courier = courier_map.get(a["courier_id"])
                if not courier:
                    continue
                
                courier_active = courier.get("availability_status") in ["available", "active"]
                admin_info = admin_map.get(a["courier_id"])
                
                if admin_info:
                    admin_active = admin_info.get("is_active", False)
                    # İkisinden biri aktifse sorun yok
                    if admin_active or courier_active:
                        continue
                    
                    # Yönetici olarak logla
                    await log_violation(
                        company_id=company_id,
                        entity_type="admin",
                        entity_id=admin_info["id"],
                        entity_name=admin_info["name"],
                        violation_type="shift_started_not_active",
                        details={"linked_courier_id": a["courier_id"], "shift_id": a["shift_id"], "triggered_by": "shift_start"}
                    )
                else:
                    if courier_active:
                        continue
                    
                    # Kurye olarak logla
                    await log_violation(
                        company_id=company_id,
                        entity_type="courier",
                        entity_id=a["courier_id"],
                        entity_name=courier.get("name", ""),
                        violation_type="shift_started_not_active",
                        details={"shift_id": a["shift_id"], "triggered_by": "shift_start"}
                    )
        except Exception as e:
            print(f"Shift start violation check error for company {company_id}: {e}")


async def load_shift_jobs():
    """
    Mevcut vardiyaların başlangıç saatlerinden job'ları yükle.
    Server başlangıcında çağrılır.
    """
    scheduler = get_scheduler()
    if not scheduler:
        print("Scheduler not initialized")
        return
    
    # Tüm unique vardiya başlangıç saatlerini al
    shifts = await db.shifts.find({}, {"_id": 0, "start_time": 1}).to_list(1000)
    unique_times = set(s["start_time"] for s in shifts)
    
    for start_time in unique_times:
        await add_shift_job(start_time)
    
    print(f"Loaded {len(unique_times)} shift violation jobs: {sorted(unique_times)}")


async def add_shift_job(start_time: str):
    """
    Belirli bir başlangıç saati için job ekle.
    Aynı saatte job varsa ekleme.
    """
    scheduler = get_scheduler()
    if not scheduler:
        return
    
    job_id = f"shift_violation_{start_time.replace(':', '_')}"
    
    # Zaten varsa ekleme
    if scheduler.get_job(job_id):
        return
    
    try:
        hour, minute = map(int, start_time.split(":"))
        
        # Türkiye saatine göre cron job
        scheduler.add_job(
            check_shift_start_violations,
            'cron',
            hour=hour,
            minute=minute,
            timezone='Europe/Istanbul',
            args=[start_time],
            id=job_id,
            name=f"Shift Violation Check {start_time}",
            replace_existing=True
        )
        print(f"Added shift violation job for {start_time}")
    except Exception as e:
        print(f"Failed to add shift job for {start_time}: {e}")


async def remove_shift_job(start_time: str):
    """
    Belirli bir başlangıç saati için job'ı kaldır.
    Sadece o saatte başka vardiya yoksa kaldır.
    """
    scheduler = get_scheduler()
    if not scheduler:
        return
    
    # Bu saatte başka vardiya var mı kontrol et
    count = await db.shifts.count_documents({"start_time": start_time})
    if count > 0:
        return  # Başka vardiyalar var, job'ı kaldırma
    
    job_id = f"shift_violation_{start_time.replace(':', '_')}"
    
    try:
        job = scheduler.get_job(job_id)
        if job:
            scheduler.remove_job(job_id)
            print(f"Removed shift violation job for {start_time}")
    except Exception as e:
        print(f"Failed to remove shift job for {start_time}: {e}")


async def update_shift_jobs_on_change(old_start_time: str = None, new_start_time: str = None):
    """
    Vardiya değişikliğinde job'ları güncelle.
    - Vardiya eklendi: new_start_time için job ekle
    - Vardiya silindi: old_start_time için job kaldır (başka yoksa)
    - Vardiya güncellendi: old job kaldır, new job ekle
    """
    if old_start_time:
        await remove_shift_job(old_start_time)
    
    if new_start_time:
        await add_shift_job(new_start_time)
