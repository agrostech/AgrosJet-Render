from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from datetime import datetime, timezone
import uuid

from utils.database import db
from utils.helpers import get_turkey_now, ensure_turkey_timezone, TURKEY_TZ
from utils.jwt_utils import require_admin

router = APIRouter(prefix="/api/bonus", tags=["Bonus"], dependencies=[Depends(require_admin)])


class BonusRuleCreate(BaseModel):
    min_packets: int
    amount: float


class BonusRuleUpdate(BaseModel):
    min_packets: int = None
    amount: float = None


# ============ BONUS SETTINGS ============

@router.get("/settings/{company_id}")
async def get_bonus_settings(company_id: str):
    """Get all bonus rules for a company"""
    rules = await db.bonus_settings.find(
        {"company_id": company_id},
        {"_id": 0}
    ).sort("min_packets", 1).to_list(100)
    return rules


@router.post("/settings/{company_id}")
async def create_bonus_rule(company_id: str, data: BonusRuleCreate):
    """Create a new bonus rule"""
    if data.min_packets <= 0:
        raise HTTPException(status_code=400, detail="Paket sayısı 0'dan büyük olmalı")
    if data.amount <= 0:
        raise HTTPException(status_code=400, detail="Tutar 0'dan büyük olmalı")
    
    # Check if rule with same min_packets exists
    existing = await db.bonus_settings.find_one({
        "company_id": company_id,
        "min_packets": data.min_packets
    })
    if existing:
        raise HTTPException(status_code=400, detail="Bu paket sayısı için zaten bir kural var")
    
    rule = {
        "id": str(uuid.uuid4()),
        "company_id": company_id,
        "min_packets": data.min_packets,
        "amount": data.amount,
        "created_at": get_turkey_now()
    }
    await db.bonus_settings.insert_one(rule)
    return {"message": "Bonus kuralı eklendi", "id": rule["id"]}


@router.put("/settings/{rule_id}")
async def update_bonus_rule(rule_id: str, data: BonusRuleUpdate):
    """Update a bonus rule"""
    rule = await db.bonus_settings.find_one({"id": rule_id})
    if not rule:
        raise HTTPException(status_code=404, detail="Kural bulunamadı")
    
    update_data = {}
    if data.min_packets is not None:
        if data.min_packets <= 0:
            raise HTTPException(status_code=400, detail="Paket sayısı 0'dan büyük olmalı")
        update_data["min_packets"] = data.min_packets
    if data.amount is not None:
        if data.amount <= 0:
            raise HTTPException(status_code=400, detail="Tutar 0'dan büyük olmalı")
        update_data["amount"] = data.amount
    
    if update_data:
        await db.bonus_settings.update_one({"id": rule_id}, {"$set": update_data})
    return {"message": "Kural güncellendi"}


@router.delete("/settings/{rule_id}")
async def delete_bonus_rule(rule_id: str):
    """Delete a bonus rule"""
    result = await db.bonus_settings.delete_one({"id": rule_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Kural bulunamadı")
    return {"message": "Kural silindi"}


# ============ BONUS CALCULATION HELPER ============

async def calculate_bonus(company_id: str, packet_count: int) -> float:
    """Calculate bonus amount based on packet count"""
    rules = await db.bonus_settings.find(
        {"company_id": company_id},
        {"_id": 0}
    ).sort("min_packets", -1).to_list(100)  # Sort descending
    
    for rule in rules:
        if packet_count >= rule["min_packets"]:
            return rule["amount"]
    
    return 0
