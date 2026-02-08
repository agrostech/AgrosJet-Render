from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel, ConfigDict
from typing import Optional

from services import courier_service
from utils.database import db

router = APIRouter(prefix="/api", tags=["Couriers"])


# --- Pydantic Models ---
class AddCourierToCompany(BaseModel):
    phone: str


class GhostCourierCreate(BaseModel):
    name: str


class MergeCouriersRequest(BaseModel):
    ghost_courier_id: str
    real_courier_id: str


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


# --- Courier Management ---
@router.get("/couriers/all")
async def get_all_couriers_system():
    """Get all couriers in the system with company info (for system admin)"""
    return await courier_service.get_all_couriers()


@router.get("/couriers")
async def get_all_couriers():
    """Get all couriers in the system (for system admin)"""
    return await courier_service.get_all_couriers()


@router.get("/couriers/{courier_id}")
async def get_courier_by_id(courier_id: str):
    """Get single courier by ID"""
    courier = await db.couriers.find_one({"id": courier_id}, {"_id": 0})
    if not courier:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")
    # Set default availability if not present
    if "availability_status" not in courier:
        courier["availability_status"] = "offline"
    return courier


@router.delete("/couriers/{courier_id}/permanent")
async def delete_courier_permanently(courier_id: str):
    """Permanently delete a courier account and all related data"""
    # Check if courier exists
    courier = await db.couriers.find_one({"id": courier_id})
    if not courier:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")
    
    # Delete courier from all companies (company_couriers)
    await db.company_couriers.delete_many({"courier_id": courier_id})
    
    # Delete courier's transactions (optional - might want to keep for records)
    # await db.transactions.delete_many({"entity_id": courier_id, "entity_type": "courier"})
    
    # Delete courier
    await db.couriers.delete_one({"id": courier_id})
    
    return {"message": "Kurye hesabı kalıcı olarak silindi"}


@router.get("/couriers/search")
async def search_courier(phone: str):
    """Search courier by phone number"""
    courier = await courier_service.search_courier_by_phone(phone)
    if not courier:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")
    return courier


@router.get("/companies/{company_id}/couriers")
async def get_company_couriers(company_id: str, include_archived: bool = False, include_inactive: bool = False):
    """Get couriers assigned to a specific company"""
    return await courier_service.get_company_couriers(company_id, include_inactive, include_archived)


@router.get("/companies/{company_id}/couriers/inactive")
async def get_inactive_company_couriers(company_id: str):
    """Get inactive couriers assigned to a specific company"""
    return await courier_service.get_inactive_company_couriers(company_id)


@router.post("/companies/{company_id}/couriers")
async def add_courier_to_company(
    company_id: str, 
    data: AddCourierToCompany
):
    """Add a courier to company by phone number"""
    result, error = await courier_service.add_courier_to_company(company_id, data.phone)
    if error:
        raise HTTPException(status_code=400 if "ekli" in error or "bulunamadı" not in error else 404, detail=error)
    return result


@router.post("/companies/{company_id}/couriers/ghost")
async def create_ghost_courier(
    company_id: str,
    data: GhostCourierCreate
):
    """Create a ghost courier (only name, no login capability) for accounting purposes"""
    result, error = await courier_service.create_ghost_courier(company_id, data.name)
    if error:
        raise HTTPException(status_code=400, detail=error)
    return result


@router.post("/couriers/merge")
async def merge_couriers(data: MergeCouriersRequest):
    """Merge a ghost courier into a real courier - transfer all transactions, invoices, etc."""
    result, error = await courier_service.merge_couriers(data.ghost_courier_id, data.real_courier_id)
    if error:
        raise HTTPException(status_code=400, detail=error)
    return result


@router.put("/couriers/{courier_id}")
async def update_courier(
    courier_id: str, 
    data: CourierUpdate
):
    """Update courier info (by Super Admin)"""
    result, error = await courier_service.update_courier(
        courier_id, 
        name=data.name, 
        phone=data.phone, 
        plate=data.plate, 
        address=data.address, 
        password=data.password
    )
    if error:
        raise HTTPException(status_code=400 if "bulunamadı" not in error else 404, detail=error)
    return result


@router.put("/companies/{company_id}/couriers/{courier_id}/deactivate")
async def deactivate_company_courier(
    company_id: str, 
    courier_id: str
):
    """Deactivate a courier (set to passive)"""
    result, error = await courier_service.deactivate_courier(company_id, courier_id)
    if error:
        raise HTTPException(status_code=400 if "bulunamadı" not in error else 404, detail=error)
    return result


@router.put("/companies/{company_id}/couriers/{courier_id}/activate")
async def activate_company_courier(
    company_id: str, 
    courier_id: str
):
    """Activate a courier (set to active)"""
    result, error = await courier_service.activate_courier(company_id, courier_id)
    if error:
        raise HTTPException(status_code=404, detail=error)
    return result


@router.delete("/companies/{company_id}/couriers/{courier_id}")
async def remove_courier_from_company(
    company_id: str, 
    courier_id: str
):
    """Remove courier from company"""
    result, error = await courier_service.remove_courier_from_company(company_id, courier_id)
    if error:
        raise HTTPException(status_code=400 if "zimmetli" in error else 404, detail=error)
    return result


@router.put("/companies/{company_id}/couriers/{courier_id}/archive")
async def archive_company_courier(
    company_id: str, 
    courier_id: str
):
    """Archive a courier (move to archive list)"""
    result, error = await courier_service.archive_courier(company_id, courier_id)
    if error:
        raise HTTPException(status_code=400 if "bulunamadı" not in error else 404, detail=error)
    return result


@router.put("/companies/{company_id}/couriers/{courier_id}/unarchive")
async def unarchive_company_courier(
    company_id: str, 
    courier_id: str
):
    """Unarchive a courier (restore from archive)"""
    result, error = await courier_service.unarchive_courier(company_id, courier_id)
    if error:
        raise HTTPException(status_code=404, detail=error)
    return result


# --- Fesih (Termination) Endpoints ---
@router.post("/companies/{company_id}/couriers/{courier_id}/start-termination")
async def start_termination(
    company_id: str, 
    courier_id: str
):
    """Start 15-day termination period for a courier"""
    result, error = await courier_service.start_termination(company_id, courier_id)
    if error:
        raise HTTPException(status_code=400 if "başlatılmış" in error else 404, detail=error)
    return result


@router.post("/companies/{company_id}/couriers/{courier_id}/cancel-termination")
async def cancel_termination(
    company_id: str, 
    courier_id: str
):
    """Cancel termination process"""
    result, error = await courier_service.cancel_termination(company_id, courier_id)
    if error:
        raise HTTPException(status_code=400 if "bulunmuyor" in error else 404, detail=error)
    return result


@router.get("/couriers/{courier_id}/termination-status")
async def get_termination_status(courier_id: str, company_id: str):
    """Get termination status for a courier"""
    return await courier_service.get_termination_status(company_id, courier_id)



# --- Kurye Availability Status (Aktif/Molada/Çevrimdışı) ---
class AvailabilityStatusUpdate(BaseModel):
    availability_status: str  # active, on_break, offline


@router.put("/couriers/{courier_id}/availability")
async def update_courier_availability(courier_id: str, data: AvailabilityStatusUpdate):
    """Update courier availability status (active/on_break/offline)"""
    valid_statuses = ["active", "on_break", "offline"]
    if data.availability_status not in valid_statuses:
        raise HTTPException(status_code=400, detail="Geçersiz durum. active, on_break veya offline olmalı")
    
    result = await db.couriers.update_one(
        {"id": courier_id},
        {"$set": {"availability_status": data.availability_status}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")
    
    status_labels = {"active": "Aktif", "on_break": "Molada", "offline": "Çevrimdışı"}
    return {"message": f"Kurye durumu güncellendi: {status_labels[data.availability_status]}"}


@router.get("/companies/{company_id}/couriers/with-availability")
async def get_couriers_with_availability(company_id: str):
    """Get couriers grouped by availability status"""
    # Kuryeler company_id field'ını kullanıyor (tekil veya array olabilir)
    couriers = await db.couriers.find(
        {
            "$or": [
                {"company_id": company_id},
                {"company_ids": company_id}
            ],
            "is_archived": {"$ne": True}
        },
        {"_id": 0}
    ).to_list(500)
    
    # Set default availability if not set
    for c in couriers:
        if "availability_status" not in c:
            c["availability_status"] = "offline"
    
    # Group by availability
    active = [c for c in couriers if c.get("availability_status") == "active"]
    on_break = [c for c in couriers if c.get("availability_status") == "on_break"]
    offline = [c for c in couriers if c.get("availability_status") == "offline"]
    
    return {
        "active": active,
        "on_break": on_break,
        "offline": offline,
        "counts": {
            "active": len(active),
            "on_break": len(on_break),
            "offline": len(offline),
            "total": len(couriers)
        }
    }
