"""
Başvurular Router
AgrosJet.com'dan gelen kurye, restoran ve şirket başvurularını yönetir.
"""
from fastapi import APIRouter, HTTPException, Query, Request, Depends
from pydantic import BaseModel
from typing import Optional
import logging
import uuid

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

from utils.jwt_utils import require_admin
router = APIRouter(prefix="/api/applications", tags=["Applications"], dependencies=[Depends(require_admin)])


# --- Models ---
class StatusUpdateRequest(BaseModel):
    status: str
    note: str
    admin_name: str


@router.get("/new-count")
async def get_new_applications_count(city: Optional[str] = Query(None)):
    """Yeni (new) statüsündeki kurye + restoran başvuru sayısını döndür"""
    total = 0
    for app_type in ("courier", "restaurant"):
        try:
            result = await get_applications(app_type, status="new", limit=500, offset=0)
            apps = result.get("applications", [])
            if city:
                apps = [a for a in apps if (a.get("province") or "").lower() == city.lower()]
            total += len(apps)
        except Exception:
            pass
    return {"count": total}


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
webhook_router = APIRouter(prefix="/api/webhook", tags=["Webhooks - Applications"], dependencies=[Depends(require_admin)])


async def _create_basvuru_notification(app_type: str, application: dict, message: str):
    """Başvuru bildirimi oluştur - sadece aynı şehirdeki company'lere"""
    province = application.get("province", "")
    if not province:
        return
    companies = await db.companies.find(
        {"city": {"$regex": f"^{province}$", "$options": "i"}},
        {"_id": 0, "id": 1}
    ).to_list(100)
    for comp in companies:
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()),
            "company_id": comp["id"],
            "type": "basvuru",
            "title": message,
            "message": message,
            "entity_type": "application",
            "entity_id": application.get("id"),
            "is_read": False,
            "created_at": get_turkey_now()
        })


@webhook_router.post("/applications")
async def receive_application_webhook(request: Request):
    """AgrosJet'ten gelen başvuru webhook'larını al"""
    api_key = request.headers.get("X-API-Key", "")

    config = await db.system_settings.find_one(
        {"type": "agrosjet"},
        {"_id": 0}
    )

    if not config or not config.get("api_key"):
        raise HTTPException(status_code=401, detail="AgrosJet yapılandırması bulunamadı")

    if api_key != config["api_key"]:
        raise HTTPException(status_code=401, detail="Geçersiz API anahtarı")

    try:
        body = await request.json()
    except Exception:
        # Body boş veya JSON değilse, raw body'yi logla
        raw = await request.body()
        logger.error(f"AgrosJet webhook: JSON parse hatası, raw body: {raw[:500]}")
        raise HTTPException(status_code=400, detail="Geçersiz JSON body")
    
    event = body.get("event")
    app_type = body.get("app_type")
    application = body.get("application", {})

    logger.info(f"AgrosJet webhook: event={event}, type={app_type}, id={application.get('id')}")

    if event == "test":
        return {"status": "ok", "message": "Webhook bağlantısı başarılı"}

    if event == "new_application":
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
        # Sadece kurye ve restoran için bildirim gönder
        if app_type in ("courier", "restaurant"):
            type_label = "kurye" if app_type == "courier" else "restoran"
            name = application.get("full_name") or application.get("restaurant_name") or ""
            await _create_basvuru_notification(app_type, application, f"Yeni {type_label} başvurusu: {name}")
        return {"status": "ok", "message": "Başvuru kaydedildi"}

    if event == "status_updated":
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
        # Sadece kurye ve restoran için bildirim gönder
        if app_type in ("courier", "restaurant"):
            type_label = "kurye" if app_type == "courier" else "restoran"
            name = application.get("full_name") or application.get("restaurant_name") or ""
            status_label = application.get("status_label") or application.get("status") or ""
            await _create_basvuru_notification(app_type, application, f"{type_label.capitalize()} başvurusu güncellendi: {name} → {status_label}")
        return {"status": "ok", "message": "Durum güncellendi"}

    return {"status": "ok", "message": "Bilinmeyen event tipi"}
