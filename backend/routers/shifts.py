from fastapi import APIRouter, HTTPException, Header, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import uuid

from utils.database import db
from utils.helpers import get_turkey_now, ensure_turkey_timezone, TURKEY_TZ
from utils.jwt_utils import require_admin

router = APIRouter(prefix="/api", tags=["Shifts"], dependencies=[Depends(require_admin)])

class ShiftCreate(BaseModel):
    name: str
    start_time: str
    end_time: str
    company_id: str

class ShiftUpdate(BaseModel):
    name: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None

class ShiftAssignment(BaseModel):
    courier_id: str
    day: str

class LeaveAssignment(BaseModel):
    courier_id: str
    day: str


@router.get("/companies/{company_id}/shifts")
async def get_company_shifts(company_id: str):
    """Get all shifts for a company"""
    # GET işlemi - kurye panelinden de erişilebilir, yetki kontrolü yok
    shifts = await db.shifts.find({"company_id": company_id}, {"_id": 0}).to_list(100)
    
    def shift_sort_key(shift):
        start_time = shift.get("start_time", "00:00")
        hour = int(start_time.split(":")[0])
        minute = int(start_time.split(":")[1]) if len(start_time.split(":")) > 1 else 0
        if hour < 6:
            hour += 24
        return hour * 60 + minute
    
    shifts.sort(key=shift_sort_key)
    return shifts

@router.post("/companies/{company_id}/shifts")
async def create_shift(
    company_id: str, 
    data: ShiftCreate
):
    """Create a new shift for a company"""
    shift = {
        "id": str(uuid.uuid4()),
        "name": data.name,
        "start_time": data.start_time,
        "end_time": data.end_time,
        "company_id": company_id,
        "created_at": get_turkey_now()
    }
    await db.shifts.insert_one(shift)
    
    # Vardiya ihlali scheduler job'ını ekle
    try:
        from utils.shift_scheduler import update_shift_jobs_on_change
        await update_shift_jobs_on_change(new_start_time=data.start_time)
    except Exception as e:
        print(f"Failed to update shift jobs: {e}")
    
    return {"message": "Vardiya oluşturuldu", "id": shift["id"]}

@router.put("/shifts/{shift_id}")
async def update_shift(
    shift_id: str, 
    data: ShiftUpdate
):
    """Update a shift"""
    # Mevcut vardiya bilgisini al (start_time değişikliği için)
    old_shift = await db.shifts.find_one({"id": shift_id}, {"_id": 0, "start_time": 1})
    old_start_time = old_shift.get("start_time") if old_shift else None
    
    update_data = {}
    if data.name is not None:
        update_data["name"] = data.name
    if data.start_time is not None:
        update_data["start_time"] = data.start_time
    if data.end_time is not None:
        update_data["end_time"] = data.end_time
    
    if not update_data:
        raise HTTPException(status_code=400, detail="Güncellenecek veri yok")
    
    result = await db.shifts.update_one({"id": shift_id}, {"$set": update_data})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Vardiya bulunamadı")
    
    # Start time değiştiyse scheduler job'larını güncelle
    if data.start_time and data.start_time != old_start_time:
        try:
            from utils.shift_scheduler import update_shift_jobs_on_change
            await update_shift_jobs_on_change(old_start_time=old_start_time, new_start_time=data.start_time)
        except Exception as e:
            print(f"Failed to update shift jobs: {e}")
    
    return {"message": "Vardiya güncellendi"}

@router.delete("/shifts/{shift_id}")
async def delete_shift(
    shift_id: str
):
    """Delete a shift and all its assignments"""
    # Silinecek vardiyayı al (start_time için)
    shift = await db.shifts.find_one({"id": shift_id}, {"_id": 0, "start_time": 1})
    start_time = shift.get("start_time") if shift else None
    
    result = await db.shifts.delete_one({"id": shift_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Vardiya bulunamadı")
    await db.shift_assignments.delete_many({"shift_id": shift_id})
    
    # Scheduler job'ını kaldır (o saatte başka vardiya yoksa)
    if start_time:
        try:
            from utils.shift_scheduler import update_shift_jobs_on_change
            await update_shift_jobs_on_change(old_start_time=start_time)
        except Exception as e:
            print(f"Failed to update shift jobs: {e}")
    
    return {"message": "Vardiya silindi"}

@router.get("/companies/{company_id}/shift-assignments")
async def get_shift_assignments(company_id: str, include_admin_linked: bool = False):
    """Get all shift assignments for a company"""
    # GET işlemi - kurye panelinden de erişilebilir
    assignments = await db.shift_assignments.find({"company_id": company_id}, {"_id": 0}).to_list(1000)
    
    # Kurye bilgilerini al (is_admin_linked dahil)
    courier_ids = list(set(a["courier_id"] for a in assignments))
    if courier_ids:
        couriers = await db.couriers.find(
            {"id": {"$in": courier_ids}},
            {"_id": 0, "id": 1, "is_admin_linked": 1}
        ).to_list(1000)
        courier_map = {c["id"]: c for c in couriers}
        
        # Her assignment'a is_admin_linked bilgisi ekle
        for a in assignments:
            courier = courier_map.get(a["courier_id"], {})
            a["is_admin_linked"] = courier.get("is_admin_linked", False)
        
        # is_admin_linked kuryeleri filtrele (Güncel Durum'da gösterilmeyecek)
        if not include_admin_linked:
            assignments = [a for a in assignments if not a.get("is_admin_linked")]
    
    return assignments

@router.post("/shifts/{shift_id}/assign")
async def assign_courier_to_shift(
    shift_id: str, 
    data: ShiftAssignment
):
    """Assign a courier to a shift for a specific day"""
    shift = await db.shifts.find_one({"id": shift_id})
    if not shift:
        raise HTTPException(status_code=404, detail="Vardiya bulunamadı")
    
    courier = await db.couriers.find_one({"id": data.courier_id})
    if not courier:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")
    
    existing = await db.shift_assignments.find_one({
        "shift_id": shift_id,
        "courier_id": data.courier_id,
        "day": data.day
    })
    if existing:
        raise HTTPException(status_code=400, detail="Bu kurye zaten bu vardiyaya atanmış")
    
    await db.leaves.delete_one({
        "company_id": shift["company_id"],
        "courier_id": data.courier_id,
        "day": data.day
    })
    
    assignment = {
        "id": str(uuid.uuid4()),
        "shift_id": shift_id,
        "courier_id": data.courier_id,
        "courier_name": courier["name"],
        "day": data.day,
        "company_id": shift["company_id"],
        "created_at": get_turkey_now()
    }
    await db.shift_assignments.insert_one(assignment)
    return {"message": "Kurye vardiyaya atandı", "id": assignment["id"]}

@router.delete("/shift-assignments/{assignment_id}")
async def remove_shift_assignment(
    assignment_id: str
):
    """Remove a courier from a shift"""
    result = await db.shift_assignments.delete_one({"id": assignment_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Atama bulunamadı")
    return {"message": "Kurye vardiyadan çıkarıldı"}


# Leave (İzin) Management
@router.get("/companies/{company_id}/leaves")
async def get_company_leaves(company_id: str):
    """Get all leaves for a company"""
    # GET işlemi - kurye panelinden de erişilebilir
    leaves = await db.leaves.find({"company_id": company_id}, {"_id": 0}).to_list(1000)
    return leaves

@router.post("/companies/{company_id}/leaves")
async def add_leave(
    company_id: str, 
    data: LeaveAssignment
):
    """Add a courier to leave for a specific day"""
    courier = await db.couriers.find_one({"id": data.courier_id})
    if not courier:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")
    
    existing = await db.leaves.find_one({
        "company_id": company_id,
        "courier_id": data.courier_id,
        "day": data.day
    })
    if existing:
        raise HTTPException(status_code=400, detail="Bu kurye zaten bu gün izinli")
    
    deleted_result = await db.shift_assignments.delete_many({
        "company_id": company_id,
        "courier_id": data.courier_id,
        "day": data.day
    })
    
    leave = {
        "id": str(uuid.uuid4()),
        "courier_id": data.courier_id,
        "courier_name": courier["name"],
        "day": data.day,
        "company_id": company_id,
        "created_at": get_turkey_now()
    }
    await db.leaves.insert_one(leave)
    
    removed_count = deleted_result.deleted_count
    if removed_count > 0:
        return {"message": f"İzin eklendi. {removed_count} vardiya ataması kaldırıldı.", "id": leave["id"]}
    return {"message": "İzin eklendi", "id": leave["id"]}

@router.delete("/leaves/{leave_id}")
async def remove_leave(
    leave_id: str
):
    """Remove a leave"""
    result = await db.leaves.delete_one({"id": leave_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="İzin bulunamadı")
    return {"message": "İzin kaldırıldı"}
