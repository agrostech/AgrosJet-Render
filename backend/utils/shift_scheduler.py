"""
Vardiya İhlali Scheduler Yönetimi
Vardiya başlangıç ve bitiş saatlerine göre dinamik job yönetimi
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
    Vardiyası başladı ama aktif olmayan kurye/adminleri logla.
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


async def check_shift_end_violations(end_time: str):
    """
    Belirli bir bitiş saatindeki vardiyalar için ihlal kontrolü yap.
    Vardiyası bitti ama hala aktif olan kurye/adminleri logla.
    """
    from routers.shift_violations import log_violation
    
    # Türkiye saati
    turkey_tz = timezone(timedelta(hours=3))
    now = datetime.now(turkey_tz)
    days_map = ["pazartesi", "sali", "carsamba", "persembe", "cuma", "cumartesi", "pazar"]
    today_key = days_map[now.weekday()]
    
    # Bu saatte biten tüm vardiyaları bul (tüm şirketler)
    shifts = await db.shifts.find(
        {"end_time": end_time},
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
            
            # Bu kuryenin başka aktif vardiyası var mı kontrol et
            # (Birden fazla vardiyaya atanmış olabilir)
            for a in assignments:
                courier = courier_map.get(a["courier_id"])
                if not courier:
                    continue
                
                courier_active = courier.get("availability_status") in ["available", "active"]
                admin_info = admin_map.get(a["courier_id"])
                
                # Aktif değilse zaten sorun yok
                if admin_info:
                    admin_active = admin_info.get("is_active", False)
                    if not admin_active and not courier_active:
                        continue
                else:
                    if not courier_active:
                        continue
                
                # Bu kuryenin bugün başka aktif vardiyası var mı?
                # (Şu an devam eden veya daha sonra başlayacak)
                other_assignments = await db.shift_assignments.find({
                    "company_id": company_id,
                    "courier_id": a["courier_id"],
                    "day": today_key,
                    "shift_id": {"$ne": a["shift_id"]}
                }, {"_id": 0, "shift_id": 1}).to_list(10)
                
                has_other_active_shift = False
                if other_assignments:
                    other_shift_ids = [oa["shift_id"] for oa in other_assignments]
                    other_shifts = await db.shifts.find(
                        {"id": {"$in": other_shift_ids}},
                        {"_id": 0, "start_time": 1, "end_time": 1}
                    ).to_list(10)
                    
                    current_minutes = now.hour * 60 + now.minute
                    
                    for os in other_shifts:
                        os_start_h, os_start_m = map(int, os["start_time"].split(":"))
                        os_end_h, os_end_m = map(int, os["end_time"].split(":"))
                        os_start = os_start_h * 60 + os_start_m
                        os_end = os_end_h * 60 + os_end_m
                        
                        # Gece geçişi kontrolü
                        if os_end <= os_start:
                            # Gece vardiyası
                            if current_minutes >= os_start or current_minutes < os_end:
                                has_other_active_shift = True
                                break
                        else:
                            if os_start <= current_minutes < os_end:
                                has_other_active_shift = True
                                break
                
                # Başka aktif vardiyası varsa sorun yok
                if has_other_active_shift:
                    continue
                
                # İhlal logla
                if admin_info:
                    await log_violation(
                        company_id=company_id,
                        entity_type="admin",
                        entity_id=admin_info["id"],
                        entity_name=admin_info["name"],
                        violation_type="still_active_after_shift_end",
                        details={"linked_courier_id": a["courier_id"], "shift_id": a["shift_id"], "triggered_by": "shift_end"}
                    )
                else:
                    await log_violation(
                        company_id=company_id,
                        entity_type="courier",
                        entity_id=a["courier_id"],
                        entity_name=courier.get("name", ""),
                        violation_type="still_active_after_shift_end",
                        details={"shift_id": a["shift_id"], "triggered_by": "shift_end"}
                    )
        except Exception as e:
            print(f"Shift end violation check error for company {company_id}: {e}")


async def load_shift_jobs():
    """
    Mevcut vardiyaların başlangıç ve bitiş saatlerinden job'ları yükle.
    Server başlangıcında çağrılır.
    """
    scheduler = get_scheduler()
    if not scheduler:
        print("Scheduler not initialized")
        return
    
    # Tüm vardiyaları al
    shifts = await db.shifts.find({}, {"_id": 0, "start_time": 1, "end_time": 1}).to_list(1000)
    
    unique_start_times = set(s["start_time"] for s in shifts)
    unique_end_times = set(s["end_time"] for s in shifts)
    
    # Başlangıç saatleri için job'lar
    for start_time in unique_start_times:
        await add_shift_start_job(start_time)
    
    # Bitiş saatleri için job'lar
    for end_time in unique_end_times:
        await add_shift_end_job(end_time)
    
    print(f"Loaded shift violation jobs - Start times: {sorted(unique_start_times)}, End times: {sorted(unique_end_times)}")


async def add_shift_start_job(start_time: str):
    """Başlangıç saati için job ekle"""
    scheduler = get_scheduler()
    if not scheduler:
        return
    
    job_id = f"shift_start_{start_time.replace(':', '_')}"
    
    if scheduler.get_job(job_id):
        return
    
    try:
        hour, minute = map(int, start_time.split(":"))
        
        scheduler.add_job(
            check_shift_start_violations,
            'cron',
            hour=hour,
            minute=minute,
            timezone='Europe/Istanbul',
            args=[start_time],
            id=job_id,
            name=f"Shift Start Check {start_time}",
            replace_existing=True
        )
        print(f"Added shift start job for {start_time}")
    except Exception as e:
        print(f"Failed to add shift start job for {start_time}: {e}")


async def add_shift_end_job(end_time: str):
    """Bitiş saati için job ekle"""
    scheduler = get_scheduler()
    if not scheduler:
        return
    
    job_id = f"shift_end_{end_time.replace(':', '_')}"
    
    if scheduler.get_job(job_id):
        return
    
    try:
        hour, minute = map(int, end_time.split(":"))
        
        scheduler.add_job(
            check_shift_end_violations,
            'cron',
            hour=hour,
            minute=minute,
            timezone='Europe/Istanbul',
            args=[end_time],
            id=job_id,
            name=f"Shift End Check {end_time}",
            replace_existing=True
        )
        print(f"Added shift end job for {end_time}")
    except Exception as e:
        print(f"Failed to add shift end job for {end_time}: {e}")


async def remove_shift_start_job(start_time: str):
    """Başlangıç saati job'ını kaldır (o saatte başka vardiya yoksa)"""
    scheduler = get_scheduler()
    if not scheduler:
        return
    
    count = await db.shifts.count_documents({"start_time": start_time})
    if count > 0:
        return
    
    job_id = f"shift_start_{start_time.replace(':', '_')}"
    
    try:
        job = scheduler.get_job(job_id)
        if job:
            scheduler.remove_job(job_id)
            print(f"Removed shift start job for {start_time}")
    except Exception as e:
        print(f"Failed to remove shift start job for {start_time}: {e}")


async def remove_shift_end_job(end_time: str):
    """Bitiş saati job'ını kaldır (o saatte başka vardiya yoksa)"""
    scheduler = get_scheduler()
    if not scheduler:
        return
    
    count = await db.shifts.count_documents({"end_time": end_time})
    if count > 0:
        return
    
    job_id = f"shift_end_{end_time.replace(':', '_')}"
    
    try:
        job = scheduler.get_job(job_id)
        if job:
            scheduler.remove_job(job_id)
            print(f"Removed shift end job for {end_time}")
    except Exception as e:
        print(f"Failed to remove shift end job for {end_time}: {e}")


async def update_shift_jobs_on_change(
    old_start_time: str = None, 
    new_start_time: str = None,
    old_end_time: str = None,
    new_end_time: str = None
):
    """
    Vardiya değişikliğinde job'ları güncelle.
    """
    # Başlangıç saati job'ları
    if old_start_time:
        await remove_shift_start_job(old_start_time)
    if new_start_time:
        await add_shift_start_job(new_start_time)
    
    # Bitiş saati job'ları
    if old_end_time:
        await remove_shift_end_job(old_end_time)
    if new_end_time:
        await add_shift_end_job(new_end_time)
