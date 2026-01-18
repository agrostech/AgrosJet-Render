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

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
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

# Helper functions
def hash_password(password: str) -> str:
    import hashlib
    return hashlib.sha256(password.encode()).hexdigest()

# Initialize system admin on startup
@app.on_event("startup")
async def startup_event():
    existing = await db.admins.find_one({"username": "systemadmin", "role": "systemadmin"})
    if not existing:
        system_admin = {
            "id": str(uuid.uuid4()),
            "name": "Sistem Yöneticisi",
            "username": "systemadmin",
            "password": hash_password("System123!"),
            "role": "systemadmin",
            "permissions": {},
            "company_id": None,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.admins.insert_one(system_admin)
        logging.info("System admin created: systemadmin / System123!")

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

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
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
