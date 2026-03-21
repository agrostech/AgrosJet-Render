"""
Başvurular Router
AgrosJet.com'dan gelen kurye, restoran ve şirket başvurularını yönetir.
"""
from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel
from typing import Optional
import logging

from utils.database import db
from utils.helpers import get_turkey_now
from services.agrosjet_service import (
    ping,
    get_applications,
    get_application,
    update_application_status,
    get_statuses
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/applications", tags=["Applications"])


# --- Models ---
class StatusUpdateRequest(BaseModel):
    status: str
    note: str
    admin_name: str


# --- Endpoints ---

@router.get("/ping")
async def test_connection():
    """AgrosJet bağlantı testi"""
    try:
        result = await ping()
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/statuses/{app_type}")
async def list_statuses(app_type: str):
    """Durum etiketlerini getir"""
    if app_type not in ("courier", "restaurant", "company"):
        raise HTTPException(status_code=400, detail="Geçersiz başvuru tipi")
    try:
        result = await get_statuses(app_type)
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{app_type}")
async def list_applications(
    app_type: str,
    status: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0)
):
    """Başvuruları listele"""
    if app_type not in ("courier", "restaurant", "company"):
        raise HTTPException(status_code=400, detail="Geçersiz başvuru tipi")
    try:
        result = await get_applications(app_type, status=status, limit=limit, offset=offset)
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{app_type}/{app_id}")
async def get_application_detail(app_type: str, app_id: str):
    """Tek başvuru detayı"""
    if app_type not in ("courier", "restaurant", "company"):
        raise HTTPException(status_code=400, detail="Geçersiz başvuru tipi")
    try:
        result = await get_application(app_type, app_id)
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/{app_type}/{app_id}/status")
async def update_status(app_type: str, app_id: str, data: StatusUpdateRequest):
    """Başvuru durumunu güncelle"""
    if app_type not in ("courier", "restaurant", "company"):
        raise HTTPException(status_code=400, detail="Geçersiz başvuru tipi")
    try:
        result = await update_application_status(
            app_type, app_id, data.status, data.note, data.admin_name
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# --- Webhook Endpoint ---
webhook_router = APIRouter(prefix="/api/webhook", tags=["Webhooks - Applications"])


@webhook_router.post("/applications")
async def receive_application_webhook(request: Request):
    """AgrosJet'ten gelen başvuru webhook'larını al"""
    # API Key doğrulama
    api_key = request.headers.get("X-API-Key", "")

    config = await db.system_settings.find_one(
        {"type": "agrosjet"},
        {"_id": 0}
    )

    if not config or not config.get("api_key"):
        raise HTTPException(status_code=401, detail="AgrosJet yapılandırması bulunamadı")

    if api_key != config["api_key"]:
        raise HTTPException(status_code=401, detail="Geçersiz API anahtarı")

    body = await request.json()
    event = body.get("event")
    app_type = body.get("app_type")
    application = body.get("application", {})

    logger.info(f"AgrosJet webhook: event={event}, type={app_type}, id={application.get('id')}")

    if event == "test":
        return {"status": "ok", "message": "Webhook bağlantısı başarılı"}

    if event == "new_application":
        # Yeni başvuruyu kaydet
        await db.agrosjet_applications.update_one(
            {"id": application.get("id")},
            {"$set": {
                **application,
                "app_type": app_type,
                "webhook_event": event,
                "received_at": get_turkey_now()
            }},
            upsert=True
        )
        return {"status": "ok", "message": "Başvuru kaydedildi"}

    if event == "status_updated":
        # Durum güncellemesini kaydet
        await db.agrosjet_applications.update_one(
            {"id": application.get("id")},
            {"$set": {
                **application,
                "app_type": app_type,
                "webhook_event": event,
                "received_at": get_turkey_now()
            }},
            upsert=True
        )
        return {"status": "ok", "message": "Durum güncellendi"}

    return {"status": "ok", "message": "Bilinmeyen event tipi"}
