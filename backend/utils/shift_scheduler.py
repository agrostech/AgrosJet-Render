"""
Vardiya İhlali Scheduler Yönetimi
Vardiya başlangıç saatlerine göre dinamik job yönetimi
Tolerans desteği ile birlikte
"""
from datetime import datetime, timezone, timedelta
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from utils.database import db

# Global scheduler referansı
_scheduler: AsyncIOScheduler = None

# Varsayılan tolerans süresi (dakika)
DEFAULT_TOLERANCE_MINUTES = 5


def set_scheduler(scheduler: AsyncIOScheduler):
    """Scheduler referansını ayarla"""
    global _scheduler
    _scheduler = scheduler


def get_scheduler() -> AsyncIOScheduler:
    """Scheduler referansını al"""
    return _scheduler


async def get_company_tolerance(company_id: str) -> int:
    """Şirketin tolerans süresini getir (dakika)"""
    company = await db.companies.find_one(
        {"id": company_id},
        {"_id": 0, "shift_tolerance_minutes": 1}
    )
    if company and company.get("shift_tolerance_minutes") is not None:
        return company["shift_tolerance_minutes"]
    return DEFAULT_TOLERANCE_MINUTES


async def check_shift_start_violations(start_time: str):
    """
    Belirli bir başlangıç saatindeki vardiyalar için ihlal kontrolü yap.
    Vardiyası başladı ama aktif olmayan kurye/adminleri logla.
    NOT: Bu fonksiyon tolerans süresi SONRASINDA çağrılır.
    """
    from routers.shift_violations import log_violation
    from utils.business_day import get_business_day_key
    
    # Türkiye saati
    turkey_tz = timezone(timedelta(hours=3))
    now = datetime.now(turkey_tz)
    # NOT: today_key her şirket için ayrı hesaplanacak (opening_time şirkete göre değişir)
    
    print(f"Checking shift start violations for {start_time} (tolerance check)")
    
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
            # Şirket iş günü mantığına göre günü belirle
            today_key = await get_business_day_key(company_id, now)
            
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
    Tolerans süresi eklenerek job'lar planlanır.
    """
    scheduler = get_scheduler()
    if not scheduler:
        print("Scheduler not initialized")
        return
    
    # Tüm unique vardiya başlangıç saatlerini al (şirket bazında)
    shifts = await db.shifts.find({}, {"_id": 0, "start_time": 1, "company_id": 1}).to_list(1000)
    
    # Şirket-saat kombinasyonlarını grupla
    company_start_times = {}
    for s in shifts:
        key = s["start_time"]
        if key not in company_start_times:
            company_start_times[key] = set()
        company_start_times[key].add(s["company_id"])
    
    # Her unique start_time için job ekle
    for start_time in company_start_times.keys():
        await add_shift_start_job(start_time)
    
    print(f"Loaded shift start jobs with tolerance: {sorted(company_start_times.keys())}")


async def add_shift_start_job(start_time: str):
    """
    Başlangıç saati için job ekle.
    Job, tolerans süresi SONRASINDA tetiklenir (örn: 08:00 vardiyası için 08:05'te kontrol).
    """
    scheduler = get_scheduler()
    if not scheduler:
        return
    
    job_id = f"shift_start_{start_time.replace(':', '_')}"
    
    if scheduler.get_job(job_id):
        return
    
    try:
        hour, minute = map(int, start_time.split(":"))
        
        # Tolerans süresini ekle (varsayılan 5 dakika)
        # Job tolerans sonrasında çalışır, böylece kullanıcılara giriş için süre tanınır
        tolerance_minutes = DEFAULT_TOLERANCE_MINUTES
        
        # Yeni saati hesapla
        total_minutes = hour * 60 + minute + tolerance_minutes
        job_hour = (total_minutes // 60) % 24
        job_minute = total_minutes % 60
        
        scheduler.add_job(
            check_shift_start_violations,
            'cron',
            hour=job_hour,
            minute=job_minute,
            timezone='Europe/Istanbul',
            args=[start_time],  # Orijinal vardiya saatini geç
            id=job_id,
            name=f"Shift Start Check {start_time} (+{tolerance_minutes}m tolerance)",
            replace_existing=True
        )
        print(f"Added shift start job for {start_time} (will run at {job_hour:02d}:{job_minute:02d})")
    except Exception as e:
        print(f"Failed to add shift start job for {start_time}: {e}")


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


async def update_shift_jobs_on_change(
    old_start_time: str = None, 
    new_start_time: str = None
):
    """
    Vardiya değişikliğinde job'ları güncelle.
    """
    if old_start_time:
        await remove_shift_start_job(old_start_time)
    if new_start_time:
        await add_shift_start_job(new_start_time)
