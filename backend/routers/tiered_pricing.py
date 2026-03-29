"""
Kademeli Ücretlendirme API Router

Şirket genelinde kurye ücretlendirme ayarları için endpoint'ler.
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List

from services.tiered_pricing_service import (
    get_company_tiered_pricing,
    update_company_tiered_pricing
)

from utils.jwt_utils import require_admin
router = APIRouter(prefix="/api/tiered-pricing", tags=["Tiered Pricing"], dependencies=[Depends(require_admin)])


class TieredPricingUpdate(BaseModel):
    enabled: bool
    tier_prices: List[float]  # 5 elemanlı liste
    hourly_rate: Optional[float] = None


class TieredPricingResponse(BaseModel):
    enabled: bool
    tier_prices: List[float]
    hourly_rate: Optional[float] = None


@router.get("/{company_id}")
async def get_tiered_pricing(company_id: str):
    """Şirketin kademeli ücretlendirme ayarlarını getir"""
    settings = await get_company_tiered_pricing(company_id)
    
    if not settings:
        # Varsayılan değerler
        return {
            "enabled": False,
            "tier_prices": [0, 0, 0, 0, 0],
            "hourly_rate": None
        }
    
    return settings


@router.put("/{company_id}")
async def update_tiered_pricing(company_id: str, data: TieredPricingUpdate):
    """Şirketin kademeli ücretlendirme ayarlarını güncelle"""
    
    # Validasyon
    if len(data.tier_prices) != 5:
        raise HTTPException(
            status_code=400, 
            detail="Tam olarak 5 kademe fiyatı gerekli"
        )
    
    for i, price in enumerate(data.tier_prices):
        if price < 0:
            raise HTTPException(
                status_code=400,
                detail=f"{i+1}. kademe fiyatı negatif olamaz"
            )
    
    if data.hourly_rate is not None and data.hourly_rate < 0:
        raise HTTPException(
            status_code=400,
            detail="Saatlik ücret negatif olamaz"
        )
    
    result = await update_company_tiered_pricing(
        company_id=company_id,
        enabled=data.enabled,
        tier_prices=data.tier_prices,
        hourly_rate=data.hourly_rate
    )
    
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    
    return {"message": result["message"]}
