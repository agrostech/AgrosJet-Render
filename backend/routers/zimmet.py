from fastapi import APIRouter, HTTPException, Header, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import uuid

from utils.database import db
from utils.helpers import get_turkey_now, ensure_turkey_timezone, TURKEY_TZ
from utils.jwt_utils import require_admin, require_auth
from routers.notifications import create_notification

router = APIRouter(prefix="/api", tags=["Zimmet"], dependencies=[Depends(require_auth)])

# Ürün Tipi Modelleri
class ProductTypeCreate(BaseModel):
    name: str
    has_pos_fields: bool = False

class ProductTypeUpdate(BaseModel):
    name: Optional[str] = None
    has_pos_fields: Optional[bool] = None

# Ürün Modelleri
class ProductCreate(BaseModel):
    name: str
    product_type_id: str
    serial_number: Optional[str] = ""
    pos_serial: Optional[str] = ""
    pos_terminal: Optional[str] = ""
    notes: Optional[str] = ""

class ProductUpdate(BaseModel):
    name: Optional[str] = None
    product_type_id: Optional[str] = None
    serial_number: Optional[str] = None
    pos_serial: Optional[str] = None
    pos_terminal: Optional[str] = None
    notes: Optional[str] = None
    is_defective: Optional[bool] = None
    is_lost: Optional[bool] = None

# Zimmet İşlemi Modelleri
class ZimmetAction(BaseModel):
    courier_id: str
    courier_name: str
    admin_id: str
    admin_name: str
    notes: Optional[str] = ""

class ZimmetReturn(BaseModel):
    admin_id: str
    admin_name: str
    notes: Optional[str] = ""


# --- Helper Function ---
async def get_admin_role(admin_id: str) -> str:
    """Admin ID'den rol bilgisini al"""
    if not admin_id:
        return "admin"
    admin = await db.admins.find_one({"id": admin_id}, {"_id": 0, "role": 1})
    return admin.get("role", "admin") if admin else "admin"


async def create_zimmet_log(company_id: str, admin_id: str, admin_name: str, action: str, product_id: str, product_name: str, courier_id: Optional[str], courier_name: Optional[str], details: dict = None):
    """Zimmet log kaydı oluştur"""
    # Admin rolünü al
    admin_role = await get_admin_role(admin_id)
    
    log = {
        "id": str(uuid.uuid4()),
        "company_id": company_id,
        "admin_id": admin_id,
        "admin_name": admin_name,
        "admin_role": admin_role,
        "action": action,
        "product_id": product_id,
        "product_name": product_name,
        "courier_id": courier_id,
        "courier_name": courier_name,
        "details": details or {},
        "created_at": get_turkey_now()
    }
    await db.zimmet_logs.insert_one(log)
    
    # Create notification for zimmet log
    # Superadmin kendi işlemlerinde bildirim almaz
    if admin_role == "superadmin":
        return
    
    try:
        notification_map = {
            "assigned": ("zimmet_hareket", "Zimmet Atandı", f"{admin_name}: {product_name} → {courier_name}"),
            "unassigned": ("zimmet_hareket", "Zimmet Alındı", f"{admin_name}: {product_name} ← {courier_name}"),
            "product_created": ("zimmet_hareket", "Yeni Ürün", f"{admin_name} tarafından yeni ürün eklendi: {product_name}"),
            "product_deleted": ("zimmet_hareket", "Ürün Silindi", f"{admin_name} tarafından ürün silindi: {product_name}"),
        }
        
        if action in notification_map:
            notif_type, title, message = notification_map[action]
            await create_notification(
                company_id=company_id,
                notification_type=notif_type,
                title=title,
                message=message,
                entity_type="product",
                entity_id=product_id
            )
    except Exception as e:
        print(f"Zimmet notification failed: {e}")


# --- Ürün Tipleri Endpoint'leri ---
@router.get("/companies/{company_id}/product-types")
async def get_product_types(company_id: str):
    """Şirketin ürün tiplerini getir"""
    # GET işlemi - yetki kontrolü yok
    types = await db.product_types.find(
        {"company_id": company_id},
        {"_id": 0}
    ).sort("name", 1).to_list(100)
    return types

@router.post("/companies/{company_id}/product-types")
async def create_product_type(
    company_id: str, 
    data: ProductTypeCreate
):
    """Yeni ürün tipi oluştur"""
    product_type = {
        "id": str(uuid.uuid4()),
        "company_id": company_id,
        "name": data.name.strip(),
        "has_pos_fields": data.has_pos_fields,
        "created_at": get_turkey_now()
    }
    await db.product_types.insert_one(product_type)
    del product_type["_id"]
    return product_type

@router.put("/product-types/{type_id}")
async def update_product_type(
    type_id: str, 
    data: ProductTypeUpdate
):
    """Ürün tipini güncelle"""
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="Güncellenecek veri yok")
    
    result = await db.product_types.update_one(
        {"id": type_id},
        {"$set": update_data}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Ürün tipi bulunamadı")
    return {"message": "Güncellendi"}

@router.delete("/product-types/{type_id}")
async def delete_product_type(
    type_id: str
):
    """Ürün tipini sil (ürün yoksa)"""
    product_count = await db.products.count_documents({"product_type_id": type_id})
    if product_count > 0:
        raise HTTPException(status_code=400, detail=f"Bu tipte {product_count} ürün var, önce ürünleri silin")
    
    result = await db.product_types.delete_one({"id": type_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Ürün tipi bulunamadı")
    return {"message": "Silindi"}


# --- Ürünler Endpoint'leri ---
@router.get("/companies/{company_id}/products")
async def get_products(company_id: str, skip: int = 0, limit: int = 50):
    """Şirketin zimmet ürünlerini getir (pagination)
    
    Not: restaurant_id alanı olan ürünler restoran menü ürünleridir,
    zimmet ürünleri değildir.
    """
    # GET işlemi - yetki kontrolü yok
    # restaurant_id olmayan zimmet ürünlerini filtrele
    query = {
        "company_id": company_id,
        "restaurant_id": {"$exists": False}
    }
    total = await db.products.count_documents(query)
    
    products = await db.products.find(
        query,
        {"_id": 0}
    ).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    return {
        "products": products,
        "total_count": total,
        "has_more": skip + limit < total
    }

@router.get("/products/{product_id}")
async def get_product(product_id: str):
    """Tek ürün detayı"""
    product = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Ürün bulunamadı")
    return product

@router.post("/companies/{company_id}/products")
async def create_product(
    company_id: str, 
    data: ProductCreate, 
    admin_id: str = "", 
    admin_name: str = ""
):
    """Yeni ürün oluştur"""
    product_type = await db.product_types.find_one({"id": data.product_type_id})
    if not product_type:
        raise HTTPException(status_code=400, detail="Geçersiz ürün tipi")
    
    product = {
        "id": str(uuid.uuid4()),
        "company_id": company_id,
        "name": data.name.strip(),
        "product_type_id": data.product_type_id,
        "product_type_name": product_type["name"],
        "serial_number": data.serial_number or "",
        "pos_serial": data.pos_serial or "",
        "pos_terminal": data.pos_terminal or "",
        "notes": data.notes or "",
        "is_defective": False,
        "is_lost": False,
        "assigned_to_courier_id": None,
        "assigned_to_courier_name": None,
        "assigned_at": None,
        "created_at": get_turkey_now()
    }
    await db.products.insert_one(product)
    
    if admin_id:
        await create_zimmet_log(company_id, admin_id, admin_name, "product_created", product["id"], product["name"], None, None, {
            "product_type": product_type["name"],
            "serial_number": data.serial_number or "",
            "pos_serial": data.pos_serial or "",
            "pos_terminal": data.pos_terminal or ""
        })
    
    del product["_id"]
    return product

@router.put("/products/{product_id}")
async def update_product(
    product_id: str, 
    data: ProductUpdate, 
    admin_id: str = "", 
    admin_name: str = ""
):
    """Ürünü güncelle"""
    product = await db.products.find_one({"id": product_id})
    if not product:
        raise HTTPException(status_code=404, detail="Ürün bulunamadı")
    
    update_data = {}
    changes = []
    
    field_labels = {
        "name": "Ad",
        "serial_number": "Seri No",
        "pos_serial": "POS Seri No",
        "pos_terminal": "Terminal No",
        "notes": "Notlar"
    }
    
    for key, value in data.model_dump().items():
        if value is not None:
            if key == "product_type_id":
                product_type = await db.product_types.find_one({"id": value})
                if product_type:
                    update_data["product_type_id"] = value
                    update_data["product_type_name"] = product_type["name"]
                    if product.get("product_type_id") != value:
                        changes.append(f"Tip: {product_type['name']}")
            elif key == "is_defective":
                update_data[key] = value
                if product.get("is_defective") != value:
                    changes.append("Arızalı" if value else "Arıza kaldırıldı")
            elif key == "is_lost":
                update_data[key] = value
                if product.get("is_lost") != value:
                    changes.append("Kayıp" if value else "Kayıp kaldırıldı")
            elif key in field_labels:
                old_value = product.get(key, "")
                if old_value != value:
                    update_data[key] = value
                    label = field_labels[key]
                    if old_value:
                        changes.append(f"{label}: {old_value} → {value}")
                    else:
                        changes.append(f"{label}: {value}")
                else:
                    update_data[key] = value
            else:
                update_data[key] = value
    
    if not update_data:
        raise HTTPException(status_code=400, detail="Güncellenecek veri yok")
    
    await db.products.update_one({"id": product_id}, {"$set": update_data})
    
    if admin_id and changes:
        await create_zimmet_log(
            product["company_id"], admin_id, admin_name, 
            "product_updated", product_id, product["name"],
            product.get("assigned_to_courier_id"), product.get("assigned_to_courier_name"),
            {"changes": ", ".join(changes)}
        )
    
    return {"message": "Güncellendi"}

@router.delete("/products/{product_id}")
async def delete_product(
    product_id: str, 
    admin_id: str = "", 
    admin_name: str = ""
):
    """Ürünü sil (zimmetli değilse)"""
    product = await db.products.find_one({"id": product_id})
    if not product:
        raise HTTPException(status_code=404, detail="Ürün bulunamadı")
    
    if product.get("assigned_to_courier_id"):
        raise HTTPException(status_code=400, detail="Zimmetli ürün silinemez, önce zimmeti geri alın")
    
    await db.products.delete_one({"id": product_id})
    await db.zimmet_logs.delete_many({"product_id": product_id})
    
    if admin_id:
        await create_zimmet_log(
            product["company_id"], admin_id, admin_name,
            "product_deleted", None, product["name"],
            None, None, {
                "serial_number": product.get("serial_number", ""),
                "pos_serial": product.get("pos_serial", ""),
                "pos_terminal": product.get("pos_terminal", ""),
                "product_type": product.get("product_type_name", "")
            }
        )
    
    return {"message": "Silindi"}


# --- Zimmet İşlemleri ---
@router.post("/products/{product_id}/assign")
async def assign_product(
    product_id: str, 
    data: ZimmetAction
):
    """Ürünü kuryeye zimmetle"""
    product = await db.products.find_one({"id": product_id})
    if not product:
        raise HTTPException(status_code=404, detail="Ürün bulunamadı")
    
    if product.get("assigned_to_courier_id"):
        raise HTTPException(status_code=400, detail=f"Ürün zaten {product['assigned_to_courier_name']}'a zimmetli")
    
    if product.get("is_lost"):
        raise HTTPException(status_code=400, detail="Kayıp ürün zimmetlenemez")
    
    courier = await db.couriers.find_one({"id": data.courier_id})
    if not courier:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")
    
    assigned_at = get_turkey_now()
    
    await db.products.update_one(
        {"id": product_id},
        {"$set": {
            "assigned_to_courier_id": data.courier_id,
            "assigned_to_courier_name": data.courier_name,
            "assigned_at": assigned_at
        }}
    )
    
    await create_zimmet_log(
        product["company_id"], data.admin_id, data.admin_name,
        "assigned", product_id, product["name"],
        data.courier_id, data.courier_name,
        {
            "serial_number": product.get("serial_number", ""),
            "pos_serial": product.get("pos_serial", ""),
            "pos_terminal": product.get("pos_terminal", ""),
            "notes": data.notes
        }
    )
    
    return {"message": f"Ürün {data.courier_name}'a zimmetlendi", "assigned_at": assigned_at}

@router.post("/products/{product_id}/return")
async def return_product(
    product_id: str, 
    data: ZimmetReturn
):
    """Zimmeti geri al"""
    product = await db.products.find_one({"id": product_id})
    if not product:
        raise HTTPException(status_code=404, detail="Ürün bulunamadı")
    
    if not product.get("assigned_to_courier_id"):
        raise HTTPException(status_code=400, detail="Ürün zaten zimmetli değil")
    
    old_courier_id = product["assigned_to_courier_id"]
    old_courier_name = product["assigned_to_courier_name"]
    
    await db.products.update_one(
        {"id": product_id},
        {"$set": {
            "assigned_to_courier_id": None,
            "assigned_to_courier_name": None,
            "assigned_at": None
        }}
    )
    
    await create_zimmet_log(
        product["company_id"], data.admin_id, data.admin_name,
        "returned", product_id, product["name"],
        old_courier_id, old_courier_name,
        {
            "notes": data.notes,
            "serial_number": product.get("serial_number", ""),
            "pos_serial": product.get("pos_serial", ""),
            "pos_terminal": product.get("pos_terminal", "")
        }
    )
    
    return {"message": f"Zimmet {old_courier_name}'dan geri alındı"}


# --- Zimmet Logları ---
@router.get("/companies/{company_id}/zimmet-logs")
async def get_zimmet_logs(company_id: str, skip: int = 0, limit: int = 10):
    """Şirketin zimmet loglarını getir (pagination)"""
    total = await db.zimmet_logs.count_documents({"company_id": company_id})
    
    logs = await db.zimmet_logs.find(
        {"company_id": company_id},
        {"_id": 0}
    ).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    return {
        "logs": logs,
        "total_count": total,
        "has_more": skip + limit < total
    }

@router.get("/products/{product_id}/history")
async def get_product_history(product_id: str):
    """Ürünün zimmet geçmişini getir"""
    logs = await db.zimmet_logs.find(
        {"product_id": product_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return logs



# --- Kurye Bazlı Zimmet ---
@router.get("/zimmet/courier/{courier_id}/assignments")
async def get_courier_assignments(courier_id: str):
    """Kuryeye zimmetli ürünleri getir
    
    Not: Sadece zimmet ürünlerini döndürür, restoran menü ürünlerini değil.
    """
    # Get products assigned to this courier (exclude restaurant menu products)
    products = await db.products.find(
        {
            "assigned_to_courier_id": courier_id,
            "restaurant_id": {"$exists": False}
        },
        {"_id": 0}
    ).to_list(100)
    
    # Transform to assignment format
    assignments = []
    for p in products:
        assignments.append({
            "id": p["id"],
            "product_id": p["id"],
            "product_name": p["name"],
            "product_type": p.get("product_type_name", ""),
            "serial_number": p.get("serial_number", ""),
            "pos_serial": p.get("pos_serial", ""),
            "pos_terminal": p.get("pos_terminal", ""),
            "courier_id": courier_id,
            "assigned_at": p.get("assigned_at"),
            "notes": p.get("notes", ""),
            "status": "active"
        })
    
    # Get returned products from logs
    return_logs = await db.zimmet_logs.find(
        {"courier_id": courier_id, "action": "returned"},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    for log in return_logs:
        assignments.append({
            "id": log.get("id", str(uuid.uuid4())),
            "product_id": log.get("product_id"),
            "product_name": log.get("product_name", ""),
            "courier_id": courier_id,
            "assigned_at": None,
            "returned_at": log.get("created_at"),
            "notes": log.get("details", {}).get("notes", ""),
            "status": "returned"
        })
    
    return assignments
