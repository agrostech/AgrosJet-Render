from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
from bson import ObjectId
import os
from pymongo import MongoClient

router = APIRouter(prefix="/api/motorcycles", tags=["motorcycles"])

mongo_url = os.environ.get("MONGO_URL")
client = MongoClient(mongo_url)
db = client[os.environ.get("DB_NAME", "shiftjet_db")]

# Pydantic models
class MotorcycleCreate(BaseModel):
    courier_id: str
    company_id: str
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
    company_id: str
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
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc)
    }
    
    result = db.motorcycles.insert_one(motorcycle)
    motorcycle["_id"] = result.inserted_id
    
    return {"message": "Motosiklet eklendi", "motorcycle": serialize_doc(motorcycle)}

# Get motorcycles for courier
@router.get("/courier/{courier_id}")
async def get_courier_motorcycles(courier_id: str):
    motorcycles = list(db.motorcycles.find({"courier_id": courier_id}).sort("created_at", -1))
    return [serialize_doc(m) for m in motorcycles]

# Get single motorcycle
@router.get("/{motorcycle_id}")
async def get_motorcycle(motorcycle_id: str):
    motorcycle = db.motorcycles.find_one({"_id": ObjectId(motorcycle_id)})
    if not motorcycle:
        raise HTTPException(status_code=404, detail="Motosiklet bulunamadı")
    return serialize_doc(motorcycle)

# Update motorcycle (brand, model, plate only - not km)
@router.put("/{motorcycle_id}")
async def update_motorcycle(motorcycle_id: str, data: MotorcycleUpdate):
    motorcycle = db.motorcycles.find_one({"_id": ObjectId(motorcycle_id)})
    if not motorcycle:
        raise HTTPException(status_code=404, detail="Motosiklet bulunamadı")
    
    update_data = {"updated_at": datetime.now(timezone.utc)}
    if data.brand is not None:
        update_data["brand"] = data.brand
    if data.model is not None:
        update_data["model"] = data.model
    if data.plate is not None:
        update_data["plate"] = data.plate.upper()
    
    db.motorcycles.update_one({"_id": ObjectId(motorcycle_id)}, {"$set": update_data})
    
    updated = db.motorcycles.find_one({"_id": ObjectId(motorcycle_id)})
    return {"message": "Motosiklet güncellendi", "motorcycle": serialize_doc(updated)}

# Delete motorcycle
@router.delete("/{motorcycle_id}")
async def delete_motorcycle(motorcycle_id: str):
    motorcycle = db.motorcycles.find_one({"_id": ObjectId(motorcycle_id)})
    if not motorcycle:
        raise HTTPException(status_code=404, detail="Motosiklet bulunamadı")
    
    # Delete motorcycle and its maintenance history
    db.motorcycles.delete_one({"_id": ObjectId(motorcycle_id)})
    db.motorcycle_maintenances.delete_many({"motorcycle_id": ObjectId(motorcycle_id)})
    
    return {"message": "Motosiklet silindi"}

# Add maintenance record
@router.post("/maintenance")
async def add_maintenance(data: MaintenanceCreate):
    motorcycle = db.motorcycles.find_one({"_id": ObjectId(data.motorcycle_id)})
    if not motorcycle:
        raise HTTPException(status_code=404, detail="Motosiklet bulunamadı")
    
    # Validate km - must be >= current_km
    if data.km_at_maintenance < motorcycle["current_km"]:
        raise HTTPException(status_code=400, detail="Kilometre mevcut km'den düşük olamaz")
    
    # At least one maintenance type must be selected
    if not (data.oil_change or data.brake_maintenance or data.variator_maintenance):
        raise HTTPException(status_code=400, detail="En az bir bakım türü seçilmeli")
    
    now = datetime.now(timezone.utc)
    
    # Create maintenance record
    maintenance = {
        "motorcycle_id": ObjectId(data.motorcycle_id),
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

# Check maintenance notifications for courier
@router.get("/notifications/{courier_id}")
async def get_maintenance_notifications(courier_id: str):
    motorcycles = list(db.motorcycles.find({"courier_id": courier_id}))
    
    notifications = []
    now = datetime.now(timezone.utc)
    
    for moto in motorcycles:
        moto_notifications = []
        
        # Check oil maintenance (10 days)
        if moto.get("last_oil_date"):
            days_since_oil = (now - moto["last_oil_date"]).days
            if days_since_oil >= 10:
                moto_notifications.append({
                    "type": "oil",
                    "label": "Yağ Bakımı",
                    "days_overdue": days_since_oil - 10,
                    "last_date": moto["last_oil_date"].isoformat(),
                    "last_km": moto.get("last_oil_km"),
                    "next_km": (moto.get("last_oil_km") or 0) + 2000
                })
        
        # Check brake maintenance (10 days)
        if moto.get("last_brake_date"):
            days_since_brake = (now - moto["last_brake_date"]).days
            if days_since_brake >= 10:
                moto_notifications.append({
                    "type": "brake",
                    "label": "Fren Bakımı",
                    "days_overdue": days_since_brake - 10,
                    "last_date": moto["last_brake_date"].isoformat(),
                    "last_km": moto.get("last_brake_km"),
                    "next_km": (moto.get("last_brake_km") or 0) + 2000
                })
        
        # Check variator maintenance (25 days)
        if moto.get("last_variator_date"):
            days_since_variator = (now - moto["last_variator_date"]).days
            if days_since_variator >= 25:
                moto_notifications.append({
                    "type": "variator",
                    "label": "Kayış/Varyatör Bakımı",
                    "days_overdue": days_since_variator - 25,
                    "last_date": moto["last_variator_date"].isoformat(),
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
        "dismissed_at": datetime.now(timezone.utc)
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
        dismissed_map[key] = d["dismissed_at"]
    
    notifications = []
    now = datetime.now(timezone.utc)
    
    for moto in motorcycles:
        moto_id = str(moto["_id"])
        moto_notifications = []
        
        # Check oil maintenance (10 days)
        if moto.get("last_oil_date"):
            days_since_oil = (now - moto["last_oil_date"]).days
            if days_since_oil >= 10:
                key = f"{moto['_id']}_oil"
                # Check if dismissed after last maintenance
                if key not in dismissed_map or dismissed_map[key] < moto["last_oil_date"]:
                    moto_notifications.append({
                        "type": "oil",
                        "label": "Yağ Bakımı",
                        "days_overdue": days_since_oil - 10
                    })
        
        # Check brake maintenance (10 days)
        if moto.get("last_brake_date"):
            days_since_brake = (now - moto["last_brake_date"]).days
            if days_since_brake >= 10:
                key = f"{moto['_id']}_brake"
                if key not in dismissed_map or dismissed_map[key] < moto["last_brake_date"]:
                    moto_notifications.append({
                        "type": "brake",
                        "label": "Fren Bakımı",
                        "days_overdue": days_since_brake - 10
                    })
        
        # Check variator maintenance (25 days)
        if moto.get("last_variator_date"):
            days_since_variator = (now - moto["last_variator_date"]).days
            if days_since_variator >= 25:
                key = f"{moto['_id']}_variator"
                if key not in dismissed_map or dismissed_map[key] < moto["last_variator_date"]:
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
