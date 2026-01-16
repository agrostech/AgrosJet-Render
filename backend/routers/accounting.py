from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import uuid

from utils.database import db

router = APIRouter(prefix="/api", tags=["Muhasebe"])

# --- Pydantic Models ---
class BusinessCreate(BaseModel):
    name: str
    phone: Optional[str] = None
    address: Optional[str] = None

class VendorCreate(BaseModel):
    name: str
    phone: Optional[str] = None
    address: Optional[str] = None

class TransactionCreate(BaseModel):
    entity_type: str  # "courier", "business", "vendor"
    entity_id: str
    company_id: str
    type: str  # "payment_in" (ödeme al - tahsil), "payment_out" (ödeme yap - borçlandır)
    amount: float
    description: Optional[str] = None
    is_hakedis: Optional[bool] = False
    admin_id: Optional[str] = None
    admin_name: Optional[str] = None
    custom_date: Optional[str] = None

class TransactionDeleteRequest(BaseModel):
    admin_id: str
    admin_name: str

class ActivityLogCreate(BaseModel):
    company_id: str
    admin_id: str
    admin_name: str
    action: str
    entity_type: str
    entity_id: str
    entity_name: str
    details: Optional[dict] = None


# --- Activity Logs Helper ---
async def create_activity_log(log_data: dict):
    """Helper to create activity log"""
    log = {
        "id": str(uuid.uuid4()),
        **log_data,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.activity_logs.insert_one(log)
    return log


# --- Activity Logs ---
@router.get("/activity-logs/{company_id}")
async def get_activity_logs(company_id: str, skip: int = 0, limit: int = 10):
    """Get paginated activity logs for a company"""
    total_count = await db.activity_logs.count_documents({"company_id": company_id})
    
    logs = await db.activity_logs.find(
        {"company_id": company_id},
        {"_id": 0}
    ).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    return {
        "logs": logs,
        "total_count": total_count,
        "has_more": skip + limit < total_count
    }


# --- İşletmeler (Businesses) ---
@router.get("/companies/{company_id}/businesses")
async def get_businesses(company_id: str, include_archived: bool = False):
    """Get all businesses for a company"""
    query = {"company_id": company_id}
    if not include_archived:
        query["is_archived"] = {"$ne": True}
    businesses = await db.businesses.find(query, {"_id": 0}).to_list(500)
    return businesses

@router.post("/companies/{company_id}/businesses")
async def create_business(company_id: str, data: BusinessCreate):
    """Create a new business"""
    business = {
        "id": str(uuid.uuid4()),
        "name": data.name,
        "phone": data.phone,
        "address": data.address,
        "company_id": company_id,
        "is_archived": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.businesses.insert_one(business)
    return {"message": "İşletme oluşturuldu", "id": business["id"]}

@router.put("/businesses/{business_id}/archive")
async def archive_business(business_id: str):
    """Archive a business"""
    result = await db.businesses.update_one(
        {"id": business_id},
        {"$set": {"is_archived": True}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="İşletme bulunamadı")
    return {"message": "İşletme arşivlendi"}

@router.put("/businesses/{business_id}/unarchive")
async def unarchive_business(business_id: str):
    """Unarchive a business"""
    result = await db.businesses.update_one(
        {"id": business_id},
        {"$set": {"is_archived": False}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="İşletme bulunamadı")
    return {"message": "İşletme arşivden çıkarıldı"}

@router.delete("/businesses/{business_id}")
async def delete_business(business_id: str):
    """Delete a business"""
    result = await db.businesses.delete_one({"id": business_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="İşletme bulunamadı")
    return {"message": "İşletme silindi"}


# --- Cariler (Vendors) ---
@router.get("/companies/{company_id}/vendors")
async def get_vendors(company_id: str, include_archived: bool = False):
    """Get all vendors for a company"""
    query = {"company_id": company_id}
    if not include_archived:
        query["is_archived"] = {"$ne": True}
    vendors = await db.vendors.find(query, {"_id": 0}).to_list(500)
    return vendors

@router.post("/companies/{company_id}/vendors")
async def create_vendor(company_id: str, data: VendorCreate):
    """Create a new vendor"""
    vendor = {
        "id": str(uuid.uuid4()),
        "name": data.name,
        "phone": data.phone,
        "address": data.address,
        "company_id": company_id,
        "is_archived": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.vendors.insert_one(vendor)
    return {"message": "Cari oluşturuldu", "id": vendor["id"]}

@router.put("/vendors/{vendor_id}/archive")
async def archive_vendor(vendor_id: str):
    """Archive a vendor"""
    result = await db.vendors.update_one(
        {"id": vendor_id},
        {"$set": {"is_archived": True}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Cari bulunamadı")
    return {"message": "Cari arşivlendi"}

@router.put("/vendors/{vendor_id}/unarchive")
async def unarchive_vendor(vendor_id: str):
    """Unarchive a vendor"""
    result = await db.vendors.update_one(
        {"id": vendor_id},
        {"$set": {"is_archived": False}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Cari bulunamadı")
    return {"message": "Cari arşivden çıkarıldı"}

@router.delete("/vendors/{vendor_id}")
async def delete_vendor(vendor_id: str):
    """Delete a vendor"""
    result = await db.vendors.delete_one({"id": vendor_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Cari bulunamadı")
    return {"message": "Cari silindi"}


# --- İşlemler (Transactions) ---
@router.post("/transactions")
async def create_transaction(data: TransactionCreate):
    """Create a new transaction"""
    if data.custom_date:
        try:
            tx_date = datetime.fromisoformat(data.custom_date.replace('Z', '+00:00'))
            if tx_date.tzinfo is None:
                tx_date = tx_date.replace(tzinfo=timezone.utc)
            created_at = tx_date.isoformat()
        except:
            created_at = datetime.now(timezone.utc).isoformat()
    else:
        created_at = datetime.now(timezone.utc).isoformat()
    
    transaction = {
        "id": str(uuid.uuid4()),
        "entity_type": data.entity_type,
        "entity_id": data.entity_id,
        "company_id": data.company_id,
        "type": data.type,
        "amount": data.amount,
        "description": data.description or ("Verilen" if data.type == "payment_in" else "Alınan"),
        "is_hakedis": data.is_hakedis if data.entity_type == "courier" else False,
        "created_at": created_at
    }
    await db.transactions.insert_one(transaction)
    
    # Get entity name for log
    entity_name = ""
    if data.entity_type == "courier":
        courier = await db.couriers.find_one({"id": data.entity_id})
        entity_name = courier["name"] if courier else "Bilinmeyen Kurye"
    elif data.entity_type == "business":
        business = await db.businesses.find_one({"id": data.entity_id})
        entity_name = business["name"] if business else "Bilinmeyen İşletme"
    elif data.entity_type == "vendor":
        vendor = await db.vendors.find_one({"id": data.entity_id})
        entity_name = vendor["name"] if vendor else "Bilinmeyen Cari"
    
    # Create activity log
    if data.admin_id and data.admin_name:
        await create_activity_log({
            "company_id": data.company_id,
            "admin_id": data.admin_id,
            "admin_name": data.admin_name,
            "action": "transaction_created",
            "entity_type": data.entity_type,
            "entity_id": data.entity_id,
            "entity_name": entity_name,
            "details": {
                "transaction_id": transaction["id"],
                "type": data.type,
                "amount": data.amount,
                "description": transaction["description"],
                "is_hakedis": transaction["is_hakedis"]
            }
        })
    
    return {"message": "İşlem kaydedildi", "id": transaction["id"]}


async def get_entity_transactions(entity_type: str, entity_id: str, skip: int = 0, limit: int = 10):
    """Helper to get transactions and calculate balance for an entity"""
    total_count = await db.transactions.count_documents({"entity_type": entity_type, "entity_id": entity_id})
    
    transactions = await db.transactions.find(
        {"entity_type": entity_type, "entity_id": entity_id},
        {"_id": 0}
    ).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    # Calculate balance from ALL transactions
    all_transactions = await db.transactions.find(
        {"entity_type": entity_type, "entity_id": entity_id},
        {"_id": 0, "type": 1, "amount": 1}
    ).to_list(10000)
    
    balance = 0
    for tx in all_transactions:
        if tx["type"] == "payment_out":
            balance += tx["amount"]
        else:
            balance -= tx["amount"]
    
    return {
        "transactions": transactions, 
        "balance": balance,
        "total_count": total_count,
        "has_more": skip + limit < total_count
    }


@router.get("/transactions/courier/{courier_id}")
async def get_courier_transactions(courier_id: str, skip: int = 0, limit: int = 10):
    """Get paginated transactions for a courier"""
    return await get_entity_transactions("courier", courier_id, skip, limit)

@router.get("/transactions/business/{business_id}")
async def get_business_transactions(business_id: str, skip: int = 0, limit: int = 10):
    """Get paginated transactions for a business"""
    return await get_entity_transactions("business", business_id, skip, limit)

@router.get("/transactions/vendor/{vendor_id}")
async def get_vendor_transactions(vendor_id: str, skip: int = 0, limit: int = 10):
    """Get paginated transactions for a vendor"""
    return await get_entity_transactions("vendor", vendor_id, skip, limit)

@router.delete("/transactions/{transaction_id}")
async def delete_transaction(transaction_id: str, data: TransactionDeleteRequest = None):
    """Delete a transaction"""
    transaction = await db.transactions.find_one({"id": transaction_id}, {"_id": 0})
    if not transaction:
        raise HTTPException(status_code=404, detail="İşlem bulunamadı")
    
    # Get entity name for log
    entity_name = ""
    if transaction["entity_type"] == "courier":
        courier = await db.couriers.find_one({"id": transaction["entity_id"]})
        entity_name = courier["name"] if courier else "Bilinmeyen Kurye"
    elif transaction["entity_type"] == "business":
        business = await db.businesses.find_one({"id": transaction["entity_id"]})
        entity_name = business["name"] if business else "Bilinmeyen İşletme"
    elif transaction["entity_type"] == "vendor":
        vendor = await db.vendors.find_one({"id": transaction["entity_id"]})
        entity_name = vendor["name"] if vendor else "Bilinmeyen Cari"
    
    await db.transactions.delete_one({"id": transaction_id})
    
    if data and data.admin_id and data.admin_name:
        await create_activity_log({
            "company_id": transaction["company_id"],
            "admin_id": data.admin_id,
            "admin_name": data.admin_name,
            "action": "transaction_deleted",
            "entity_type": transaction["entity_type"],
            "entity_id": transaction["entity_id"],
            "entity_name": entity_name,
            "details": {
                "transaction_id": transaction_id,
                "type": transaction["type"],
                "amount": transaction["amount"],
                "description": transaction["description"],
                "is_hakedis": transaction.get("is_hakedis", False)
            }
        })
    
    return {"message": "İşlem silindi"}
