from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel, ConfigDict
from typing import Optional, List

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
    force: bool = False  # Admin için limit kontrolünü bypass et


@router.put("/couriers/{courier_id}/availability")
async def update_courier_availability(courier_id: str, data: AvailabilityStatusUpdate):
    """Update courier availability status (active/on_break/offline)"""
    from datetime import datetime, timezone
    
    valid_statuses = ["active", "on_break", "offline"]
    if data.availability_status not in valid_statuses:
        raise HTTPException(status_code=400, detail="Geçersiz durum. active, on_break veya offline olmalı")
    
    # Kurye bilgilerini al
    courier = await db.couriers.find_one({"id": courier_id}, {"_id": 0})
    if not courier:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")
    
    current_status = courier.get("availability_status", "offline")
    now = datetime.now(timezone.utc)
    
    update_data = {"availability_status": data.availability_status}
    
    # Molaya çıkış kontrolü
    if data.availability_status == "on_break" and current_status != "on_break":
        # Mola limitini kontrol et (force=True ise admin atlaması)
        if not data.force:
            daily_break_limit = courier.get("daily_break_limit", 30)  # Varsayılan 30dk
            used_break_time = courier.get("used_break_time", 0)
            remaining = daily_break_limit - used_break_time
            
            if remaining <= 0:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Günlük mola süreniz doldu. Limit: {daily_break_limit} dakika"
                )
        
        # Mola başlangıç zamanını kaydet
        update_data["break_start_time"] = now.isoformat()
    
    # Moladan çıkış - kullanılan süreyi hesapla
    if current_status == "on_break" and data.availability_status != "on_break":
        break_start = courier.get("break_start_time")
        if break_start:
            try:
                start_time = datetime.fromisoformat(break_start.replace('Z', '+00:00'))
                elapsed_minutes = int((now - start_time).total_seconds() / 60)
                used_break_time = courier.get("used_break_time", 0) + elapsed_minutes
                update_data["used_break_time"] = used_break_time
                update_data["break_start_time"] = None
            except:
                pass
    
    result = await db.couriers.update_one(
        {"id": courier_id},
        {"$set": update_data}
    )
    
    status_labels = {"active": "Aktif", "on_break": "Molada", "offline": "Çevrimdışı"}
    return {"message": f"Kurye durumu güncellendi: {status_labels[data.availability_status]}"}


# --- Kurye Mola Limiti Ayarlama ---
class BreakLimitUpdate(BaseModel):
    daily_break_limit: int  # Dakika cinsinden


@router.put("/couriers/{courier_id}/break-limit")
async def update_courier_break_limit(courier_id: str, data: BreakLimitUpdate):
    """Kuryenin günlük mola limitini ayarla (dakika)"""
    if data.daily_break_limit < 0 or data.daily_break_limit > 480:  # Max 8 saat
        raise HTTPException(status_code=400, detail="Mola limiti 0-480 dakika arasında olmalı")
    
    result = await db.couriers.update_one(
        {"id": courier_id},
        {"$set": {"daily_break_limit": data.daily_break_limit}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")
    
    return {"message": f"Mola limiti güncellendi: {data.daily_break_limit} dakika"}


@router.get("/couriers/{courier_id}/break-status")
async def get_courier_break_status(courier_id: str):
    """Kuryenin mola durumunu ve kalan süresini al"""
    from datetime import datetime, timezone
    
    courier = await db.couriers.find_one({"id": courier_id}, {"_id": 0})
    if not courier:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")
    
    daily_break_limit = courier.get("daily_break_limit", 30)
    used_break_time = courier.get("used_break_time", 0)
    
    # Eğer şu an molada ise, geçen süreyi de ekle
    if courier.get("availability_status") == "on_break" and courier.get("break_start_time"):
        try:
            now = datetime.now(timezone.utc)
            start_time = datetime.fromisoformat(courier["break_start_time"].replace('Z', '+00:00'))
            current_break_minutes = int((now - start_time).total_seconds() / 60)
            used_break_time += current_break_minutes
        except:
            pass
    
    remaining = max(0, daily_break_limit - used_break_time)
    
    return {
        "daily_break_limit": daily_break_limit,
        "used_break_time": used_break_time,
        "remaining_break_time": remaining,
        "is_on_break": courier.get("availability_status") == "on_break"
    }


# --- Courier Location Update ---
class CourierLocationUpdate(BaseModel):
    latitude: float
    longitude: float


@router.put("/couriers/{courier_id}/location")
async def update_courier_location(courier_id: str, data: CourierLocationUpdate):
    """Update courier's current location"""
    from datetime import datetime, timezone
    
    result = await db.couriers.update_one(
        {"id": courier_id},
        {"$set": {
            "current_location": {
                "latitude": data.latitude,
                "longitude": data.longitude,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")
    
    return {"message": "Konum güncellendi"}


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


# --- Push Notification Subscription ---
class PushSubscription(BaseModel):
    endpoint: str
    keys: dict


@router.post("/couriers/{courier_id}/push-subscription")
async def save_courier_push_subscription(courier_id: str, subscription: PushSubscription):
    """Save push notification subscription for courier"""
    from services.push_notification_service import save_push_subscription
    
    await save_push_subscription(courier_id, subscription.model_dump())
    return {"message": "Push subscription kaydedildi"}


@router.delete("/couriers/{courier_id}/push-subscription")
async def delete_courier_push_subscription(courier_id: str):
    """Delete push notification subscription for courier"""
    await db.push_subscriptions.delete_one({"courier_id": courier_id})
    return {"message": "Push subscription silindi"}



# --- Kurye Ücretlendirme ---
class KmRange(BaseModel):
    min_km: float
    max_km: Optional[float] = None  # None = sınırsız (10+ km gibi)
    price: float

class CourierPricingUpdate(BaseModel):
    pricing_type: str  # "per_package" veya "per_km"
    per_package_price: Optional[float] = None
    km_ranges: Optional[List[KmRange]] = None


@router.put("/couriers/{courier_id}/pricing")
async def update_courier_pricing(courier_id: str, data: CourierPricingUpdate):
    """Kurye ücretlendirme ayarlarını güncelle"""
    courier = await db.couriers.find_one({"id": courier_id}, {"_id": 0})
    if not courier:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")
    
    if data.pricing_type not in ["per_package", "per_km"]:
        raise HTTPException(status_code=400, detail="Geçersiz ücretlendirme tipi")
    
    update_data = {"pricing_type": data.pricing_type}
    
    if data.pricing_type == "per_package":
        if data.per_package_price is None:
            raise HTTPException(status_code=400, detail="Paket başı fiyat gerekli")
        update_data["per_package_price"] = data.per_package_price
        update_data["km_ranges"] = None
    else:
        if not data.km_ranges or len(data.km_ranges) == 0:
            raise HTTPException(status_code=400, detail="KM aralıkları gerekli")
        update_data["km_ranges"] = [r.dict() for r in data.km_ranges]
        update_data["per_package_price"] = None
    
    await db.couriers.update_one(
        {"id": courier_id},
        {"$set": update_data}
    )
    
    return {"message": "Ücretlendirme güncellendi"}


@router.get("/couriers/{courier_id}/pricing")
async def get_courier_pricing(courier_id: str):
    """Kurye ücretlendirme ayarlarını getir"""
    courier = await db.couriers.find_one({"id": courier_id}, {"_id": 0, "pricing_type": 1, "per_package_price": 1, "km_ranges": 1})
    if not courier:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")
    
    return {
        "pricing_type": courier.get("pricing_type"),
        "per_package_price": courier.get("per_package_price"),
        "km_ranges": courier.get("km_ranges")
    }



# --- Kurye Ödeme Yöntemleri ---
class PaymentMethodsUpdate(BaseModel):
    allowed_payment_methods: List[str]  # ["cash", "card", "online", "meal_card", "online_meal_card"]


@router.get("/couriers/{courier_id}/payment-methods")
async def get_courier_payment_methods(courier_id: str):
    """Kuryenin taşıyabileceği ödeme yöntemlerini getir"""
    courier = await db.couriers.find_one({"id": courier_id}, {"_id": 0, "allowed_payment_methods": 1})
    if not courier:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")
    
    # Varsayılan olarak tüm ödeme yöntemleri açık
    return {
        "allowed_payment_methods": courier.get("allowed_payment_methods", ["cash", "card", "online", "meal_card", "online_meal_card"])
    }


@router.put("/couriers/{courier_id}/payment-methods")
async def update_courier_payment_methods(courier_id: str, data: PaymentMethodsUpdate):
    """Kuryenin taşıyabileceği ödeme yöntemlerini güncelle"""
    valid_methods = ["cash", "card", "online", "meal_card", "online_meal_card"]
    for method in data.allowed_payment_methods:
        if method not in valid_methods:
            raise HTTPException(status_code=400, detail=f"Geçersiz ödeme yöntemi: {method}")
    
    result = await db.couriers.update_one(
        {"id": courier_id},
        {"$set": {"allowed_payment_methods": data.allowed_payment_methods}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")
    
    return {"message": "Ödeme yöntemleri güncellendi"}
