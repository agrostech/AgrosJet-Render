from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel, ConfigDict
from typing import Optional

from services import courier_service

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
@router.get("/couriers")
async def get_all_couriers():
    """Get all couriers in the system (for system admin)"""
    return await courier_service.get_all_couriers()


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
