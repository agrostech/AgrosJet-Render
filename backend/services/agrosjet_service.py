"""
AgrosJet External API Service
AgrosJet.com landing page ile başvuru senkronizasyonu sağlar.
"""
import httpx
import logging
from typing import Optional
from utils.database import db

logger = logging.getLogger(__name__)

AGROSJET_DEFAULT_URL = "https://agrosjet.com"


async def get_agrosjet_config():
    """Sistem ayarlarından AgrosJet yapılandırmasını çek"""
    settings = await db.system_settings.find_one(
        {"type": "agrosjet"},
        {"_id": 0}
    )
    if not settings:
        return None
    return settings


async def _make_request(method: str, path: str, **kwargs):
    """AgrosJet API'ye istek gönder"""
    config = await get_agrosjet_config()
    if not config or not config.get("api_key"):
        raise Exception("AgrosJet yapılandırması bulunamadı. Sistem Ayarları'ndan yapılandırın.")

    base_url = config.get("base_url", AGROSJET_DEFAULT_URL).rstrip("/")
    api_key = config["api_key"]

    url = f"{base_url}/api/external{path}"
    headers = {
        "X-API-Key": api_key,
        "Content-Type": "application/json"
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.request(method, url, headers=headers, **kwargs)

        if response.status_code == 401:
            raise Exception("Geçersiz API anahtarı")
        if response.status_code == 403:
            detail = ""
            try:
                detail = response.json().get("detail", "")
            except Exception:
                pass
            raise Exception(f"Erişim reddedildi: {detail}")
        if response.status_code == 404:
            raise Exception("Kaynak bulunamadı")

        response.raise_for_status()
        return response.json()


async def ping():
    """Bağlantı testi"""
    return await _make_request("GET", "/ping")


async def get_applications(app_type: str, status: Optional[str] = None, limit: int = 100, offset: int = 0):
    """Başvuruları listele"""
    params = {"limit": limit, "offset": offset}
    if status:
        params["status"] = status
    return await _make_request("GET", f"/applications/{app_type}", params=params)


async def get_application(app_type: str, app_id: str):
    """Tek başvuru detayı"""
    return await _make_request("GET", f"/applications/{app_type}/{app_id}")


async def update_application_status(app_type: str, app_id: str, status: str, note: str, admin_name: str):
    """Başvuru durumunu güncelle"""
    return await _make_request("PATCH", f"/applications/{app_type}/{app_id}/status", json={
        "status": status,
        "note": note,
        "admin_name": admin_name
    })


async def get_statuses(app_type: str):
    """Durum etiketlerini çek"""
    return await _make_request("GET", f"/statuses/{app_type}")
