from fastapi import APIRouter, HTTPException, Header
from typing import Optional
from datetime import datetime, timezone
import uuid

from utils.database import db
from routers.jetpuan import calculate_and_credit_points, calculate_and_debit_points
from routers.notifications import create_notification
from models.schemas import (
    BusinessCreate,
    VendorCreate,
    TransactionCreate,
    TransactionDeleteRequest,
    TransactionUpdateRequest,
    InstallmentProductCreate,
    InstallmentPayRequest
)
from services.accounting_service import (
    get_entity_name,
    get_entity_transactions,
    calculate_total_balance,
    calculate_balance_breakdown,
    parse_custom_date
)

router = APIRouter(prefix="/api", tags=["Muhasebe"])


# --- Helper Function ---
async def get_admin_role(admin_id: str) -> str:
    """Admin ID'den rol bilgisini al"""
    if not admin_id:
        return "admin"
    admin = await db.admins.find_one({"id": admin_id}, {"_id": 0, "role": 1})
    return admin.get("role", "admin") if admin else "admin"


# --- Activity Logs Helper ---
async def create_activity_log(log_data: dict):
    """Helper to create activity log"""
    # Admin rolünü al
    admin_id = log_data.get("admin_id", "")
    admin_role = await get_admin_role(admin_id)
    
    log = {
        "id": str(uuid.uuid4()),
        **log_data,
        "admin_role": admin_role,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.activity_logs.insert_one(log)
    
    # Create notification for activity log
    # Superadmin kendi işlemlerinde bildirim almaz
    if admin_role == "superadmin":
        return log
    
    try:
        action = log_data.get("action", "")
        entity_name = log_data.get("entity_name", "")
        admin_name = log_data.get("admin_name", "")
        
        # Map action to notification
        notification_map = {
            "transaction_created": ("muhasebe_hareket", "Yeni İşlem", f"{admin_name} tarafından {entity_name} için yeni işlem eklendi."),
            "transaction_deleted": ("muhasebe_hareket", "İşlem Silindi", f"{admin_name} tarafından {entity_name} için işlem silindi."),
            "transaction_updated": ("muhasebe_hareket", "İşlem Güncellendi", f"{admin_name} tarafından {entity_name} için işlem güncellendi."),
        }
        
        if action in notification_map:
            notif_type, title, message = notification_map[action]
            await create_notification(
                company_id=log_data.get("company_id"),
                notification_type=notif_type,
                title=title,
                message=message,
                entity_type=log_data.get("entity_type"),
                entity_id=log_data.get("entity_id")
            )
    except Exception as e:
        print(f"Notification creation failed: {e}")
    
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
    # GET işlemi - yetki kontrolü yok
    query = {"company_id": company_id}
    if not include_archived:
        query["is_archived"] = {"$ne": True}
    businesses = await db.businesses.find(query, {"_id": 0}).to_list(500)
    return businesses

@router.post("/companies/{company_id}/businesses")
async def create_business(
    company_id: str, 
    data: BusinessCreate
):
    """Create a new business"""
    business = {
        "id": str(uuid.uuid4()),
        "name": data.name,
        "phone": data.phone,
        "address": data.address,
        "tax_bracket": data.tax_bracket if hasattr(data, 'tax_bracket') and data.tax_bracket else None,
        "company_id": company_id,
        "is_archived": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.businesses.insert_one(business)
    return {"message": "İşletme oluşturuldu", "id": business["id"]}


@router.put("/businesses/{business_id}")
async def update_business(business_id: str, data: dict):
    """Update a business"""
    update_fields = {}
    if "name" in data:
        update_fields["name"] = data["name"]
    if "phone" in data:
        update_fields["phone"] = data["phone"]
    if "address" in data:
        update_fields["address"] = data["address"]
    if "tax_bracket" in data:
        update_fields["tax_bracket"] = data["tax_bracket"]
    
    if not update_fields:
        raise HTTPException(status_code=400, detail="Güncellenecek alan belirtilmedi")
    
    result = await db.businesses.update_one(
        {"id": business_id},
        {"$set": update_fields}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="İşletme bulunamadı")
    return {"message": "İşletme güncellendi"}

@router.put("/businesses/{business_id}/archive")
async def archive_business(
    business_id: str
):
    """Archive a business"""
    result = await db.businesses.update_one(
        {"id": business_id},
        {"$set": {"is_archived": True}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="İşletme bulunamadı")
    return {"message": "İşletme arşivlendi"}

@router.put("/businesses/{business_id}/unarchive")
async def unarchive_business(
    business_id: str
):
    """Unarchive a business"""
    result = await db.businesses.update_one(
        {"id": business_id},
        {"$set": {"is_archived": False}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="İşletme bulunamadı")
    return {"message": "İşletme arşivden çıkarıldı"}

@router.delete("/businesses/{business_id}")
async def delete_business(
    business_id: str
):
    """Delete a business"""
    result = await db.businesses.delete_one({"id": business_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="İşletme bulunamadı")
    return {"message": "İşletme silindi"}


# --- Cariler (Vendors) ---
@router.get("/companies/{company_id}/vendors")
async def get_vendors(company_id: str, include_archived: bool = False):
    """Get all vendors for a company"""
    # GET işlemi - yetki kontrolü yok
    query = {"company_id": company_id}
    if not include_archived:
        query["is_archived"] = {"$ne": True}
    vendors = await db.vendors.find(query, {"_id": 0}).to_list(500)
    return vendors

@router.post("/companies/{company_id}/vendors")
async def create_vendor(
    company_id: str, 
    data: VendorCreate
):
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
async def archive_vendor(
    vendor_id: str
):
    """Archive a vendor"""
    result = await db.vendors.update_one(
        {"id": vendor_id},
        {"$set": {"is_archived": True}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Cari bulunamadı")
    return {"message": "Cari arşivlendi"}

@router.put("/vendors/{vendor_id}/unarchive")
async def unarchive_vendor(
    vendor_id: str
):
    """Unarchive a vendor"""
    result = await db.vendors.update_one(
        {"id": vendor_id},
        {"$set": {"is_archived": False}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Cari bulunamadı")
    return {"message": "Cari arşivden çıkarıldı"}

@router.delete("/vendors/{vendor_id}")
async def delete_vendor(
    vendor_id: str
):
    """Delete a vendor"""
    result = await db.vendors.delete_one({"id": vendor_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Cari bulunamadı")
    return {"message": "Cari silindi"}


# --- İşlemler (Transactions) ---
@router.post("/transactions")
async def create_transaction(
    data: TransactionCreate
):
    """Create a new transaction"""
    created_at = parse_custom_date(data.custom_date)
    
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
    entity_name = await get_entity_name(data.entity_type, data.entity_id)
    
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
    
    # Auto-credit JetPuan for hakediş transactions (payment_in to courier - kırmızı buton)
    # Sadece add_jetpuan=True ise JetPuan eklenir
    if data.entity_type == "courier" and data.is_hakedis and data.type == "payment_in" and data.add_jetpuan:
        try:
            jetpuan_amount = await calculate_and_credit_points(data.entity_id, data.amount)
            if jetpuan_amount > 0:
                # Log the JetPuan credit
                if data.admin_id and data.admin_name:
                    await create_activity_log({
                        "company_id": data.company_id,
                        "admin_id": data.admin_id,
                        "admin_name": data.admin_name,
                        "action": "jetpuan_credited",
                        "entity_type": "courier",
                        "entity_id": data.entity_id,
                        "entity_name": entity_name,
                        "details": {
                            "hakedis_amount": data.amount,
                            "jetpuan_amount": jetpuan_amount
                        }
                    })
        except Exception as e:
            # Don't fail the transaction if JetPuan credit fails
            print(f"JetPuan credit failed: {e}")
    
    return {"message": "İşlem kaydedildi", "id": transaction["id"]}


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
async def delete_transaction(
    transaction_id: str, 
    data: TransactionDeleteRequest = None
):
    """Delete a transaction"""
    transaction = await db.transactions.find_one({"id": transaction_id}, {"_id": 0})
    if not transaction:
        raise HTTPException(status_code=404, detail="İşlem bulunamadı")
    
    # Get entity name for log
    entity_name = await get_entity_name(transaction["entity_type"], transaction["entity_id"])
    
    # If this was a hakediş transaction for a courier, debit JetPuan
    if transaction["entity_type"] == "courier" and transaction.get("is_hakedis") and transaction["type"] == "payment_in":
        try:
            await calculate_and_debit_points(transaction["entity_id"], transaction["amount"])
        except Exception as e:
            print(f"JetPuan debit failed: {e}")
    
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


@router.put("/transactions/{transaction_id}")
async def update_transaction(
    transaction_id: str, 
    data: TransactionUpdateRequest
):
    """Update a transaction"""
    transaction = await db.transactions.find_one({"id": transaction_id}, {"_id": 0})
    if not transaction:
        raise HTTPException(status_code=404, detail="İşlem bulunamadı")
    
    # Build update dict
    update_fields = {}
    if data.amount is not None and data.amount > 0:
        update_fields["amount"] = data.amount
    if data.description is not None:
        update_fields["description"] = data.description
    if data.is_hakedis is not None:
        update_fields["is_hakedis"] = data.is_hakedis
    
    if not update_fields:
        raise HTTPException(status_code=400, detail="Güncellenecek alan belirtilmedi")
    
    # Update transaction
    await db.transactions.update_one(
        {"id": transaction_id},
        {"$set": update_fields}
    )
    
    # Get entity name for log
    entity_name = await get_entity_name(transaction["entity_type"], transaction["entity_id"])
    
    # Create activity log
    await create_activity_log({
        "company_id": transaction["company_id"],
        "admin_id": data.admin_id,
        "admin_name": data.admin_name,
        "action": "transaction_updated",
        "entity_type": transaction["entity_type"],
        "entity_id": transaction["entity_id"],
        "entity_name": entity_name,
        "details": {
            "transaction_id": transaction_id,
            "old_amount": transaction["amount"],
            "new_amount": update_fields.get("amount", transaction["amount"]),
            "old_description": transaction["description"],
            "new_description": update_fields.get("description", transaction["description"]),
        }
    })
    
    return {"message": "İşlem güncellendi"}


@router.get("/companies/{company_id}/accounting-summary")
async def get_accounting_summary(company_id: str):
    """Get total balances for couriers, businesses, and vendors"""
    # Get all couriers for this company (via company_couriers junction table)
    company_couriers = await db.company_couriers.find(
        {"company_id": company_id},
        {"_id": 0, "courier_id": 1}
    ).to_list(1000)
    courier_ids_from_junction = [cc["courier_id"] for cc in company_couriers]
    
    # Filter out archived couriers
    if courier_ids_from_junction:
        active_couriers = await db.couriers.find(
            {"id": {"$in": courier_ids_from_junction}, "is_archived": {"$ne": True}},
            {"_id": 0, "id": 1}
        ).to_list(1000)
        courier_ids = [c["id"] for c in active_couriers]
    else:
        courier_ids = []
    
    # Get all businesses for this company
    businesses = await db.businesses.find(
        {"company_id": company_id, "is_archived": {"$ne": True}},
        {"_id": 0, "id": 1}
    ).to_list(1000)
    business_ids = [b["id"] for b in businesses]
    
    # Get all vendors for this company
    vendors = await db.vendors.find(
        {"company_id": company_id, "is_archived": {"$ne": True}},
        {"_id": 0, "id": 1}
    ).to_list(1000)
    vendor_ids = [v["id"] for v in vendors]
    
    # Calculate balances using service helper
    courier_balance = await calculate_total_balance("courier", courier_ids)
    business_balance = await calculate_total_balance("business", business_ids)
    vendor_balance = await calculate_total_balance("vendor", vendor_ids)
    
    return {
        "couriers": {
            "balance": courier_balance,
            "count": len(courier_ids)
        },
        "businesses": {
            "balance": business_balance,
            "count": len(business_ids)
        },
        "vendors": {
            "balance": vendor_balance,
            "count": len(vendor_ids)
        }
    }



# --- Taksitli Ürün (Installment Products) ---

@router.post("/couriers/{courier_id}/installment-products")
async def create_installment_product(
    courier_id: str, 
    data: InstallmentProductCreate
):
    """Create a new installment product for a courier"""
    # Verify courier exists
    courier = await db.couriers.find_one({"id": courier_id}, {"_id": 0})
    if not courier:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")
    
    product = {
        "id": str(uuid.uuid4()),
        "courier_id": courier_id,
        "company_id": data.company_id,
        "name": data.name,
        "installment_amount": data.installment_amount,
        "installment_count": data.installment_count,
        "remaining_installments": data.installment_count,
        "total_amount": data.installment_amount * data.installment_count,
        "paid_amount": 0,
        "is_completed": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by_admin_id": data.admin_id,
        "created_by_admin_name": data.admin_name
    }
    
    await db.installment_products.insert_one(product)
    
    # Create activity log
    await create_activity_log({
        "company_id": data.company_id,
        "admin_id": data.admin_id,
        "admin_name": data.admin_name,
        "action": "installment_product_created",
        "entity_type": "courier",
        "entity_id": courier_id,
        "entity_name": courier["name"],
        "details": {
            "product_name": data.name,
            "installment_amount": data.installment_amount,
            "installment_count": data.installment_count,
            "total_amount": product["total_amount"]
        }
    })
    
    return {"message": "Taksitli ürün eklendi", "product": {k: v for k, v in product.items() if k != "_id"}}


@router.get("/couriers/{courier_id}/installment-products")
async def get_installment_products(courier_id: str, include_completed: bool = False):
    """Get all installment products for a courier"""
    query = {"courier_id": courier_id}
    if not include_completed:
        query["is_completed"] = False
    
    products = await db.installment_products.find(
        query,
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    return products


@router.delete("/installment-products/{product_id}")
async def delete_installment_product(
    product_id: str, 
    admin_id: str, 
    admin_name: str
):
    """Delete an installment product"""
    product = await db.installment_products.find_one({"id": product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Ürün bulunamadı")
    
    # Check if any payments were made
    if product["paid_amount"] > 0:
        raise HTTPException(status_code=400, detail="Ödeme yapılmış ürün silinemez")
    
    await db.installment_products.delete_one({"id": product_id})
    
    # Get courier name
    courier = await db.couriers.find_one({"id": product["courier_id"]}, {"_id": 0, "name": 1})
    
    # Create activity log
    await create_activity_log({
        "company_id": product["company_id"],
        "admin_id": admin_id,
        "admin_name": admin_name,
        "action": "installment_product_deleted",
        "entity_type": "courier",
        "entity_id": product["courier_id"],
        "entity_name": courier["name"] if courier else "Bilinmeyen",
        "details": {
            "product_name": product["name"]
        }
    })
    
    return {"message": "Ürün silindi"}


@router.post("/installment-products/{product_id}/pay")
async def pay_installment(
    product_id: str, 
    data: InstallmentPayRequest
):
    """Pay one installment for a product"""
    product = await db.installment_products.find_one({"id": product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Ürün bulunamadı")
    
    if product["remaining_installments"] <= 0:
        raise HTTPException(status_code=400, detail="Tüm taksitler ödenmiş")
    
    # Get courier
    courier = await db.couriers.find_one({"id": product["courier_id"]}, {"_id": 0})
    if not courier:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")
    
    # Calculate which installment number this is
    paid_count = product["installment_count"] - product["remaining_installments"] + 1
    
    # Determine transaction date
    if data.custom_date:
        tx_date = data.custom_date
    else:
        tx_date = datetime.now(timezone.utc).isoformat()
    
    # Create transaction (payment_out = kuryeye verilen)
    transaction = {
        "id": str(uuid.uuid4()),
        "entity_type": "courier",
        "entity_id": product["courier_id"],
        "company_id": product["company_id"],
        "type": "payment_out",  # Kuryeye verilen
        "amount": product["installment_amount"],
        "description": f"{product['name']} - Taksit {paid_count}/{product['installment_count']}",
        "is_hakedis": False,
        "admin_id": data.admin_id,
        "admin_name": data.admin_name,
        "created_at": tx_date,
        "installment_product_id": product_id  # Link to installment product
    }
    
    await db.transactions.insert_one(transaction)
    
    # Update product
    new_remaining = product["remaining_installments"] - 1
    new_paid = product["paid_amount"] + product["installment_amount"]
    is_completed = new_remaining <= 0
    
    await db.installment_products.update_one(
        {"id": product_id},
        {"$set": {
            "remaining_installments": new_remaining,
            "paid_amount": new_paid,
            "is_completed": is_completed
        }}
    )
    
    # Create activity log
    await create_activity_log({
        "company_id": product["company_id"],
        "admin_id": data.admin_id,
        "admin_name": data.admin_name,
        "action": "installment_paid",
        "entity_type": "courier",
        "entity_id": product["courier_id"],
        "entity_name": courier["name"],
        "details": {
            "product_name": product["name"],
            "installment_number": paid_count,
            "total_installments": product["installment_count"],
            "amount": product["installment_amount"],
            "remaining": new_remaining
        }
    })
    
    return {
        "message": f"Taksit {paid_count}/{product['installment_count']} alındı",
        "transaction_id": transaction["id"],
        "remaining_installments": new_remaining,
        "is_completed": is_completed
    }


# Hook into transaction deletion to restore installment count
@router.delete("/transactions/{transaction_id}/with-installment-restore")
async def delete_transaction_with_installment(
    transaction_id: str, 
    data: TransactionDeleteRequest = None
):
    """Delete a transaction and restore installment count if applicable"""
    transaction = await db.transactions.find_one({"id": transaction_id}, {"_id": 0})
    if not transaction:
        raise HTTPException(status_code=404, detail="İşlem bulunamadı")
    
    # Check if this is an installment transaction
    installment_product_id = transaction.get("installment_product_id")
    
    if installment_product_id:
        # Restore installment count
        product = await db.installment_products.find_one({"id": installment_product_id})
        if product:
            await db.installment_products.update_one(
                {"id": installment_product_id},
                {"$set": {
                    "remaining_installments": product["remaining_installments"] + 1,
                    "paid_amount": max(0, product["paid_amount"] - transaction["amount"]),
                    "is_completed": False
                }}
            )
    
    # Delete transaction
    await db.transactions.delete_one({"id": transaction_id})
    
    # Get entity name for log
    entity_name = await get_entity_name(transaction["entity_type"], transaction["entity_id"])
    
    # Create activity log
    if data:
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
                "amount": transaction["amount"],
                "description": transaction.get("description", ""),
                "installment_restored": installment_product_id is not None
            }
        })
    
    return {"message": "İşlem silindi", "installment_restored": installment_product_id is not None}
