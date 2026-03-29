from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.responses import Response
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from datetime import datetime, timezone
import uuid
import httpx
import asyncio
from contextlib import asynccontextmanager
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Scheduler instance
scheduler = AsyncIOScheduler()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle manager for startup and shutdown events"""
    # Startup
    from routers.backup import run_scheduled_backups
    
    # Add backup job - runs every hour at minute 0
    scheduler.add_job(
        run_scheduled_backups,
        CronTrigger(minute=0),  # Her saatin başında
        id="scheduled_backup",
        name="Scheduled Database Backup",
        replace_existing=True
    )
    
    # Add Adisyo sync job - runs every 30 seconds
    async def sync_adisyo_orders():
        """Tüm şirketler için Adisyo siparişlerini senkronize et"""
        try:
            from services.adisyo_service import sync_all_company_orders
            
            # Adisyo bağlantısı olan şirketleri bul
            companies = await db.companies.find(
                {"is_archived": {"$ne": True}},
                {"_id": 0, "id": 1}
            ).to_list(100)
            
            for company in companies:
                try:
                    result = await sync_all_company_orders(company["id"])
                    if result["total_synced"] > 0:
                        print(f"Adisyo sync: {result['total_synced']} new orders for company {company['id']}")
                except Exception as e:
                    print(f"Adisyo sync error for company {company['id']}: {e}")
        except Exception as e:
            print(f"Adisyo sync job error: {e}")
    
    scheduler.add_job(
        sync_adisyo_orders,
        'interval',
        seconds=60,  # Her 60 saniyede bir (Adisyo rate limit)
        id="adisyo_sync",
        name="Adisyo Order Sync",
        replace_existing=True
    )
    
    # Add Trendyol sync job - runs every 30 seconds
    async def sync_trendyol_orders():
        """Tüm şirketler için Trendyol siparişlerini senkronize et"""
        try:
            from services.trendyol_service import sync_all_company_trendyol_orders
            
            # Trendyol bağlantısı olan şirketleri bul
            companies = await db.companies.find(
                {"is_archived": {"$ne": True}},
                {"_id": 0, "id": 1}
            ).to_list(100)
            
            for company in companies:
                try:
                    result = await sync_all_company_trendyol_orders(company["id"])
                    if result.get("total_synced", 0) > 0:
                        print(f"Trendyol sync: {result['total_synced']} new orders for company {company['id']}")
                except Exception as e:
                    print(f"Trendyol sync error for company {company['id']}: {e}")
        except Exception as e:
            print(f"Trendyol sync job error: {e}")
    
    scheduler.add_job(
        sync_trendyol_orders,
        'interval',
        seconds=30,  # Her 30 saniyede bir
        id="trendyol_sync",
        name="Trendyol Order Sync",
        replace_existing=True
    )
    
    # Add Getir sync job - runs every 30 seconds
    async def sync_getir_orders():
        """Tüm şirketler için Getir siparişlerini senkronize et"""
        try:
            from services.getir_service import sync_all_company_getir_orders
            
            # Getir bağlantısı olan şirketleri bul
            companies = await db.companies.find(
                {"is_archived": {"$ne": True}},
                {"_id": 0, "id": 1}
            ).to_list(100)
            
            for company in companies:
                try:
                    result = await sync_all_company_getir_orders(company["id"])
                    if result.get("total_synced", 0) > 0:
                        print(f"Getir sync: {result['total_synced']} new orders for company {company['id']}")
                except Exception as e:
                    print(f"Getir sync error for company {company['id']}: {e}")
        except Exception as e:
            print(f"Getir sync job error: {e}")
    
    scheduler.add_job(
        sync_getir_orders,
        'interval',
        seconds=30,  # Her 30 saniyede bir
        id="getir_sync",
        name="Getir Order Sync",
        replace_existing=True
    )
    
    # Add break time reset job - checks every minute if any company's closing time has passed
    async def reset_courier_break_times():
        """Şirket kapanış saatinde kurye mola sürelerini sıfırla"""
        from datetime import datetime, timezone, timedelta
        try:
            # Türkiye saatine göre şu anki zaman
            turkey_tz = timezone(timedelta(hours=3))
            now_turkey = datetime.now(turkey_tz)
            current_hour = now_turkey.hour
            current_minute = now_turkey.minute
            current_time_str = f"{current_hour:02d}:{current_minute:02d}"
            
            # Kapanış saati şu anki saate eşit olan şirketleri bul
            companies = await db.companies.find(
                {
                    "is_archived": {"$ne": True},
                    "closing_time": current_time_str
                },
                {"_id": 0, "id": 1, "name": 1, "closing_time": 1}
            ).to_list(100)
            
            for company in companies:
                # Bu şirketin tüm kuryelerinin mola sürelerini sıfırla
                result = await db.couriers.update_many(
                    {"company_id": company["id"]},
                    {"$set": {"used_break_time": 0, "break_start_time": None}}
                )
                if result.modified_count > 0:
                    print(f"Break time reset: {result.modified_count} couriers for {company['name']} at {current_time_str}")
        except Exception as e:
            print(f"Break time reset job error: {e}")
    
    scheduler.add_job(
        reset_courier_break_times,
        'interval',
        minutes=1,  # Her dakika kontrol et
        id="break_time_reset",
        name="Courier Break Time Reset",
        replace_existing=True
    )
    
    # Add weekly hakedis auto-process job - runs every minute to check if 1 hour past closing time
    async def auto_process_weekly_hakedis():
        """Haftalık hakediş otomatik işleme - bitiş saatinden 1 saat sonra"""
        from datetime import datetime, timezone, timedelta
        try:
            # Türkiye saatine göre şu anki zaman
            turkey_tz = timezone(timedelta(hours=3))
            now_turkey = datetime.now(turkey_tz)
            now_utc = datetime.now(timezone.utc)
            current_hour = now_turkey.hour
            current_minute = now_turkey.minute
            
            # Otomatik işleme aktif olan şirketleri bul
            settings = await db.weekly_hakedis_settings.find(
                {"enabled": True},
                {"_id": 0, "company_id": 1, "last_auto_run": 1}
            ).to_list(100)
            
            for setting in settings:
                company_id = setting["company_id"]
                
                # Şirket bilgilerini al
                company = await db.companies.find_one(
                    {"id": company_id},
                    {"_id": 0, "closing_time": 1, "opening_time": 1}
                )
                
                if not company:
                    continue
                
                closing_time = company.get("closing_time", "22:00")
                close_h, close_m = map(int, closing_time.split(':'))
                
                # Kapanış saatinden 1 saat sonra mı?
                target_hour = (close_h + 1) % 24
                target_minute = close_m
                
                if current_hour == target_hour and current_minute == target_minute:
                    # Bugün zaten çalıştı mı?
                    last_run = setting.get("last_auto_run")
                    if last_run:
                        last_run_dt = datetime.fromisoformat(last_run.replace('Z', '+00:00'))
                        if (now_utc - last_run_dt).total_seconds() < 3600:  # Son 1 saat içinde çalıştıysa atla
                            continue
                    
                    # Otomatik işleme yap
                    from routers.weekly_hakedis import process_auto_weekly_hakedis
                    try:
                        result = await process_auto_weekly_hakedis(company_id)
                        print(f"Auto weekly hakedis for {company_id}: {result}")
                    except Exception as e:
                        print(f"Auto weekly hakedis error for {company_id}: {e}")
        except Exception as e:
            print(f"Auto weekly hakedis job error: {e}")
    
    scheduler.add_job(
        auto_process_weekly_hakedis,
        'interval',
        minutes=1,  # Her dakika kontrol et
        id="auto_weekly_hakedis",
        name="Auto Weekly Hakedis Process",
        replace_existing=True
    )
    
    # Add auto restaurant invoice generation job - runs every Monday at 02:00
    async def auto_generate_restaurant_invoices():
        """Haftalık eksik restoran faturalarını otomatik oluştur - Her Pazartesi 02:00"""
        from datetime import datetime, timezone, timedelta
        try:
            turkey_tz = timezone(timedelta(hours=3))
            now_turkey = datetime.now(turkey_tz)
            
            # Otomatik işleme açık olan şirketleri bul
            enabled_settings = await db.restaurant_invoice_settings.find(
                {"enabled": True},
                {"_id": 0, "company_id": 1}
            ).to_list(100)
            
            if not enabled_settings:
                print("No companies with auto restaurant invoice enabled")
                return
            
            print(f"Auto restaurant invoice generation started for {len(enabled_settings)} companies")
            
            # Geçen haftanın başlangıcını hesapla (bir önceki Pazartesi)
            days_since_monday = now_turkey.weekday()
            last_monday = now_turkey - timedelta(days=7 + days_since_monday)
            last_monday = last_monday.replace(hour=9, minute=0, second=0, microsecond=0)
            week_start = last_monday.astimezone(timezone.utc).isoformat()
            
            for setting in enabled_settings:
                company_id = setting["company_id"]
                try:
                    # generate-weekly endpoint'ini çağır
                    from routers.restaurant_invoices import generate_weekly_missing_invoices
                    result = await generate_weekly_missing_invoices(company_id, week_start)
                    
                    # Son çalışma zamanını güncelle
                    await db.restaurant_invoice_settings.update_one(
                        {"company_id": company_id},
                        {"$set": {"last_auto_run": datetime.now(timezone.utc).isoformat()}}
                    )
                    
                    if result.get("count", 0) > 0:
                        print(f"Auto restaurant invoices for {company_id}: {result['count']} records created")
                except Exception as e:
                    print(f"Auto restaurant invoice error for {company_id}: {e}")
        except Exception as e:
            print(f"Auto restaurant invoice job error: {e}")
    
    scheduler.add_job(
        auto_generate_restaurant_invoices,
        CronTrigger(day_of_week='mon', hour=2, minute=0, timezone='Europe/Istanbul'),
        id="auto_restaurant_invoices",
        name="Auto Restaurant Invoice Generation (Monday 02:00)",
        replace_existing=True
    )
    
    # Otomatik Atama Job'ı (her 30 saniyede)
    async def auto_dispatch_job():
        try:
            from services.auto_dispatch import run_all_companies_dispatch
            await run_all_companies_dispatch()
        except Exception as e:
            print(f"Auto dispatch error: {e}")
    
    scheduler.add_job(
        auto_dispatch_job,
        'interval',
        seconds=5,
        id="auto_dispatch",
        name="Auto Dispatch (5s)",
        replace_existing=True
    )
    
    # Scheduler'ı shift_scheduler modülüne kaydet
    from utils.shift_scheduler import set_scheduler, load_shift_jobs
    set_scheduler(scheduler)
    
    # Mola sistemi scheduler job'ları
    async def break_queue_job():
        """Mola sırasını işle - her 30 saniyede"""
        try:
            from services.break_scheduler import process_break_queue
            await process_break_queue()
        except Exception as e:
            print(f"Break queue job error: {e}")
    
    async def break_completion_job():
        """Mola bitiş kontrolü - her 30 saniyede"""
        try:
            from services.break_scheduler import check_break_completions
            await check_break_completions()
        except Exception as e:
            print(f"Break completion job error: {e}")
    
    async def delivery_break_job():
        """Paket teslim sonrası mola kontrolü - her 15 saniyede"""
        try:
            from services.break_scheduler import check_delivery_completion_for_break
            await check_delivery_completion_for_break()
        except Exception as e:
            print(f"Delivery break job error: {e}")
    
    async def daily_break_reset_job():
        """Günlük mola kullanımını sıfırla - gece yarısı"""
        try:
            from services.break_scheduler import reset_daily_break_time
            await reset_daily_break_time()
        except Exception as e:
            print(f"Daily break reset job error: {e}")
    
    # Mola sıra işleme - her 30 saniye
    scheduler.add_job(
        break_queue_job,
        'interval',
        seconds=30,
        id="break_queue_process",
        name="Break Queue Process",
        replace_existing=True
    )
    
    # Mola bitiş kontrolü - her 30 saniye
    scheduler.add_job(
        break_completion_job,
        'interval',
        seconds=30,
        id="break_completion_check",
        name="Break Completion Check",
        replace_existing=True
    )
    
    # Paket teslim sonrası mola kontrolü - her 15 saniye
    scheduler.add_job(
        delivery_break_job,
        'interval',
        seconds=15,
        id="delivery_break_check",
        name="Delivery Break Check",
        replace_existing=True
    )
    
    # Günlük mola sıfırlama - her gün 00:00 (Türkiye saati)
    scheduler.add_job(
        daily_break_reset_job,
        'cron',
        hour=0,
        minute=0,
        timezone='Europe/Istanbul',
        id="daily_break_reset",
        name="Daily Break Time Reset",
        replace_existing=True
    )
    
    # --- MongoDB Yedekleme ---
    from services.backup_service import run_frequent_backup, run_daily_backup
    
    # 15 dakikada bir yedek (max 5 döngüsel)
    scheduler.add_job(
        run_frequent_backup,
        'interval',
        minutes=15,
        id="mongo_backup_frequent",
        name="MongoDB Backup (15dk)",
        replace_existing=True
    )
    
    # 12 saatte bir günlük yedek (max 4 döngüsel)
    scheduler.add_job(
        run_daily_backup,
        'interval',
        hours=12,
        id="mongo_backup_daily",
        name="MongoDB Backup (12 saat)",
        replace_existing=True
    )
    
    scheduler.start()
    
    # Mevcut vardiyaların job'larını yükle
    await load_shift_jobs()
    
    print("Schedulers started - backup (hourly), adisyo sync (30s), trendyol sync (30s), getir sync (30s), break system (30s), break reset (daily 00:00), weekly hakedis (1m), restaurant invoices (Monday 02:00), shift jobs (dynamic)")
    
    yield
    
    # Shutdown
    scheduler.shutdown()
    print("Schedulers stopped")

app = FastAPI(lifespan=lifespan)

# Rate Limiter
from utils.rate_limit import limiter
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

app.state.limiter = limiter

from fastapi.responses import JSONResponse

async def rate_limit_handler(request, exc):
    return JSONResponse(
        status_code=429,
        content={"detail": "Çok fazla istek gönderdiniz. Lütfen 1 dakika sonra tekrar deneyiniz."}
    )

app.add_exception_handler(RateLimitExceeded, rate_limit_handler)

api_router = APIRouter(prefix="/api")

# Health check endpoint
@api_router.get("/health")
async def health_check():
    """Health check endpoint for monitoring"""
    try:
        # Check MongoDB connection
        await db.command("ping")
        db_status = "connected"
    except Exception as e:
        db_status = f"error: {str(e)}"
    
    return {
        "status": "healthy",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "database": db_status,
        "version": "1.0.0"
    }

# Helper functions - use bcrypt from helpers
from utils.helpers import hash_password as _hash_pw, verify_password as _verify_pw

# Initialize system admin on startup
@app.on_event("startup")
async def startup_event():
    existing = await db.admins.find_one({"role": "systemadmin"})
    if not existing:
        system_admin = {
            "id": str(uuid.uuid4()),
            "name": "Sistem Yöneticisi",
            "username": "onurertas",
            "password": _hash_pw("Delivery32.."),
            "role": "systemadmin",
            "permissions": {},
            "company_id": None,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.admins.insert_one(system_admin)
        logging.info("System admin created")
    else:
        # Mevcut hash SHA-256 ise bcrypt'e yükselt
        if not existing.get("password", "").startswith("$2b$"):
            await db.admins.update_one(
                {"role": "systemadmin"},
                {"$set": {"password": _hash_pw("Delivery32..")}}
            )
            logging.info("System admin password upgraded to bcrypt")

# Include all routers
from routers.auth import router as auth_router
from routers.companies import router as companies_router
from routers.couriers import router as couriers_router
from routers.admins import router as admins_router
from routers.profile import router as profile_router
from routers.mali_bellek import router as mali_bellek_router
from routers.zimmet import router as zimmet_router
from routers.accounting import router as accounting_router
from routers.shifts import router as shifts_router
from routers.invoices import router as invoices_router
from routers.documents import router as documents_router
from routers.jetpuan import router as jetpuan_router
from routers.notifications import router as notifications_router
from routers.email_settings import router as email_router
from routers.bonus import router as bonus_router
from routers.bulk_hakedis import router as bulk_hakedis_router
from routers.academy import router as academy_router
from routers.backup import router as backup_router
from routers.daily_collections import router as daily_collections_router
from routers.daily_reports import router as daily_reports_router
from routers.business_invoices import router as business_invoices_router
from routers.system_settings import router as system_settings_router
from routers.motorcycles import router as motorcycles_router
from routers.chat import router as chat_router
from routers.restaurants import router as restaurants_router
from routers.orders import router as orders_router
from routers.finance import router as finance_router
from routers.hakedis import router as hakedis_router
from routers.weekly_hakedis import router as weekly_hakedis_router
from routers.daily_mutabakat import router as daily_mutabakat_router
from routers.reports import router as reports_router
from routers.restaurant_users import router as restaurant_users_router
from routers.products import router as products_router, set_db as set_products_db
from routers.restaurant_permissions import router as restaurant_permissions_router
from routers.restaurant_integrations import router as restaurant_integrations_router
from routers.restoran_mutabakat import router as restoran_mutabakat_router
from routers.webhooks import router as webhooks_router
from routers.integration_stores import router as integration_stores_router
from routers.sepettakip import router as sepettakip_router
from routers.adisyo_webhook import router as adisyo_webhook_router
from routers.migros import router as migros_router
from routers.getir import router as getir_router
from routers.courier_status_logs import router as courier_status_logs_router
from routers.admin_mutabakat import router as admin_mutabakat_router
from routers.restaurant_invoices import router as restaurant_invoices_router
from routers.issued_invoices import router as issued_invoices_router
from routers.shift_violations import router as shift_violations_router
from routers.status_movements import router as status_movements_router
from routers.restaurant_groups import router as restaurant_groups_router
from routers.tiered_pricing import router as tiered_pricing_router
from routers.auto_dispatch import router as auto_dispatch_router
from routers.customers import router as customers_router
from routers.credits import router as credits_router
from routers.break_system import router as break_system_router
from routers.applications import router as applications_router, webhook_router as applications_webhook_router

# Set db for products router
set_products_db(db)

app.include_router(auth_router)
app.include_router(companies_router)
app.include_router(couriers_router)
app.include_router(admins_router)
app.include_router(profile_router)
app.include_router(mali_bellek_router)
app.include_router(zimmet_router)
app.include_router(accounting_router)
app.include_router(shifts_router)
app.include_router(invoices_router)
app.include_router(documents_router)
app.include_router(jetpuan_router)
app.include_router(notifications_router)
app.include_router(email_router)
app.include_router(bonus_router)
app.include_router(bulk_hakedis_router)
app.include_router(academy_router)
app.include_router(backup_router)
app.include_router(daily_collections_router)
app.include_router(daily_reports_router)
app.include_router(business_invoices_router)
app.include_router(system_settings_router)
app.include_router(motorcycles_router)
app.include_router(chat_router)
app.include_router(restaurants_router)
app.include_router(orders_router)
app.include_router(finance_router)
app.include_router(hakedis_router)
app.include_router(weekly_hakedis_router)
app.include_router(daily_mutabakat_router)
app.include_router(restoran_mutabakat_router)
app.include_router(admin_mutabakat_router)
app.include_router(restaurant_invoices_router)
app.include_router(issued_invoices_router)
from routers.restaurant_panel_invoices import router as restaurant_panel_invoices_router
app.include_router(restaurant_panel_invoices_router)
app.include_router(reports_router)
app.include_router(restaurant_users_router)
app.include_router(products_router)
app.include_router(restaurant_permissions_router)
app.include_router(restaurant_integrations_router)
app.include_router(webhooks_router)
app.include_router(integration_stores_router)
app.include_router(sepettakip_router)
app.include_router(adisyo_webhook_router)
app.include_router(migros_router)
app.include_router(getir_router)
app.include_router(courier_status_logs_router)
app.include_router(shift_violations_router)
app.include_router(status_movements_router)
app.include_router(restaurant_groups_router)
app.include_router(tiered_pricing_router)
app.include_router(auto_dispatch_router)
app.include_router(customers_router)
app.include_router(credits_router)
app.include_router(break_system_router)
app.include_router(applications_router)
app.include_router(applications_webhook_router)

# Health check
@api_router.get("/")
async def root():
    return {"message": "Kurye Yönetim Sistemi API"}

# Image proxy for PDF logo (to avoid CORS issues)
@api_router.get("/proxy-image")
async def proxy_image(url: str):
    """Proxy external images to avoid CORS issues in PDF generation"""
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": url
        }
        async with httpx.AsyncClient() as client:
            response = await client.get(url, timeout=10.0, headers=headers, follow_redirects=True)
            response.raise_for_status()
            content_type = response.headers.get('content-type', 'image/png')
            return Response(content=response.content, media_type=content_type)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Görsel yüklenemedi: {str(e)}")

app.include_router(api_router)

cors_origins = os.environ.get('CORS_ORIGINS', '').split(',')
cors_origins = [o.strip() for o in cors_origins if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=cors_origins,
    allow_origin_regex=r"https://.*\.preview\.emergentagent\.com",
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
