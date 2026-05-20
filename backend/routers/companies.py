from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, ConfigDict
from typing import List, Optional
from datetime import datetime, timezone
import uuid
import os

from utils.database import db
from utils.helpers import get_turkey_now, ensure_turkey_timezone, TURKEY_TZ
from services.r2_storage import upload_file_to_r2, download_file_from_r2
from utils.jwt_utils import require_auth

router = APIRouter(prefix="/api", tags=["Companies"])

# Legacy local dir (for backward compat serving old logos).
# Real storage is R2; this is only used for legacy file serving.
from utils.storage_paths import get_writable_dir
LOGO_DIR = get_writable_dir(os.environ.get("LOGO_DIR", "/app/uploads/logos"))


# --- Pydantic Models ---
class CompanyCreate(BaseModel):
    name: str
    logo_url: Optional[str] = ""
    logo_dark: Optional[str] = ""
    logo_light: Optional[str] = ""
    tckn_vkn: Optional[str] = ""
    address: Optional[str] = ""
    tax_office: Optional[str] = ""
    email: Optional[str] = ""
    city: Optional[str] = ""
    city_lat: Optional[float] = None
    city_lng: Optional[float] = None


class CompanyUpdate(BaseModel):
    name: Optional[str] = None
    logo_url: Optional[str] = None
    logo_dark: Optional[str] = None
    logo_light: Optional[str] = None
    tckn_vkn: Optional[str] = None
    address: Optional[str] = None
    tax_office: Optional[str] = None
    email: Optional[str] = None
    city: Optional[str] = None
    city_lat: Optional[float] = None
    city_lng: Optional[float] = None


class CompanyResponse(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: str
    name: str
    logo_url: Optional[str] = None
    logo_dark: Optional[str] = None
    logo_light: Optional[str] = None
    tckn_vkn: Optional[str] = ""
    address: Optional[str] = ""
    tax_office: Optional[str] = ""
    email: Optional[str] = ""
    city: Optional[str] = ""
    city_lat: Optional[float] = None
    city_lng: Optional[float] = None
    opening_time: Optional[str] = "06:00"
    closing_time: Optional[str] = "06:00"
    created_at: Optional[datetime] = None
    shift_tolerance_minutes: Optional[int] = 5
    auto_dispatch_settings: Optional[dict] = None


# --- Company Routes ---
@router.get("/companies")
async def get_companies(auth: dict = Depends(require_auth)):
    companies = await db.companies.find({}, {"_id": 0}).to_list(100)
    for company in companies:
        if company.get("created_at"):
            company["created_at"] = str(company["created_at"])
    return companies


@router.get("/companies/{company_id}")
async def get_company(company_id: str, auth: dict = Depends(require_auth)):
    company = await db.companies.find_one({"id": company_id}, {"_id": 0})
    if not company:
        raise HTTPException(status_code=404, detail="Şirket bulunamadı")
    if company.get("created_at"):
        company["created_at"] = str(company["created_at"])
    return company


@router.get("/companies/{company_id}/work-hours")
async def get_company_work_hours(company_id: str, auth: dict = Depends(require_auth)):
    """Şirketin çalışma saatlerini getir"""
    company = await db.companies.find_one(
        {"id": company_id}, 
        {"_id": 0, "opening_time": 1, "closing_time": 1}
    )
    if not company:
        raise HTTPException(status_code=404, detail="Şirket bulunamadı")
    return {
        "opening_time": company.get("opening_time", "06:00"),
        "closing_time": company.get("closing_time", "06:00")
    }


@router.post("/companies")
async def create_company(data: CompanyCreate, auth: dict = Depends(require_auth)):
    company = {
        "id": str(uuid.uuid4()),
        "name": data.name,
        "logo_url": data.logo_url or "",
        "tckn_vkn": data.tckn_vkn or "",
        "address": data.address or "",
        "tax_office": data.tax_office or "",
        "email": data.email or "",
        "city": data.city or "",
        "city_lat": data.city_lat,
        "city_lng": data.city_lng,
        "created_at": get_turkey_now()
    }
    await db.companies.insert_one(company)
    return {"message": "Şirket oluşturuldu", "id": company["id"], "name": company["name"]}


@router.put("/companies/{company_id}")
async def update_company(company_id: str, data: CompanyUpdate, auth: dict = Depends(require_auth)):
    update_data = {}
    if data.name is not None:
        update_data["name"] = data.name
    if data.logo_url is not None:
        update_data["logo_url"] = data.logo_url
    if data.logo_dark is not None:
        update_data["logo_dark"] = data.logo_dark
    if data.logo_light is not None:
        update_data["logo_light"] = data.logo_light
    if data.tckn_vkn is not None:
        update_data["tckn_vkn"] = data.tckn_vkn
    if data.address is not None:
        update_data["address"] = data.address
    if data.tax_office is not None:
        update_data["tax_office"] = data.tax_office
    if data.email is not None:
        update_data["email"] = data.email
    if data.city is not None:
        update_data["city"] = data.city
    if data.city_lat is not None:
        update_data["city_lat"] = data.city_lat
    if data.city_lng is not None:
        update_data["city_lng"] = data.city_lng
    
    if not update_data:
        raise HTTPException(status_code=400, detail="Güncellenecek veri yok")
    
    result = await db.companies.update_one({"id": company_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Şirket bulunamadı")
    return {"message": "Şirket güncellendi"}



@router.post("/companies/{company_id}/logo")
async def upload_company_logo(
    company_id: str,
    logo_type: str = Form(...),
    file: UploadFile = File(...),
    auth: dict = Depends(require_auth)
):
    """Logo yükle. logo_type: 'dark' veya 'light'"""
    if logo_type not in ("dark", "light"):
        raise HTTPException(status_code=400, detail="logo_type 'dark' veya 'light' olmalı")
    
    company = await db.companies.find_one({"id": company_id}, {"_id": 0, "id": 1, "name": 1})
    if not company:
        raise HTTPException(status_code=404, detail="Şirket bulunamadı")
    
    ext = os.path.splitext(file.filename or "logo.png")[1] or ".png"
    content = await file.read()
    
    # Boyut kontrolü - Logo max 5MB
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Logo dosyası 5MB'ı geçemez")
    
    content_type = file.content_type or "image/png"
    
    r2_key = f"logos/{company_id}/{logo_type}{ext}"
    upload_result = await upload_file_to_r2(content, r2_key, content_type)
    
    if not upload_result['success']:
        raise HTTPException(status_code=503, detail="Dosya depolama servisi (Cloudflare R2) yapılandırılmamış. Sistem ayarlarından R2 bağlantısını yapın.")
    
    logo_path = f"/api/companies/logo/{company_id}_{logo_type}"
    field = f"logo_{logo_type}"
    await db.companies.update_one({"id": company_id}, {"$set": {field: logo_path, f"{field}_r2_key": r2_key}})
    
    return {"message": "Logo yüklendi", "path": logo_path, "type": logo_type}


@router.get("/companies/logo/{filename}")
async def get_company_logo(filename: str):
    """Logo dosyasını serve et - R2'den indirip doğrudan stream et"""
    # R2'den çek: filename = "{company_id}_{type}" formatında
    parts = filename.replace(".png", "").replace(".jpg", "").replace(".jpeg", "").replace(".webp", "").rsplit("_", 1)
    if len(parts) == 2:
        company_id, logo_type = parts
        company = await db.companies.find_one({"id": company_id}, {"_id": 0, f"logo_{logo_type}_r2_key": 1})
        if company:
            r2_key = company.get(f"logo_{logo_type}_r2_key")
            if r2_key:
                content = await download_file_from_r2(r2_key)
                if content:
                    # Uzantıdan content type belirle
                    ext = os.path.splitext(r2_key)[1].lower()
                    ct_map = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml"}
                    content_type = ct_map.get(ext, "image/png")
                    return Response(
                        content=content,
                        media_type=content_type,
                        headers={"Cache-Control": "public, max-age=86400"}
                    )
    
    # Fallback: local file
    for ext in [".png", ".jpg", ".jpeg", ".webp", ""]:
        filepath = os.path.join(LOGO_DIR, f"{filename}{ext}")
        if os.path.exists(filepath):
            return FileResponse(filepath)
    
    # Dosya adıyla direkt dene
    filepath = os.path.join(LOGO_DIR, filename)
    if os.path.exists(filepath):
        return FileResponse(filepath)
    
    raise HTTPException(status_code=404, detail="Logo bulunamadı")


@router.delete("/companies/{company_id}")
async def delete_company(company_id: str, auth: dict = Depends(require_auth)):
    await db.companies.delete_one({"id": company_id})
    await db.company_couriers.delete_many({"company_id": company_id})
    await db.admins.delete_many({"company_id": company_id})
    return {"message": "Şirket ve tüm verileri silindi"}


# --- Working Hours ---
class WorkingHoursUpdate(BaseModel):
    opening_time: str = "06:00"
    closing_time: str = "06:00"


@router.get("/companies/{company_id}/working-hours")
async def get_working_hours(company_id: str, auth: dict = Depends(require_auth)):
    """Get company working hours"""
    company = await db.companies.find_one({"id": company_id}, {"_id": 0, "opening_time": 1, "closing_time": 1})
    if not company:
        raise HTTPException(status_code=404, detail="Şirket bulunamadı")
    return {
        "opening_time": company.get("opening_time", "06:00"),
        "closing_time": company.get("closing_time", "06:00")
    }


@router.put("/companies/{company_id}/working-hours")
async def update_working_hours(company_id: str, data: WorkingHoursUpdate, auth: dict = Depends(require_auth)):
    """Update company working hours"""
    result = await db.companies.update_one(
        {"id": company_id},
        {"$set": {
            "opening_time": data.opening_time,
            "closing_time": data.closing_time
        }}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Şirket bulunamadı")
    return {"message": "Çalışma saatleri güncellendi"}



# --- Shift Tolerance Settings ---
class ShiftToleranceUpdate(BaseModel):
    shift_tolerance_minutes: int = 5


@router.get("/companies/{company_id}/shift-tolerance")
async def get_shift_tolerance(company_id: str, auth: dict = Depends(require_auth)):
    """Şirket vardiya tolerans ayarını getir"""
    company = await db.companies.find_one({"id": company_id}, {"_id": 0, "id": 1, "shift_tolerance_minutes": 1})
    if not company:
        raise HTTPException(status_code=404, detail="Şirket bulunamadı")
    return {
        "shift_tolerance_minutes": company.get("shift_tolerance_minutes", 5)
    }


@router.put("/companies/{company_id}/shift-tolerance")
async def update_shift_tolerance(company_id: str, data: ShiftToleranceUpdate, auth: dict = Depends(require_auth)):
    """Şirket vardiya tolerans ayarını güncelle (dakika cinsinden)"""
    if data.shift_tolerance_minutes < 0 or data.shift_tolerance_minutes > 30:
        raise HTTPException(status_code=400, detail="Tolerans 0-30 dakika arasında olmalı")
    
    result = await db.companies.update_one(
        {"id": company_id},
        {"$set": {"shift_tolerance_minutes": data.shift_tolerance_minutes}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Şirket bulunamadı")
    return {"message": f"Vardiya toleransı güncellendi: {data.shift_tolerance_minutes} dakika"}
