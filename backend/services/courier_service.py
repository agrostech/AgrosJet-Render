from datetime import datetime, timezone, timedelta
import uuid
from utils.database import db
from utils.helpers import hash_password, format_name, get_turkey_now, ensure_turkey_timezone, TURKEY_TZ


async def invalidate_user_session(user_id: str):
    """Invalidate user session"""
    await db.invalidated_sessions.update_one(
        {"user_id": user_id},
        {"$set": {
            "user_id": user_id,
            "invalidated_at": get_turkey_now()
        }},
        upsert=True
    )


async def get_all_couriers():
    """Get all couriers in the system with their company names"""
    couriers = await db.couriers.find({}, {"_id": 0, "password": 0}).to_list(1000)
    
    # Get all companies for mapping
    companies = await db.companies.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(100)
    company_map = {c["id"]: c["name"] for c in companies}
    
    # Get all courier-company relations
    relations = await db.company_couriers.find({}, {"_id": 0, "courier_id": 1, "company_id": 1, "is_active": 1}).to_list(5000)
    
    # Group relations by courier
    courier_companies = {}
    courier_active_status = {}
    for rel in relations:
        cid = rel["courier_id"]
        if cid not in courier_companies:
            courier_companies[cid] = []
            courier_active_status[cid] = True
        company_name = company_map.get(rel["company_id"])
        if company_name:
            courier_companies[cid].append(company_name)
        # If any relation is inactive, mark courier as inactive
        if rel.get("is_active") == False:
            courier_active_status[cid] = False
    
    # Enrich couriers with company names
    for courier in couriers:
        courier["company_names"] = courier_companies.get(courier["id"], [])
        courier["is_active"] = courier_active_status.get(courier["id"], True)
    
    return couriers


async def search_courier_by_phone(phone: str):
    """Search courier by phone number"""
    # Telefon numarasını normalize et
    phone = phone.strip()
    if not phone.startswith("0"):
        phone = "0" + phone
    
    return await db.couriers.find_one({"phone": phone}, {"_id": 0, "password": 0})


async def get_company_couriers(company_id: str, include_inactive: bool = False, include_archived: bool = False):
    """Get couriers assigned to a specific company"""
    query = {"company_id": company_id}
    if not include_archived:
        query["is_archived"] = {"$ne": True}
    if not include_inactive:
        query["is_active"] = {"$ne": False}
    
    relations = await db.company_couriers.find(query, {"_id": 0}).to_list(1000)
    
    if not relations:
        return []
    
    # Batch query - tüm kuryeleri tek sorguda al (N+1 problemi çözümü)
    courier_ids = [rel["courier_id"] for rel in relations]
    couriers_cursor = await db.couriers.find(
        {"id": {"$in": courier_ids}}, 
        {"_id": 0, "password": 0}
    ).to_list(1000)
    couriers_dict = {c["id"]: c for c in couriers_cursor}
    
    couriers = []
    for rel in relations:
        courier = couriers_dict.get(rel["courier_id"])
        if courier:
            courier = courier.copy()  # Orijinali değiştirme
            courier["company_status"] = rel.get("status", "active")
            courier["is_archived"] = rel.get("is_archived", False)
            courier["is_active"] = rel.get("is_active", True)
            courier["termination_start_date"] = rel.get("termination_start_date")
            courier["termination_end_date"] = rel.get("termination_end_date")
            
            if rel.get("termination_end_date"):
                end_date = datetime.fromisoformat(rel["termination_end_date"].replace("Z", "+00:00"))
                now = datetime.now(TURKEY_TZ)
                remaining = (end_date - now).days
                courier["termination_remaining_days"] = max(0, remaining)
            
            couriers.append(courier)
    
    return couriers


async def get_inactive_company_couriers(company_id: str):
    """Get inactive couriers assigned to a specific company"""
    query = {"company_id": company_id, "is_active": False, "is_archived": {"$ne": True}}
    relations = await db.company_couriers.find(query, {"_id": 0}).to_list(1000)
    
    if not relations:
        return []
    
    # Batch query - tüm kuryeleri tek sorguda al
    courier_ids = [rel["courier_id"] for rel in relations]
    couriers_cursor = await db.couriers.find(
        {"id": {"$in": courier_ids}}, 
        {"_id": 0, "password": 0}
    ).to_list(1000)
    couriers_dict = {c["id"]: c for c in couriers_cursor}
    
    couriers = []
    for rel in relations:
        courier = couriers_dict.get(rel["courier_id"])
        if courier:
            courier = courier.copy()
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
        "created_at": get_turkey_now()
    }
    await db.company_couriers.insert_one(relation)
    # Kurye dökümanında company_id yoksa set et + document_process_completed default false
    update_fields = {}
    if not courier.get("company_id"):
        update_fields["company_id"] = company_id
    if "document_process_completed" not in courier:
        update_fields["document_process_completed"] = False
    if update_fields:
        await db.couriers.update_one({"id": courier["id"]}, {"$set": update_fields})
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
    """Check courier's balance from transactions using aggregation"""
    pipeline = [
        {"$match": {"entity_type": "courier", "entity_id": courier_id}},
        {"$group": {
            "_id": None,
            "total_in": {"$sum": {"$cond": [{"$eq": ["$type", "payment_in"]}, "$amount", 0]}},
            "total_out": {"$sum": {"$cond": [{"$eq": ["$type", "payment_out"]}, "$amount", 0]}}
        }}
    ]
    result = await db.transactions.aggregate(pipeline).to_list(1)
    if result:
        return result[0]["total_in"] - result[0]["total_out"]
    return 0


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
    
    now = get_turkey_now()
    
    result = await db.company_couriers.update_one(
        {"company_id": company_id, "courier_id": courier_id},
        {"$set": {
            "is_active": False,
            "deactivated_at": now,
            "forced_logout_at": now  # Frontend bu timestamp'i kontrol edecek
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


async def start_termination(company_id: str, courier_id: str, start_date: str = None):
    """Start 15-day termination period"""
    # Önce ilişkiyi bul (status kontrolü yapmadan)
    relation = await db.company_couriers.find_one({
        "company_id": company_id,
        "courier_id": courier_id
    })
    
    if not relation:
        return None, "Kurye bu şirkete kayıtlı değil"
    
    # Status kontrolü - approved veya status alanı yoksa devam et
    status = relation.get("status")
    if status and status not in ["approved", "active"]:
        return None, f"Kurye durumu uygun değil (durum: {status})"
    
    if relation.get("termination_start_date"):
        return None, "Fesih süreci zaten başlatılmış"
    
    now = datetime.now(TURKEY_TZ)
    
    if start_date:
        try:
            parsed = datetime.fromisoformat(start_date)
            term_start = parsed.replace(hour=0, minute=0, second=0, microsecond=0, tzinfo=TURKEY_TZ)
        except (ValueError, TypeError):
            return None, "Geçersiz tarih formatı"
        
        # En fazla 15 gün geriye izin ver
        today = now.replace(hour=0, minute=0, second=0, microsecond=0)
        diff = (today - term_start).days
        if diff > 15:
            return None, "En fazla 15 gün geriye fesih başlatılabilir"
    else:
        term_start = now.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
    
    end_date = term_start + timedelta(days=15)
    
    await db.company_couriers.update_one(
        {"company_id": company_id, "courier_id": courier_id},
        {"$set": {
            "termination_start_date": term_start.isoformat(),
            "termination_end_date": end_date.isoformat(),
            "termination_started_at": get_turkey_now()
        }}
    )
    
    return {
        "message": "Fesih süreci başlatıldı",
        "start_date": term_start.isoformat(),
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
    now = datetime.now(TURKEY_TZ)
    remaining_days = max(0, (end_date - now).days)
    
    return {
        "has_termination": True,
        "start_date": relation["termination_start_date"],
        "end_date": relation["termination_end_date"],
        "remaining_days": remaining_days
    }


async def archive_courier(company_id: str, courier_id: str):
    """Archive a courier - move to archived list"""
    # Check zimmet
    active_zimmet = await check_courier_zimmet(courier_id)
    if active_zimmet:
        return None, "Bu kuryenin üzerinde zimmetli ürün bulunuyor. Önce zimmeti alın."
    
    # Check balance
    balance = await check_courier_balance(courier_id)
    if balance != 0:
        balance_text = f"{abs(balance):.2f} TL"
        if balance > 0:
            return None, f"Bu kuryenin {balance_text} alacağı bulunuyor. Önce bakiyeyi sıfırlayın."
        return None, f"Bu kuryenin {balance_text} borcu bulunuyor. Önce bakiyeyi sıfırlayın."
    
    result = await db.company_couriers.update_one(
        {"company_id": company_id, "courier_id": courier_id},
        {"$set": {
            "is_archived": True,
            "archived_at": get_turkey_now()
        }}
    )
    
    if result.matched_count == 0:
        return None, "Kurye bulunamadı"
    return {"message": "Kurye arşivlendi"}, None


async def unarchive_courier(company_id: str, courier_id: str):
    """Unarchive a courier - restore from archive"""
    result = await db.company_couriers.update_one(
        {"company_id": company_id, "courier_id": courier_id, "is_archived": True},
        {"$set": {"is_archived": False, "archived_at": None}}
    )
    
    if result.matched_count == 0:
        return None, "Arşivlenmiş kurye bulunamadı"
    return {"message": "Kurye arşivden çıkarıldı"}, None


async def create_ghost_courier(company_id: str, name: str):
    """Create a ghost courier for accounting purposes - no login capability"""
    company = await db.companies.find_one({"id": company_id})
    if not company:
        return None, "Şirket bulunamadı"
    
    # Create ghost courier with unique placeholder phone
    ghost_id = str(uuid.uuid4())
    ghost_phone = f"GHOST_{ghost_id[:8]}"  # Unique placeholder, not a real phone
    
    courier = {
        "id": ghost_id,
        "name": format_name(name),
        "phone": ghost_phone,
        "address": "",
        "iban": "",
        "plate": "",
        "password": "",  # Empty password - can't login
        "status": "active",
        "is_ghost": True,  # Mark as ghost courier
        "created_at": get_turkey_now()
    }
    await db.couriers.insert_one(courier)
    
    # Add to company
    relation = {
        "id": str(uuid.uuid4()),
        "company_id": company_id,
        "courier_id": ghost_id,
        "status": "approved",
        "is_archived": False,
        "is_active": True,
        "created_at": get_turkey_now()
    }
    await db.company_couriers.insert_one(relation)
    
    return {
        "message": "Hayalet kurye oluşturuldu",
        "courier_id": ghost_id,
        "courier_name": courier["name"]
    }, None


async def merge_couriers(ghost_courier_id: str, real_courier_id: str):
    """Merge a ghost courier into a real courier - transfer all records"""
    # Validate ghost courier
    ghost = await db.couriers.find_one({"id": ghost_courier_id})
    if not ghost:
        return None, "Hayalet kurye bulunamadı"
    if not ghost.get("is_ghost"):
        return None, "Seçilen kurye bir hayalet kurye değil"
    
    # Validate real courier
    real = await db.couriers.find_one({"id": real_courier_id})
    if not real:
        return None, "Hedef kurye bulunamadı"
    if real.get("is_ghost"):
        return None, "Hedef kurye bir hayalet kurye olamaz"
    
    # Transfer all transactions
    await db.transactions.update_many(
        {"entity_type": "courier", "entity_id": ghost_courier_id},
        {"$set": {"entity_id": real_courier_id}}
    )
    
    # Transfer all invoices
    await db.invoices.update_many(
        {"courier_id": ghost_courier_id},
        {"$set": {"courier_id": real_courier_id}}
    )
    
    # Transfer courier documents
    await db.courier_documents.update_many(
        {"courier_id": ghost_courier_id},
        {"$set": {"courier_id": real_courier_id}}
    )
    
    # Transfer shift assignments
    await db.shift_assignments.update_many(
        {"courier_id": ghost_courier_id},
        {"$set": {"courier_id": real_courier_id}}
    )
    
    # Transfer daily collections
    await db.daily_collections.update_many(
        {"courier_id": ghost_courier_id},
        {"$set": {"courier_id": real_courier_id}}
    )
    
    # Transfer products (zimmet)
    await db.products.update_many(
        {"assigned_to_courier_id": ghost_courier_id},
        {"$set": {"assigned_to_courier_id": real_courier_id}}
    )
    
    # Transfer installment products
    await db.installment_products.update_many(
        {"courier_id": ghost_courier_id},
        {"$set": {"courier_id": real_courier_id}}
    )
    
    # Transfer JetPuan (if exists)
    ghost_jetpuan = await db.jetpuan_balances.find_one({"courier_id": ghost_courier_id})
    if ghost_jetpuan:
        real_jetpuan = await db.jetpuan_balances.find_one({"courier_id": real_courier_id})
        if real_jetpuan:
            # Add ghost balance to real courier
            await db.jetpuan_balances.update_one(
                {"courier_id": real_courier_id},
                {"$inc": {"balance": ghost_jetpuan.get("balance", 0)}}
            )
        else:
            # Transfer the balance record
            await db.jetpuan_balances.update_one(
                {"courier_id": ghost_courier_id},
                {"$set": {"courier_id": real_courier_id}}
            )
    
    # Get company relations for ghost and add real courier to those companies
    ghost_relations = await db.company_couriers.find({"courier_id": ghost_courier_id}).to_list(100)
    for rel in ghost_relations:
        # Check if real courier is already in that company
        existing = await db.company_couriers.find_one({
            "company_id": rel["company_id"],
            "courier_id": real_courier_id
        })
        if not existing:
            # Add real courier to company
            new_rel = {
                "id": str(uuid.uuid4()),
                "company_id": rel["company_id"],
                "courier_id": real_courier_id,
                "status": "approved",
                "is_archived": False,
                "is_active": True,
                "created_at": get_turkey_now()
            }
            await db.company_couriers.insert_one(new_rel)
    
    # Delete ghost courier relations
    await db.company_couriers.delete_many({"courier_id": ghost_courier_id})
    
    # Delete ghost courier
    await db.couriers.delete_one({"id": ghost_courier_id})
    
    return {
        "message": f"'{ghost['name']}' kuryesi '{real['name']}' kuryesiyle birleştirildi",
        "merged_courier_id": real_courier_id,
        "merged_courier_name": real["name"]
    }, None
