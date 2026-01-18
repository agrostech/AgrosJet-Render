from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime, timezone
import uuid

from utils.database import db
from utils.helpers import hash_password, format_name

router = APIRouter(prefix="/api", tags=["Couriers"])


# --- Pydantic Models ---
class AddCourierToCompany(BaseModel):
    phone: str


class CourierUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    plate: Optional[str] = None
    address: Optional[str] = None
    password: Optional[str] = None


class CourierResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    phone: str
    address: str
    iban: str
    plate: str
    status: str
    created_at: str


# --- Helper ---
async def invalidate_user_session(user_id: str):
    """Kullanıcının oturumunu geçersiz kıl"""
    await db.invalidated_sessions.update_one(
        {"user_id": user_id},
        {"$set": {
            "user_id": user_id,
            "invalidated_at": datetime.now(timezone.utc).isoformat()
        }},
        upsert=True
    )


# --- Courier Management ---
@router.get("/couriers")
async def get_all_couriers():
    """Get all couriers in the system (for system admin)"""
    couriers = await db.couriers.find({}, {"_id": 0, "password": 0}).to_list(1000)
    return couriers


@router.get("/couriers/search")
async def search_courier(phone: str):
    """Search courier by phone number"""
    courier = await db.couriers.find_one({"phone": phone}, {"_id": 0, "password": 0})
    if not courier:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")
    return courier


@router.get("/companies/{company_id}/couriers")
async def get_company_couriers(company_id: str, include_archived: bool = False, include_inactive: bool = False):
    """Get couriers assigned to a specific company"""
    query = {"company_id": company_id}
    if not include_archived:
        query["is_archived"] = {"$ne": True}
    if not include_inactive:
        query["is_active"] = {"$ne": False}
    relations = await db.company_couriers.find(query, {"_id": 0}).to_list(1000)
    
    couriers = []
    for rel in relations:
        courier = await db.couriers.find_one({"id": rel["courier_id"]}, {"_id": 0, "password": 0})
        if courier:
            courier["company_status"] = rel["status"]
            courier["is_archived"] = rel.get("is_archived", False)
            courier["is_active"] = rel.get("is_active", True)
            # Add termination info
            courier["termination_start_date"] = rel.get("termination_start_date")
            courier["termination_end_date"] = rel.get("termination_end_date")
            if rel.get("termination_end_date"):
                from datetime import timedelta
                end_date = datetime.fromisoformat(rel["termination_end_date"].replace("Z", "+00:00"))
                now = datetime.now(timezone.utc)
                remaining = (end_date - now).days
                courier["termination_remaining_days"] = max(0, remaining)
            couriers.append(courier)
    
    return couriers


@router.get("/companies/{company_id}/couriers/inactive")
async def get_inactive_company_couriers(company_id: str):
    """Get inactive couriers assigned to a specific company"""
    query = {"company_id": company_id, "is_active": False, "is_archived": {"$ne": True}}
    relations = await db.company_couriers.find(query, {"_id": 0}).to_list(1000)
    
    couriers = []
    for rel in relations:
        courier = await db.couriers.find_one({"id": rel["courier_id"]}, {"_id": 0, "password": 0})
        if courier:
            courier["company_status"] = rel["status"]
            courier["is_archived"] = rel.get("is_archived", False)
            courier["is_active"] = rel.get("is_active", True)
            courier["deactivated_at"] = rel.get("deactivated_at")
            couriers.append(courier)
    
    return couriers


@router.post("/companies/{company_id}/couriers")
async def add_courier_to_company(company_id: str, data: AddCourierToCompany):
    """Add a courier to company by phone number"""
    company = await db.companies.find_one({"id": company_id})
    if not company:
        raise HTTPException(status_code=404, detail="Şirket bulunamadı")
    
    courier = await db.couriers.find_one({"phone": data.phone})
    if not courier:
        raise HTTPException(status_code=404, detail="Bu telefon numarasına ait kurye bulunamadı")
    
    existing = await db.company_couriers.find_one({
        "company_id": company_id,
        "courier_id": courier["id"]
    })
    if existing:
        # Eğer arşivlenmişse, arşivden çıkar
        if existing.get("is_archived"):
            await db.company_couriers.update_one(
                {"id": existing["id"]},
                {"$set": {"is_archived": False}}
            )
            return {"message": "Kurye arşivden çıkarıldı ve tekrar eklendi", "courier_name": courier["name"]}
        raise HTTPException(status_code=400, detail="Bu kurye zaten şirketinize ekli")
    
    relation = {
        "id": str(uuid.uuid4()),
        "company_id": company_id,
        "courier_id": courier["id"],
        "status": "approved",
        "is_archived": False,
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.company_couriers.insert_one(relation)
    return {"message": "Kurye şirkete eklendi", "courier_name": courier["name"]}


@router.put("/couriers/{courier_id}")
async def update_courier(courier_id: str, data: CourierUpdate):
    """Update courier info (by Super Admin)"""
    courier = await db.couriers.find_one({"id": courier_id})
    if not courier:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")
    
    update_data = {}
    if data.name:
        update_data["name"] = format_name(data.name)
    if data.phone:
        # Check phone uniqueness
        existing = await db.couriers.find_one({"phone": data.phone})
        if existing and existing["id"] != courier_id:
            raise HTTPException(status_code=400, detail="Bu telefon numarası başka bir kurye tarafından kullanılıyor")
        update_data["phone"] = data.phone
    if data.plate:
        update_data["plate"] = data.plate.upper()
    if data.address is not None:
        update_data["address"] = data.address
    if data.password:
        update_data["password"] = hash_password(data.password)
    
    if not update_data:
        raise HTTPException(status_code=400, detail="Güncellenecek veri yok")
    
    await db.couriers.update_one({"id": courier_id}, {"$set": update_data})
    
    # Şifre değiştiyse session invalidate et
    if data.password:
        await invalidate_user_session(courier_id)
    
    return {"message": "Kurye güncellendi", "password_changed": bool(data.password)}


@router.put("/companies/{company_id}/couriers/{courier_id}/archive")
async def archive_company_courier(company_id: str, courier_id: str):
    """Archive a courier from company"""
    result = await db.company_couriers.update_one(
        {"company_id": company_id, "courier_id": courier_id},
        {"$set": {"is_archived": True}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Kayıt bulunamadı")
    return {"message": "Kurye arşivlendi"}


@router.put("/companies/{company_id}/couriers/{courier_id}/deactivate")
async def deactivate_company_courier(company_id: str, courier_id: str):
    """Deactivate a courier (set to passive)"""
    result = await db.company_couriers.update_one(
        {"company_id": company_id, "courier_id": courier_id},
        {"$set": {
            "is_active": False,
            "deactivated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Kayıt bulunamadı")
    return {"message": "Kurye pasife alındı"}


@router.put("/companies/{company_id}/couriers/{courier_id}/activate")
async def activate_company_courier(company_id: str, courier_id: str):
    """Activate a courier (set to active)"""
    result = await db.company_couriers.update_one(
        {"company_id": company_id, "courier_id": courier_id},
        {"$set": {
            "is_active": True,
            "deactivated_at": None
        }}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Kayıt bulunamadı")
    return {"message": "Kurye aktife alındı"}


@router.put("/companies/{company_id}/couriers/{courier_id}/unarchive")
async def unarchive_company_courier(company_id: str, courier_id: str):
    """Unarchive a courier from company"""
    result = await db.company_couriers.update_one(
        {"company_id": company_id, "courier_id": courier_id},
        {"$set": {"is_archived": False}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Kayıt bulunamadı")
    return {"message": "Kurye arşivden çıkarıldı"}


@router.put("/companies/{company_id}/couriers/{courier_id}/approve")
async def approve_company_courier(company_id: str, courier_id: str):
    result = await db.company_couriers.update_one(
        {"company_id": company_id, "courier_id": courier_id},
        {"$set": {"status": "approved"}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Kayıt bulunamadı")
    return {"message": "Kurye onaylandı"}


@router.put("/companies/{company_id}/couriers/{courier_id}/reject")
async def reject_company_courier(company_id: str, courier_id: str):
    result = await db.company_couriers.update_one(
        {"company_id": company_id, "courier_id": courier_id},
        {"$set": {"status": "rejected"}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Kayıt bulunamadı")
    return {"message": "Kurye reddedildi"}


@router.delete("/companies/{company_id}/couriers/{courier_id}")
async def remove_courier_from_company(company_id: str, courier_id: str):
    # Zimmet kontrolü - kuryede zimmetli ürün var mı?
    assigned_products = await db.products.find({
        "company_id": company_id,
        "assigned_to_courier_id": courier_id
    }).to_list(100)
    
    if assigned_products:
        product_names = ", ".join([p["name"] for p in assigned_products[:3]])
        if len(assigned_products) > 3:
            product_names += f" ve {len(assigned_products) - 3} ürün daha"
        raise HTTPException(
            status_code=400, 
            detail=f"Bu kuryede {len(assigned_products)} zimmetli ürün var: {product_names}. Önce zimmetleri geri alın."
        )
    
    result = await db.company_couriers.delete_one({
        "company_id": company_id,
        "courier_id": courier_id
    })
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Kayıt bulunamadı")
    return {"message": "Kurye şirketten çıkarıldı"}


@router.delete("/couriers/{courier_id}")
async def delete_courier(courier_id: str):
    """Delete courier completely (system admin only)"""
    # 1. Bakiye kontrolü (öncelikli)
    all_transactions = await db.transactions.find(
        {"entity_type": "courier", "entity_id": courier_id},
        {"_id": 0, "type": 1, "amount": 1}
    ).to_list(10000)
    
    balance = 0
    for tx in all_transactions:
        if tx["type"] == "payment_out":
            balance += tx["amount"]
        else:
            balance -= tx["amount"]
    
    if balance != 0:
        balance_str = f"{abs(balance):,.2f} ₺"
        if balance > 0:
            raise HTTPException(
                status_code=400,
                detail=f"Bu kuryenin {balance_str} bakiyesi var. Önce bakiyeyi sıfırlayın."
            )
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Bu kuryeye {balance_str} borçlusunuz. Önce bakiyeyi sıfırlayın."
            )
    
    # 2. Zimmet kontrolü
    assigned_products = await db.products.find({
        "assigned_to_courier_id": courier_id
    }).to_list(100)
    
    if assigned_products:
        product_names = ", ".join([p["name"] for p in assigned_products[:3]])
        if len(assigned_products) > 3:
            product_names += f" ve {len(assigned_products) - 3} ürün daha"
        raise HTTPException(
            status_code=400, 
            detail=f"Bu kuryede {len(assigned_products)} zimmetli ürün var: {product_names}. Önce zimmetleri geri alın."
        )
    
    result = await db.couriers.delete_one({"id": courier_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")
    await db.company_couriers.delete_many({"courier_id": courier_id})
    return {"message": "Kurye silindi"}


# --- Fesih (Termination) Endpoints ---

@router.post("/companies/{company_id}/couriers/{courier_id}/start-termination")
async def start_termination(company_id: str, courier_id: str):
    """Start 15-day termination period for a courier"""
    # Check if relation exists
    relation = await db.company_couriers.find_one({
        "company_id": company_id,
        "courier_id": courier_id,
        "status": "approved"
    })
    
    if not relation:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")
    
    # Check if termination already started
    if relation.get("termination_start_date"):
        raise HTTPException(status_code=400, detail="Fesih süreci zaten başlatılmış")
    
    # Start termination from tomorrow, 15 days period
    from datetime import timedelta
    tomorrow = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
    end_date = tomorrow + timedelta(days=15)
    
    await db.company_couriers.update_one(
        {"company_id": company_id, "courier_id": courier_id},
        {"$set": {
            "termination_start_date": tomorrow.isoformat(),
            "termination_end_date": end_date.isoformat(),
            "termination_started_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {
        "message": "Fesih süreci başlatıldı",
        "start_date": tomorrow.isoformat(),
        "end_date": end_date.isoformat()
    }


@router.post("/companies/{company_id}/couriers/{courier_id}/cancel-termination")
async def cancel_termination(company_id: str, courier_id: str):
    """Cancel termination process"""
    relation = await db.company_couriers.find_one({
        "company_id": company_id,
        "courier_id": courier_id
    })
    
    if not relation:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")
    
    if not relation.get("termination_start_date"):
        raise HTTPException(status_code=400, detail="Aktif fesih süreci bulunmuyor")
    
    await db.company_couriers.update_one(
        {"company_id": company_id, "courier_id": courier_id},
        {"$unset": {
            "termination_start_date": "",
            "termination_end_date": "",
            "termination_started_at": ""
        }}
    )
    
    return {"message": "Fesih süreci iptal edildi"}


@router.get("/couriers/{courier_id}/termination-status")
async def get_termination_status(courier_id: str, company_id: str):
    """Get termination status for a courier"""
    relation = await db.company_couriers.find_one({
        "company_id": company_id,
        "courier_id": courier_id
    }, {"_id": 0})
    
    if not relation:
        return {"has_termination": False}
    
    if not relation.get("termination_start_date"):
        return {"has_termination": False}
    
    # Calculate remaining days
    from datetime import timedelta
    end_date = datetime.fromisoformat(relation["termination_end_date"].replace("Z", "+00:00"))
    now = datetime.now(timezone.utc)
    
    remaining_days = (end_date - now).days
    if remaining_days < 0:
        remaining_days = 0
    
    return {
        "has_termination": True,
        "start_date": relation["termination_start_date"],
        "end_date": relation["termination_end_date"],
        "remaining_days": remaining_days
    }

