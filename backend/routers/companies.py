from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict
from typing import List, Optional
from datetime import datetime, timezone
import uuid

from utils.database import db

router = APIRouter(prefix="/api", tags=["Companies"])


# --- Pydantic Models ---
class CompanyCreate(BaseModel):
    name: str
    logo_url: Optional[str] = ""
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
    tckn_vkn: Optional[str] = None
    address: Optional[str] = None
    tax_office: Optional[str] = None
    email: Optional[str] = None
    city: Optional[str] = None
    city_lat: Optional[float] = None
    city_lng: Optional[float] = None


class CompanyResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    logo_url: Optional[str] = None
    tckn_vkn: Optional[str] = ""
    address: Optional[str] = ""
    tax_office: Optional[str] = ""
    email: Optional[str] = ""
    city: Optional[str] = ""
    city_lat: Optional[float] = None
    city_lng: Optional[float] = None
    created_at: str


# --- Company Routes ---
@router.get("/companies", response_model=List[CompanyResponse])
async def get_companies():
    companies = await db.companies.find({}, {"_id": 0}).to_list(100)
    return companies


@router.get("/companies/{company_id}", response_model=CompanyResponse)
async def get_company(company_id: str):
    company = await db.companies.find_one({"id": company_id}, {"_id": 0})
    if not company:
        raise HTTPException(status_code=404, detail="Şirket bulunamadı")
    return company


@router.post("/companies")
async def create_company(data: CompanyCreate):
    company = {
        "id": str(uuid.uuid4()),
        "name": data.name,
        "logo_url": data.logo_url or "",
        "tckn_vkn": data.tckn_vkn or "",
        "address": data.address or "",
        "tax_office": data.tax_office or "",
        "email": data.email or "",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.companies.insert_one(company)
    return {"message": "Şirket oluşturuldu", "id": company["id"], "name": company["name"]}


@router.put("/companies/{company_id}")
async def update_company(company_id: str, data: CompanyUpdate):
    update_data = {}
    if data.name is not None:
        update_data["name"] = data.name
    if data.logo_url is not None:
        update_data["logo_url"] = data.logo_url
    if data.tckn_vkn is not None:
        update_data["tckn_vkn"] = data.tckn_vkn
    if data.address is not None:
        update_data["address"] = data.address
    if data.tax_office is not None:
        update_data["tax_office"] = data.tax_office
    if data.email is not None:
        update_data["email"] = data.email
    
    if not update_data:
        raise HTTPException(status_code=400, detail="Güncellenecek veri yok")
    
    result = await db.companies.update_one({"id": company_id}, {"$set": update_data})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Şirket bulunamadı")
    return {"message": "Şirket güncellendi"}


@router.delete("/companies/{company_id}")
async def delete_company(company_id: str):
    await db.companies.delete_one({"id": company_id})
    await db.company_couriers.delete_many({"company_id": company_id})
    await db.admins.delete_many({"company_id": company_id})
    return {"message": "Şirket ve tüm verileri silindi"}
