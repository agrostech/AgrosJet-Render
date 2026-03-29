"""
Otomatik Atama API Router

Panel ayarları ve manuel tetikleme endpoint'leri.
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional

from services.auto_dispatch import (
    get_dispatch_settings,
    update_dispatch_settings,
    run_dispatch_cycle,
    DEFAULT_SETTINGS,
)

from utils.jwt_utils import require_admin
router = APIRouter(prefix="/api/auto-dispatch", tags=["Auto Dispatch"], dependencies=[Depends(require_admin)])


class DispatchSettingsUpdate(BaseModel):
    enabled: bool
    distance_tolerance: int  # metre
    max_wait_time: int  # dakika
    fairness_threshold: int  # metre
    fairness_enabled: bool
    max_detour: int  # metre - Pozitif: ekstra sapma toleransı, Negatif: minimum tasarruf gereksinimi
    same_location_radius: int = 30  # metre - Aynı konum sayılacak mesafe
    same_location_max_packages: int = 10  # Aynı konumda maksimum paket
    # Açı kontrolü ayarları
    angle_check_enabled: bool = True
    angle_skip_distance: int = 1000  # metre
    max_angle_diff: int = 90  # derece
    # Detour kontrolü ayarları
    detour_check_enabled: bool = True
    detour_skip_distance: int = 500  # metre
    # Otomatik iptal ayarları
    auto_cancel_enabled: bool = False
    auto_cancel_timeout: int = 5  # dakika


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
        "max_detour": data.max_detour,
        "same_location_radius": data.same_location_radius,
        "same_location_max_packages": data.same_location_max_packages,
        "angle_check_enabled": data.angle_check_enabled,
        "angle_skip_distance": data.angle_skip_distance,
        "max_angle_diff": data.max_angle_diff,
        "detour_check_enabled": data.detour_check_enabled,
        "detour_skip_distance": data.detour_skip_distance,
        "auto_cancel_enabled": data.auto_cancel_enabled,
        "auto_cancel_timeout": data.auto_cancel_timeout,
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
