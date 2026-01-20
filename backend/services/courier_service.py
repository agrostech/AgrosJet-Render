from datetime import datetime, timezone, timedelta
import uuid
from utils.database import db
from utils.helpers import hash_password, format_name


async def invalidate_user_session(user_id: str):
    """Invalidate user session"""
    await db.invalidated_sessions.update_one(
        {"user_id": user_id},
        {"$set": {
            "user_id": user_id,
            "invalidated_at": datetime.now(timezone.utc).isoformat()
        }},
        upsert=True
    )


async def get_all_couriers():
    """Get all couriers in the system"""
    return await db.couriers.find({}, {"_id": 0, "password": 0}).to_list(1000)


async def search_courier_by_phone(phone: str):
    """Search courier by phone number"""
    return await db.couriers.find_one({"phone": phone}, {"_id": 0, "password": 0})


async def get_company_couriers(company_id: str, include_inactive: bool = False, include_archived: bool = False):
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
            courier["termination_start_date"] = rel.get("termination_start_date")
            courier["termination_end_date"] = rel.get("termination_end_date")
            
            if rel.get("termination_end_date"):
                end_date = datetime.fromisoformat(rel["termination_end_date"].replace("Z", "+00:00"))
                now = datetime.now(timezone.utc)
                remaining = (end_date - now).days
                courier["termination_remaining_days"] = max(0, remaining)
            
            couriers.append(courier)
    
    return couriers


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


async def add_courier_to_company(company_id: str, phone: str):
    """Add a courier to company by phone number"""
    company = await db.companies.find_one({"id": company_id})
    if not company:
        return None, "Şirket bulunamadı"
    
    courier = await db.couriers.find_one({"phone": phone})
    if not courier:
        return None, "Bu telefon numarasına ait kurye bulunamadı"
    
    existing = await db.company_couriers.find_one({
        "company_id": company_id,
        "courier_id": courier["id"]
    })
    
    if existing:
        if existing.get("is_archived"):
            await db.company_couriers.update_one(
                {"id": existing["id"]},
                {"$set": {"is_archived": False}}
            )
            return {"message": "Kurye arşivden çıkarıldı", "courier_name": courier["name"]}, None
        return None, "Bu kurye zaten şirketinize ekli"
    
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
    return {"message": "Kurye şirkete eklendi", "courier_name": courier["name"]}, None


async def update_courier(courier_id: str, name: str = None, phone: str = None, plate: str = None, address: str = None, password: str = None):
    """Update courier info"""
    courier = await db.couriers.find_one({"id": courier_id})
    if not courier:
        return None, "Kurye bulunamadı"
    
    update_data = {}
    if name:
        update_data["name"] = format_name(name)
    if phone:
        existing = await db.couriers.find_one({"phone": phone})
        if existing and existing["id"] != courier_id:
            return None, "Bu telefon numarası başka bir kurye tarafından kullanılıyor"
        update_data["phone"] = phone
    if plate:
        update_data["plate"] = plate.upper()
    if address is not None:
        update_data["address"] = address
    if password:
        update_data["password"] = hash_password(password)
    
    if not update_data:
        return None, "Güncellenecek veri yok"
    
    await db.couriers.update_one({"id": courier_id}, {"$set": update_data})
    
    if password:
        await invalidate_user_session(courier_id)
    
    return {"message": "Kurye güncellendi", "password_changed": bool(password)}, None


async def check_courier_balance(courier_id: str):
    """Check courier's balance from transactions"""
    transactions = await db.transactions.find({
        "entity_type": "courier",
        "entity_id": courier_id
    }).to_list(10000)
    
    balance = 0
    for t in transactions:
        if t["type"] == "payment_in":  # Kuryeden alınan
            balance += t["amount"]
        else:  # payment_out - Kuryeye verilen
            balance -= t["amount"]
    
    return balance


async def check_courier_zimmet(courier_id: str):
    """Check if courier has any assigned zimmet products"""
    return await db.products.find_one({
        "assigned_to_courier_id": courier_id
    })


async def deactivate_courier(company_id: str, courier_id: str):
    """Deactivate a courier"""
    # Check zimmet
    active_zimmet = await check_courier_zimmet(courier_id)
    if active_zimmet:
        return None, "Bu kuryenin üzerinde zimmetli ürün bulunuyor"
    
    # Check balance
    balance = await check_courier_balance(courier_id)
    if balance != 0:
        balance_text = f"{abs(balance):.2f} TL"
        if balance > 0:
            return None, f"Bu kuryenin {balance_text} alacağı bulunuyor"
        return None, f"Bu kuryenin {balance_text} borcu bulunuyor"
    
    result = await db.company_couriers.update_one(
        {"company_id": company_id, "courier_id": courier_id},
        {"$set": {
            "is_active": False,
            "deactivated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    if result.matched_count == 0:
        return None, "Kayıt bulunamadı"
    return {"message": "Kurye pasife alındı"}, None


async def activate_courier(company_id: str, courier_id: str):
    """Activate a courier"""
    result = await db.company_couriers.update_one(
        {"company_id": company_id, "courier_id": courier_id},
        {"$set": {"is_active": True, "deactivated_at": None}}
    )
    
    if result.matched_count == 0:
        return None, "Kayıt bulunamadı"
    return {"message": "Kurye aktife alındı"}, None


async def remove_courier_from_company(company_id: str, courier_id: str):
    """Remove courier from company"""
    # Check zimmet
    assigned_products = await db.products.find({
        "company_id": company_id,
        "assigned_to_courier_id": courier_id
    }).to_list(100)
    
    if assigned_products:
        product_names = ", ".join([p["name"] for p in assigned_products[:3]])
        if len(assigned_products) > 3:
            product_names += f" ve {len(assigned_products) - 3} ürün daha"
        return None, f"Bu kuryede {len(assigned_products)} zimmetli ürün var: {product_names}"
    
    result = await db.company_couriers.delete_one({
        "company_id": company_id,
        "courier_id": courier_id
    })
    
    if result.deleted_count == 0:
        return None, "Kayıt bulunamadı"
    return {"message": "Kurye şirketten çıkarıldı"}, None


async def start_termination(company_id: str, courier_id: str):
    """Start 15-day termination period"""
    relation = await db.company_couriers.find_one({
        "company_id": company_id,
        "courier_id": courier_id,
        "status": "approved"
    })
    
    if not relation:
        return None, "Kurye bulunamadı"
    
    if relation.get("termination_start_date"):
        return None, "Fesih süreci zaten başlatılmış"
    
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
    }, None


async def cancel_termination(company_id: str, courier_id: str):
    """Cancel termination process"""
    relation = await db.company_couriers.find_one({
        "company_id": company_id,
        "courier_id": courier_id
    })
    
    if not relation:
        return None, "Kurye bulunamadı"
    
    if not relation.get("termination_start_date"):
        return None, "Aktif fesih süreci bulunmuyor"
    
    await db.company_couriers.update_one(
        {"company_id": company_id, "courier_id": courier_id},
        {"$unset": {
            "termination_start_date": "",
            "termination_end_date": "",
            "termination_started_at": ""
        }}
    )
    
    return {"message": "Fesih süreci iptal edildi"}, None


async def get_termination_status(company_id: str, courier_id: str):
    """Get termination status for a courier"""
    relation = await db.company_couriers.find_one({
        "company_id": company_id,
        "courier_id": courier_id
    }, {"_id": 0})
    
    if not relation or not relation.get("termination_start_date"):
        return {"has_termination": False}
    
    end_date = datetime.fromisoformat(relation["termination_end_date"].replace("Z", "+00:00"))
    now = datetime.now(timezone.utc)
    remaining_days = max(0, (end_date - now).days)
    
    return {
        "has_termination": True,
        "start_date": relation["termination_start_date"],
        "end_date": relation["termination_end_date"],
        "remaining_days": remaining_days
    }
