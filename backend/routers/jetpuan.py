from fastapi import APIRouter, HTTPException, Header, Depends
from typing import Optional
from datetime import datetime, timezone, timedelta
import uuid

from utils.database import db
from utils.helpers import get_turkey_now, ensure_turkey_timezone, TURKEY_TZ
from models.schemas import (
    JetPuanCategoryCreate,
    JetPuanCategoryUpdate,
    JetPuanProductCreate,
    JetPuanProductUpdate,
    JetPuanOrderCreate,
    JetPuanSettingsUpdate
)
from services.jetpuan_service import (
    send_jetpuan_notification,
    get_puan_ratio,
    credit_points_to_courier,
    debit_points_from_courier,
    get_courier_balance,
    validate_order_stock,
    deduct_product_stock,
    restore_product_stock,
    enrich_orders_with_courier_info,
    enrich_products_with_category_names
)

from utils.jwt_utils import require_auth
router = APIRouter(prefix="/api/jetpuan", tags=["JetPuan Market"], dependencies=[Depends(require_auth)])


# ============ SETTINGS ============

@router.get("/settings")
async def get_settings():
    """Get JetPuan settings"""
    settings = await db.jetpuan_settings.find_one({"id": "puan_ratio"}, {"_id": 0})
    if not settings:
        settings = {
            "id": "puan_ratio",
            "puan_per_100tl": 1.17,
            "updated_at": get_turkey_now()
        }
        await db.jetpuan_settings.insert_one(settings)
    return settings


@router.put("/settings")
async def update_settings(
    data: JetPuanSettingsUpdate
):
    """Update JetPuan settings (admin only)"""
    await db.jetpuan_settings.update_one(
        {"id": "puan_ratio"},
        {"$set": {
            "puan_per_100tl": data.puan_per_100tl,
            "updated_at": get_turkey_now()
        }},
        upsert=True
    )
    return {"message": "Ayarlar güncellendi"}


# ============ CATEGORIES ============

@router.get("/categories")
async def get_categories():
    """Get all categories"""
    categories = await db.jetpuan_categories.find({}, {"_id": 0}).sort("name", 1).to_list(100)
    return categories


@router.post("/categories")
async def create_category(
    data: JetPuanCategoryCreate
):
    """Create a new category"""
    existing = await db.jetpuan_categories.find_one({"name": data.name})
    if existing:
        raise HTTPException(status_code=400, detail="Bu kategori zaten mevcut")
    
    category = {
        "id": str(uuid.uuid4()),
        "name": data.name,
        "created_at": get_turkey_now()
    }
    await db.jetpuan_categories.insert_one(category)
    return {"message": "Kategori oluşturuldu", "id": category["id"]}


@router.put("/categories/{category_id}")
async def update_category(
    category_id: str, 
    data: JetPuanCategoryUpdate
):
    """Update a category"""
    category = await db.jetpuan_categories.find_one({"id": category_id})
    if not category:
        raise HTTPException(status_code=404, detail="Kategori bulunamadı")
    
    update_data = {}
    if data.name:
        update_data["name"] = data.name
    
    if update_data:
        await db.jetpuan_categories.update_one({"id": category_id}, {"$set": update_data})
    return {"message": "Kategori güncellendi"}


@router.delete("/categories/{category_id}")
async def delete_category(
    category_id: str
):
    """Delete a category"""
    product_count = await db.jetpuan_products.count_documents({"category_id": category_id})
    if product_count > 0:
        raise HTTPException(status_code=400, detail=f"Bu kategoride {product_count} ürün var. Önce ürünleri silin veya taşıyın.")
    
    result = await db.jetpuan_categories.delete_one({"id": category_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Kategori bulunamadı")
    return {"message": "Kategori silindi"}


# ============ PRODUCTS ============

@router.get("/products")
async def get_products(category_id: str = None):
    """Get all products, optionally filtered by category"""
    query = {}
    if category_id:
        query["category_id"] = category_id
    
    products = await db.jetpuan_products.find(query, {"_id": 0}).sort("name", 1).to_list(500)
    products = await enrich_products_with_category_names(products)
    return products


@router.get("/products/{product_id}")
async def get_product(product_id: str):
    """Get a single product"""
    product = await db.jetpuan_products.find_one({"id": product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Ürün bulunamadı")
    return product


@router.post("/products")
async def create_product(
    data: JetPuanProductCreate
):
    """Create a new product"""
    category = await db.jetpuan_categories.find_one({"id": data.category_id})
    if not category:
        raise HTTPException(status_code=404, detail="Kategori bulunamadı")
    
    product = {
        "id": str(uuid.uuid4()),
        "name": data.name,
        "description": data.description,
        "price": data.price,
        "stock": data.stock,
        "category_id": data.category_id,
        "image_url": data.image_url,
        "created_at": get_turkey_now()
    }
    await db.jetpuan_products.insert_one(product)
    return {"message": "Ürün oluşturuldu", "id": product["id"]}


@router.put("/products/{product_id}")
async def update_product(
    product_id: str, 
    data: JetPuanProductUpdate
):
    """Update a product"""
    product = await db.jetpuan_products.find_one({"id": product_id})
    if not product:
        raise HTTPException(status_code=404, detail="Ürün bulunamadı")
    
    update_data = {}
    if data.name is not None:
        update_data["name"] = data.name
    if data.description is not None:
        update_data["description"] = data.description
    if data.price is not None:
        update_data["price"] = data.price
    if data.stock is not None:
        update_data["stock"] = data.stock
    if data.category_id is not None:
        category = await db.jetpuan_categories.find_one({"id": data.category_id})
        if not category:
            raise HTTPException(status_code=404, detail="Kategori bulunamadı")
        update_data["category_id"] = data.category_id
    if data.image_url is not None:
        update_data["image_url"] = data.image_url
    
    if update_data:
        await db.jetpuan_products.update_one({"id": product_id}, {"$set": update_data})
    return {"message": "Ürün güncellendi"}


@router.delete("/products/{product_id}")
async def delete_product(
    product_id: str
):
    """Delete a product"""
    result = await db.jetpuan_products.delete_one({"id": product_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Ürün bulunamadı")
    return {"message": "Ürün silindi"}


# ============ COURIER POINTS ============

@router.get("/balance/{courier_id}")
async def get_balance(courier_id: str):
    """Get courier's JetPuan balance"""
    balance = await get_courier_balance(courier_id)
    return {"courier_id": courier_id, "balance": balance}


@router.get("/transactions/{courier_id}")
async def get_courier_transactions(courier_id: str, limit: int = 50):
    """Get courier's JetPuan transaction history"""
    transactions = await db.jetpuan_transactions.find(
        {"courier_id": courier_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(limit)
    return transactions


@router.post("/credit/{courier_id}")
async def credit_points(courier_id: str, amount: float, description: str = "Hakediş puanı"):
    """Add points to courier's balance (called from accounting)"""
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Puan miktarı pozitif olmalı")
    
    await credit_points_to_courier(courier_id, amount, description)
    return {"message": f"{amount:.2f} JetPuan yüklendi"}


@router.post("/manual-credit/{courier_id}")
async def manual_credit(
    courier_id: str, 
    amount: float, 
    description: str = "Manuel puan ekleme"
):
    """Manually add points to courier's balance (admin)"""
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Puan miktarı pozitif olmalı")
    
    await credit_points_to_courier(courier_id, amount, description)
    return {"message": f"{amount:.2f} JetPuan eklendi"}


@router.post("/manual-debit/{courier_id}")
async def manual_debit(
    courier_id: str, 
    amount: float, 
    description: str = "Manuel puan silme"
):
    """Manually remove points from courier's balance (admin)"""
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Puan miktarı pozitif olmalı")
    
    current_balance = await get_courier_balance(courier_id)
    if current_balance < amount:
        raise HTTPException(status_code=400, detail=f"Yetersiz bakiye. Mevcut: {current_balance:.2f} JP")
    
    await debit_points_from_courier(courier_id, amount, description)
    return {"message": f"{amount:.2f} JetPuan silindi"}


# ============ ORDERS ============

@router.get("/orders/admin")
async def get_all_orders(
    status: str = None,
    company_id: str = None
):
    """Get all orders (admin) - optionally filtered by company"""
    query = {}
    if status:
        query["status"] = status
    if company_id:
        # company_id eşleşen VEYA company_id alanı olmayan (eski kayıtlar)
        query["$or"] = [
            {"company_id": company_id},
            {"company_id": {"$exists": False}},
            {"company_id": None}
        ]
    
    orders = await db.jetpuan_orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    orders = await enrich_orders_with_courier_info(orders)
    return orders


@router.get("/orders/pending-count")
async def get_pending_orders_count(company_id: str = None):
    """Get count of pending orders for badge - optionally filtered by company"""
    query = {"status": "pending"}
    if company_id:
        query["$or"] = [
            {"company_id": company_id},
            {"company_id": {"$exists": False}},
            {"company_id": None}
        ]
    count = await db.jetpuan_orders.count_documents(query)
    return {"count": count}


@router.get("/orders/courier/{courier_id}")
async def get_courier_orders(courier_id: str):
    """Get courier's orders"""
    orders = await db.jetpuan_orders.find(
        {"courier_id": courier_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return orders


@router.post("/orders/{courier_id}")
async def create_order(courier_id: str, data: JetPuanOrderCreate):
    """Create a new order"""
    if not data.items:
        raise HTTPException(status_code=400, detail="Sepet boş")
    
    # Validate stock and calculate total
    total_points, order_items, error = await validate_order_stock(data.items)
    if error:
        raise HTTPException(status_code=400 if "Yetersiz" in error else 404, detail=error)
    
    # Check balance
    current_balance = await get_courier_balance(courier_id)
    if current_balance < total_points:
        raise HTTPException(
            status_code=400, 
            detail=f"Yetersiz JetPuan. Bakiye: {current_balance:.2f}, Gerekli: {total_points}"
        )
    
    # Deduct stock
    await deduct_product_stock(data.items)
    
    # Deduct balance and record transaction
    order_id = str(uuid.uuid4())
    await debit_points_from_courier(courier_id, total_points, f"Sipariş #{order_id[:8]}")
    
    # Get courier's company_id
    courier = await db.couriers.find_one({"id": courier_id}, {"_id": 0, "name": 1})
    relation = await db.company_couriers.find_one({"courier_id": courier_id}, {"_id": 0, "company_id": 1})
    company_id = relation["company_id"] if relation else None
    
    # Create order
    order = {
        "id": order_id,
        "courier_id": courier_id,
        "company_id": company_id,
        "items": order_items,
        "total_points": total_points,
        "status": "pending",
        "created_at": get_turkey_now(),
        "delivered_at": None
    }
    await db.jetpuan_orders.insert_one(order)
    
    # Send notification
    if courier and relation:
        await send_jetpuan_notification(relation["company_id"], courier["name"], total_points, order["id"])
    
    return {"message": "Sipariş oluşturuldu", "order_id": order["id"], "total_points": total_points}


@router.put("/orders/{order_id}/deliver")
async def deliver_order(
    order_id: str
):
    """Mark order as delivered (admin)"""
    order = await db.jetpuan_orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Sipariş bulunamadı")
    
    if order["status"] == "delivered":
        raise HTTPException(status_code=400, detail="Sipariş zaten teslim edildi")
    
    await db.jetpuan_orders.update_one(
        {"id": order_id},
        {"$set": {"status": "delivered", "delivered_at": datetime.now(timezone(timedelta(hours=3))).isoformat()}}
    )
    return {"message": "Sipariş teslim edildi olarak işaretlendi"}


@router.delete("/orders/{order_id}")
async def cancel_order(
    order_id: str
):
    """Cancel a pending order (refund points and restore stock)"""
    order = await db.jetpuan_orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Sipariş bulunamadı")
    
    if order["status"] == "delivered":
        raise HTTPException(status_code=400, detail="Teslim edilen sipariş iptal edilemez")
    
    # Restore stock
    await restore_product_stock(order["items"])
    
    # Refund points
    await credit_points_to_courier(order["courier_id"], order["total_points"], f"Sipariş iadesi #{order_id[:8]}")
    
    # Delete order
    await db.jetpuan_orders.delete_one({"id": order_id})
    return {"message": "Sipariş iptal edildi, puanlar iade edildi"}


@router.delete("/orders/{order_id}/permanent")
async def delete_order_permanently(
    order_id: str,
    admin_role: str = "admin"
):
    """Permanently delete an order without refunding points (superadmin only)"""
    if admin_role != "superadmin":
        raise HTTPException(status_code=403, detail="Bu işlem sadece süper admin tarafından yapılabilir")
    
    order = await db.jetpuan_orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Sipariş bulunamadı")
    
    # Delete order without refund
    await db.jetpuan_orders.delete_one({"id": order_id})
    return {"message": "Sipariş kalıcı olarak silindi (puan iadesi yapılmadı)"}


# ============ HELPER FOR ACCOUNTING ============

async def calculate_and_credit_points(courier_id: str, hakedis_amount: float):
    """Calculate and credit JetPuan for hakediş (called from accounting router)"""
    puan_per_100tl = await get_puan_ratio()
    points = (hakedis_amount / 100) * puan_per_100tl
    
    if points > 0:
        await credit_points_to_courier(courier_id, points, f"Hakediş puanı ({hakedis_amount:.2f} TL)")
    
    return points


async def calculate_and_debit_points(courier_id: str, hakedis_amount: float):
    """Calculate and debit JetPuan when hakediş is deleted (called from accounting router)"""
    puan_per_100tl = await get_puan_ratio()
    points = (hakedis_amount / 100) * puan_per_100tl
    
    if points > 0:
        current_balance = await get_courier_balance(courier_id)
        actual_debit = min(points, current_balance)
        
        if actual_debit > 0:
            await debit_points_from_courier(courier_id, actual_debit, f"Hakediş iptali ({hakedis_amount:.2f} TL)")
        
        return actual_debit
    
    return 0
