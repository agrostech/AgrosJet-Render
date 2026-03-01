"""
Otomatik Atama API Router

Panel ayarları ve manuel tetikleme endpoint'leri.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from services.auto_dispatch import (
    get_dispatch_settings,
    update_dispatch_settings,
    run_dispatch_cycle,
    DEFAULT_SETTINGS,
)

router = APIRouter(prefix="/api/auto-dispatch", tags=["Auto Dispatch"])


class DispatchSettingsUpdate(BaseModel):
    enabled: bool
    distance_tolerance: int  # metre
    max_wait_time: int  # dakika
    fairness_threshold: int  # metre
    fairness_enabled: bool


@router.get("/settings/{company_id}")
async def get_settings(company_id: str):
    """Şirketin otomatik atama ayarlarını getir"""
    settings = await get_dispatch_settings(company_id)
    return settings


@router.put("/settings/{company_id}")
async def update_settings(company_id: str, data: DispatchSettingsUpdate):
    """Şirketin otomatik atama ayarlarını güncelle"""
    settings = {
        "enabled": data.enabled,
        "distance_tolerance": data.distance_tolerance,
        "max_wait_time": data.max_wait_time,
        "fairness_threshold": data.fairness_threshold,
        "fairness_enabled": data.fairness_enabled,
    }
    
    result = await update_dispatch_settings(company_id, settings)
    
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error"))
    
    return {"message": result.get("message")}


@router.post("/run/{company_id}")
async def manual_dispatch_run(company_id: str):
    """Manuel olarak dispatch döngüsünü çalıştır (test amaçlı)"""
    try:
        stats = await run_dispatch_cycle(company_id)
        return {"success": True, "stats": stats}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/defaults")
async def get_default_settings():
    """Varsayılan ayarları getir"""
    return DEFAULT_SETTINGS
