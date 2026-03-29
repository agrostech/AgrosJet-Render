from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from datetime import datetime, timezone
import uuid

from utils.database import db
from utils.helpers import get_turkey_now, ensure_turkey_timezone, TURKEY_TZ
from utils.jwt_utils import require_admin

router = APIRouter(prefix="/api", tags=["Mali Bellek"], dependencies=[Depends(require_admin)])

class MaliBellekToggle(BaseModel):
    admin_id: str
    admin_name: str

@router.get("/companies/{company_id}/mali-bellek")
async def get_mali_bellek_status(company_id: str, year_month: str):
    """
    Belirli ay için tüm POS cihazlarının mali bellek durumunu getir.
    year_month format: "2025-12"
    """
    # Sadece POS cihazı tipindeki ürünleri getir
    pos_type = await db.product_types.find_one({"company_id": company_id, "has_pos_fields": True})
    if not pos_type:
        return {"products": [], "year_month": year_month}
    
    # POS cihazlarını getir
    products = await db.products.find(
        {"company_id": company_id, "product_type_id": pos_type["id"]},
        {"_id": 0}
    ).sort("name", 1).to_list(500)
    
    # Bu ay için mali bellek kayıtlarını getir
    records = await db.mali_bellek.find(
        {"company_id": company_id, "year_month": year_month},
        {"_id": 0}
    ).to_list(500)
    
    # Product ID -> record mapping
    record_map = {r["product_id"]: r for r in records}
    
    # Ürünlere mali bellek durumunu ekle
    result = []
    for p in products:
        record = record_map.get(p["id"])
        result.append({
            **p,
            "mali_bellek": {
                "is_collected": record["is_collected"] if record else False,
                "collected_at": record.get("collected_at") if record else None,
                "admin_name": record.get("admin_name") if record else None
            }
        })
    
    return {"products": result, "year_month": year_month}

@router.post("/mali-bellek/{product_id}/toggle")
async def toggle_mali_bellek(product_id: str, year_month: str, data: MaliBellekToggle):
    """Mali bellek durumunu değiştir (alındı/alınmadı)"""
    product = await db.products.find_one({"id": product_id})
    if not product:
        raise HTTPException(status_code=404, detail="Ürün bulunamadı")
    
    # Mevcut kaydı kontrol et
    existing = await db.mali_bellek.find_one({
        "product_id": product_id,
        "year_month": year_month
    })
    
    now = get_turkey_now()
    
    if existing:
        # Toggle durumu
        new_status = not existing["is_collected"]
        await db.mali_bellek.update_one(
            {"product_id": product_id, "year_month": year_month},
            {"$set": {
                "is_collected": new_status,
                "collected_at": now if new_status else None,
                "admin_id": data.admin_id,
                "admin_name": data.admin_name,
                "updated_at": now
            }}
        )
        action = "collected" if new_status else "uncollected"
    else:
        # Yeni kayıt oluştur (alındı olarak)
        record = {
            "id": str(uuid.uuid4()),
            "company_id": product["company_id"],
            "product_id": product_id,
            "year_month": year_month,
            "is_collected": True,
            "collected_at": now,
            "admin_id": data.admin_id,
            "admin_name": data.admin_name,
            "created_at": now,
            "updated_at": now
        }
        await db.mali_bellek.insert_one(record)
        action = "collected"
        new_status = True
    
    # Log oluştur
    log = {
        "id": str(uuid.uuid4()),
        "company_id": product["company_id"],
        "product_id": product_id,
        "product_name": product["name"],
        "pos_serial": product.get("pos_serial", ""),
        "pos_terminal": product.get("pos_terminal", ""),
        "year_month": year_month,
        "action": action,
        "admin_id": data.admin_id,
        "admin_name": data.admin_name,
        "created_at": now
    }
    await db.mali_bellek_logs.insert_one(log)
    
    return {
        "message": "Mali bellek alındı" if new_status else "Mali bellek işareti kaldırıldı",
        "is_collected": new_status,
        "collected_at": now if new_status else None
    }

@router.get("/mali-bellek/{product_id}/logs")
async def get_mali_bellek_logs(product_id: str, year_month: str = None):
    """Belirli POS için mali bellek loglarını getir"""
    query = {"product_id": product_id}
    if year_month:
        query["year_month"] = year_month
    
    logs = await db.mali_bellek_logs.find(
        query,
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    return logs

@router.get("/companies/{company_id}/mali-bellek-logs")
async def get_company_mali_bellek_logs(company_id: str, year_month: str):
    """Şirketin belirli aydaki tüm mali bellek loglarını getir"""
    logs = await db.mali_bellek_logs.find(
        {"company_id": company_id, "year_month": year_month},
        {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    
    return logs
