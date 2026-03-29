from fastapi import APIRouter, HTTPException, Depends
from utils.jwt_utils import require_admin
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone, timedelta
from bson import ObjectId
import os
from pymongo import MongoClient

# Türkiye timezone (UTC+3)
TURKEY_TZ = timezone(timedelta(hours=3))

def get_turkey_now():
    return datetime.now(TURKEY_TZ).isoformat()

router = APIRouter(prefix="/api/motorcycles", tags=["motorcycles"], dependencies=[Depends(require_admin)])

mongo_url = os.environ.get("MONGO_URL")
client = MongoClient(mongo_url)
db = client[os.environ.get("DB_NAME", "shiftjet_db")]

# Pydantic models
class MotorcycleCreate(BaseModel):
    courier_id: str
    company_id: Optional[str] = None
    brand: str
    model: str
    plate: str
    current_km: int

class MotorcycleUpdate(BaseModel):
    brand: Optional[str] = None
    model: Optional[str] = None
    plate: Optional[str] = None

class MaintenanceCreate(BaseModel):
    motorcycle_id: str
    courier_id: str
    company_id: Optional[str] = None
    km_at_maintenance: int
    oil_change: bool = False
    brake_maintenance: bool = False
    variator_maintenance: bool = False

# Helper to serialize MongoDB documents
def serialize_doc(doc):
    if doc is None:
        return None
    doc["id"] = str(doc.pop("_id"))
    return doc

# Create motorcycle
@router.post("")
async def create_motorcycle(data: MotorcycleCreate):
    motorcycle = {
        "courier_id": data.courier_id,
        "company_id": data.company_id,
        "brand": data.brand,
        "model": data.model,
        "plate": data.plate.upper(),
        "current_km": data.current_km,
        # Maintenance tracking fields
        "last_oil_date": None,
        "last_oil_km": None,
        "last_brake_date": None,
        "last_brake_km": None,
        "last_variator_date": None,
        "last_variator_km": None,
        "created_at": datetime.now(TURKEY_TZ),
        "updated_at": datetime.now(TURKEY_TZ)
    }
    
    result = db.motorcycles.insert_one(motorcycle)
    motorcycle["_id"] = result.inserted_id
    
    return {"message": "Motosiklet eklendi", "motorcycle": serialize_doc(motorcycle)}

# Get motorcycles for courier
@router.get("/courier/{courier_id}")
async def get_courier_motorcycles(courier_id: str):
    motorcycles = list(db.motorcycles.find({"courier_id": courier_id}).sort("created_at", -1))
    return [serialize_doc(m) for m in motorcycles]

# Helper to safely convert to ObjectId
def safe_object_id(id_str):
    try:
        return ObjectId(id_str)
    except Exception:
        return None

# Get single motorcycle
@router.get("/{motorcycle_id}")
async def get_motorcycle(motorcycle_id: str):
    oid = safe_object_id(motorcycle_id)
    if not oid:
        raise HTTPException(status_code=400, detail="Geçersiz ID")
    motorcycle = db.motorcycles.find_one({"_id": oid})
    if not motorcycle:
        raise HTTPException(status_code=404, detail="Motosiklet bulunamadı")
    return serialize_doc(motorcycle)

# Update motorcycle (brand, model, plate only - not km)
@router.put("/{motorcycle_id}")
async def update_motorcycle(motorcycle_id: str, data: MotorcycleUpdate):
    oid = safe_object_id(motorcycle_id)
    if not oid:
        raise HTTPException(status_code=400, detail="Geçersiz ID")
    motorcycle = db.motorcycles.find_one({"_id": oid})
    if not motorcycle:
        raise HTTPException(status_code=404, detail="Motosiklet bulunamadı")
    
    update_data = {"updated_at": datetime.now(TURKEY_TZ)}
    if data.brand is not None:
        update_data["brand"] = data.brand
    if data.model is not None:
        update_data["model"] = data.model
    if data.plate is not None:
        update_data["plate"] = data.plate.upper()
    
    db.motorcycles.update_one({"_id": oid}, {"$set": update_data})
    
    updated = db.motorcycles.find_one({"_id": oid})
    return {"message": "Motosiklet güncellendi", "motorcycle": serialize_doc(updated)}

# Delete motorcycle
@router.delete("/{motorcycle_id}")
async def delete_motorcycle(motorcycle_id: str):
    oid = safe_object_id(motorcycle_id)
    if not oid:
        raise HTTPException(status_code=400, detail="Geçersiz ID")
    motorcycle = db.motorcycles.find_one({"_id": oid})
    if not motorcycle:
        raise HTTPException(status_code=404, detail="Motosiklet bulunamadı")
    
    # Delete motorcycle and its maintenance history
    db.motorcycles.delete_one({"_id": oid})
    db.motorcycle_maintenances.delete_many({"motorcycle_id": oid})
    
    return {"message": "Motosiklet silindi"}

# Add maintenance record
@router.post("/maintenance")
async def add_maintenance(data: MaintenanceCreate):
    try:
        motorcycle_oid = ObjectId(data.motorcycle_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Geçersiz motosiklet ID")
    
    motorcycle = db.motorcycles.find_one({"_id": motorcycle_oid})
    if not motorcycle:
        raise HTTPException(status_code=404, detail="Motosiklet bulunamadı")
    
    # Validate km - must be >= current_km
    if data.km_at_maintenance < motorcycle["current_km"]:
        raise HTTPException(status_code=400, detail="Kilometre mevcut km'den düşük olamaz")
    
    # At least one maintenance type must be selected
    if not (data.oil_change or data.brake_maintenance or data.variator_maintenance):
        raise HTTPException(status_code=400, detail="En az bir bakım türü seçilmeli")
    
    now = datetime.now(TURKEY_TZ)
    
    # Create maintenance record
    maintenance = {
        "motorcycle_id": motorcycle_oid,
        "courier_id": data.courier_id,
        "company_id": data.company_id,
        "maintenance_date": now,
        "km_at_maintenance": data.km_at_maintenance,
        "oil_change": data.oil_change,
        "brake_maintenance": data.brake_maintenance,
        "variator_maintenance": data.variator_maintenance,
        "created_at": now
    }
    
    db.motorcycle_maintenances.insert_one(maintenance)
    
    # Update motorcycle with new maintenance info
    update_data = {
        "current_km": data.km_at_maintenance,
        "updated_at": now
    }
    
    if data.oil_change:
        update_data["last_oil_date"] = now
        update_data["last_oil_km"] = data.km_at_maintenance
    
    if data.brake_maintenance:
        update_data["last_brake_date"] = now
        update_data["last_brake_km"] = data.km_at_maintenance
    
    if data.variator_maintenance:
        update_data["last_variator_date"] = now
        update_data["last_variator_km"] = data.km_at_maintenance
    
    db.motorcycles.update_one({"_id": ObjectId(data.motorcycle_id)}, {"$set": update_data})
    
    updated_motorcycle = db.motorcycles.find_one({"_id": ObjectId(data.motorcycle_id)})
    
    return {"message": "Bakım kaydedildi", "motorcycle": serialize_doc(updated_motorcycle)}

# Get maintenance history for a motorcycle
@router.get("/{motorcycle_id}/maintenances")
async def get_maintenance_history(motorcycle_id: str):
    maintenances = list(db.motorcycle_maintenances.find(
        {"motorcycle_id": ObjectId(motorcycle_id)}
    ).sort("maintenance_date", -1))
    
    return [serialize_doc(m) for m in maintenances]

# Helper to make datetime timezone aware
def ensure_utc(dt):
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt

# Check maintenance notifications for courier
@router.get("/notifications/{courier_id}")
async def get_maintenance_notifications(courier_id: str):
    motorcycles = list(db.motorcycles.find({"courier_id": courier_id}))
    
    notifications = []
    now = datetime.now(TURKEY_TZ)
    
    for moto in motorcycles:
        moto_notifications = []
        
        # Check oil maintenance (10 days)
        last_oil = ensure_utc(moto.get("last_oil_date"))
        if last_oil:
            days_since_oil = (now - last_oil).days
            if days_since_oil >= 10:
                moto_notifications.append({
                    "type": "oil",
                    "label": "Yağ Bakımı",
                    "days_overdue": days_since_oil - 10,
                    "last_date": last_oil.isoformat(),
                    "last_km": moto.get("last_oil_km"),
                    "next_km": (moto.get("last_oil_km") or 0) + 2000
                })
        
        # Check brake maintenance (10 days)
        last_brake = ensure_utc(moto.get("last_brake_date"))
        if last_brake:
            days_since_brake = (now - last_brake).days
            if days_since_brake >= 10:
                moto_notifications.append({
                    "type": "brake",
                    "label": "Fren Bakımı",
                    "days_overdue": days_since_brake - 10,
                    "last_date": last_brake.isoformat(),
                    "last_km": moto.get("last_brake_km"),
                    "next_km": (moto.get("last_brake_km") or 0) + 2000
                })
        
        # Check variator maintenance (25 days)
        last_variator = ensure_utc(moto.get("last_variator_date"))
        if last_variator:
            days_since_variator = (now - last_variator).days
            if days_since_variator >= 25:
                moto_notifications.append({
                    "type": "variator",
                    "label": "Kayış/Varyatör Bakımı",
                    "days_overdue": days_since_variator - 25,
                    "last_date": last_variator.isoformat(),
                    "last_km": moto.get("last_variator_km"),
                    "next_km": (moto.get("last_variator_km") or 0) + 5000
                })
        
        if moto_notifications:
            notifications.append({
                "motorcycle_id": str(moto["_id"]),
                "motorcycle_name": f"{moto['brand']} {moto['model']} - {moto['plate']}",
                "notifications": moto_notifications
            })
    
    return {
        "has_notifications": len(notifications) > 0,
        "total_count": sum(len(n["notifications"]) for n in notifications),
        "motorcycles": notifications
    }

# Dismiss notification (mark as seen - stores in courier's dismissed notifications)
@router.post("/notifications/{courier_id}/dismiss")
async def dismiss_notification(courier_id: str, motorcycle_id: str, notification_type: str):
    # Store dismissed notification
    dismissed = {
        "courier_id": courier_id,
        "motorcycle_id": ObjectId(motorcycle_id),
        "notification_type": notification_type,
        "dismissed_at": datetime.now(TURKEY_TZ)
    }
    
    # Upsert - replace if exists
    db.dismissed_maintenance_notifications.update_one(
        {
            "courier_id": courier_id,
            "motorcycle_id": ObjectId(motorcycle_id),
            "notification_type": notification_type
        },
        {"$set": dismissed},
        upsert=True
    )
    
    return {"message": "Bildirim kapatıldı"}

# Get active notifications (excluding dismissed ones that haven't triggered again)
@router.get("/notifications/{courier_id}/active")
async def get_active_notifications(courier_id: str):
    motorcycles = list(db.motorcycles.find({"courier_id": courier_id}))
    
    # Get dismissed notifications
    dismissed = list(db.dismissed_maintenance_notifications.find({"courier_id": courier_id}))
    dismissed_map = {}
    for d in dismissed:
        key = f"{d['motorcycle_id']}_{d['notification_type']}"
        dismissed_map[key] = ensure_utc(d["dismissed_at"])
    
    notifications = []
    now = datetime.now(TURKEY_TZ)
    
    for moto in motorcycles:
        moto_id = str(moto["_id"])
        moto_notifications = []
        
        # Check oil maintenance (10 days)
        last_oil = ensure_utc(moto.get("last_oil_date"))
        if last_oil:
            days_since_oil = (now - last_oil).days
            if days_since_oil >= 10:
                key = f"{moto['_id']}_oil"
                dismissed_at = dismissed_map.get(key)
                # Check if dismissed after last maintenance
                if dismissed_at is None or dismissed_at < last_oil:
                    moto_notifications.append({
                        "type": "oil",
                        "label": "Yağ Bakımı",
                        "days_overdue": days_since_oil - 10
                    })
        
        # Check brake maintenance (10 days)
        last_brake = ensure_utc(moto.get("last_brake_date"))
        if last_brake:
            days_since_brake = (now - last_brake).days
            if days_since_brake >= 10:
                key = f"{moto['_id']}_brake"
                dismissed_at = dismissed_map.get(key)
                if dismissed_at is None or dismissed_at < last_brake:
                    moto_notifications.append({
                        "type": "brake",
                        "label": "Fren Bakımı",
                        "days_overdue": days_since_brake - 10
                    })
        
        # Check variator maintenance (25 days)
        last_variator = ensure_utc(moto.get("last_variator_date"))
        if last_variator:
            days_since_variator = (now - last_variator).days
            if days_since_variator >= 25:
                key = f"{moto['_id']}_variator"
                dismissed_at = dismissed_map.get(key)
                if dismissed_at is None or dismissed_at < last_variator:
                    moto_notifications.append({
                        "type": "variator",
                        "label": "Kayış/Varyatör Bakımı",
                        "days_overdue": days_since_variator - 25
                    })
        
        if moto_notifications:
            notifications.append({
                "motorcycle_id": moto_id,
                "motorcycle_name": f"{moto['brand']} {moto['model']} - {moto['plate']}",
                "notifications": moto_notifications
            })
    
    return {
        "has_notifications": len(notifications) > 0,
        "total_count": sum(len(n["notifications"]) for n in notifications),
        "motorcycles": notifications
    }
