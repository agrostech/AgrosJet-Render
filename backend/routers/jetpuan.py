from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import uuid

from utils.database import db

router = APIRouter(prefix="/api/jetpuan", tags=["JetPuan Market"])

# Forward declaration for circular import avoidance
async def send_jetpuan_notification(company_id: str, courier_name: str, total_points: int, order_id: str):
    """Send notification for new JetPuan order"""
    try:
        from routers.notifications import create_notification
        await create_notification(
            company_id=company_id,
            notification_type="jetpuan_siparis",
            title="Yeni JetPuan Siparişi",
            message=f"{courier_name} {total_points} JP tutarında sipariş verdi.",
            entity_type="order",
            entity_id=order_id
        )
    except Exception as e:
        print(f"JetPuan notification failed: {e}")


# ============ PYDANTIC MODELS ============

class CategoryCreate(BaseModel):
    name: str

class CategoryUpdate(BaseModel):
    name: Optional[str] = None

class ProductCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    price: int  # JetPuan fiyatı
    stock: int
    category_id: str
    image_url: Optional[str] = ""

class ProductUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[int] = None
    stock: Optional[int] = None
    category_id: Optional[str] = None
    image_url: Optional[str] = None

class OrderItem(BaseModel):
    product_id: str
    quantity: int

class OrderCreate(BaseModel):
    items: List[OrderItem]

class SettingsUpdate(BaseModel):
    puan_per_100tl: float  # Her 100 TL için kaç puan


# ============ SETTINGS ============

@router.get("/settings")
async def get_settings():
    """Get JetPuan settings"""
    settings = await db.jetpuan_settings.find_one({"id": "puan_ratio"}, {"_id": 0})
    if not settings:
        # Default: 100 TL = 1.17 puan (85'te 1)
        settings = {
            "id": "puan_ratio",
            "puan_per_100tl": 1.17,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        await db.jetpuan_settings.insert_one(settings)
    return settings

@router.put("/settings")
async def update_settings(data: SettingsUpdate):
    """Update JetPuan settings (admin only)"""
    await db.jetpuan_settings.update_one(
        {"id": "puan_ratio"},
        {"$set": {
            "puan_per_100tl": data.puan_per_100tl,
            "updated_at": datetime.now(timezone.utc).isoformat()
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
async def create_category(data: CategoryCreate):
    """Create a new category"""
    # Check if category exists
    existing = await db.jetpuan_categories.find_one({"name": data.name})
    if existing:
        raise HTTPException(status_code=400, detail="Bu kategori zaten mevcut")
    
    category = {
        "id": str(uuid.uuid4()),
        "name": data.name,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.jetpuan_categories.insert_one(category)
    return {"message": "Kategori oluşturuldu", "id": category["id"]}

@router.put("/categories/{category_id}")
async def update_category(category_id: str, data: CategoryUpdate):
    """Update a category"""
    category = await db.jetpuan_categories.find_one({"id": category_id})
    if not category:
        raise HTTPException(status_code=404, detail="Kategori bulunamadı")
    
    update_data = {}
    if data.name:
        update_data["name"] = data.name
    
    if update_data:
        await db.jetpuan_categories.update_one(
            {"id": category_id},
            {"$set": update_data}
        )
    return {"message": "Kategori güncellendi"}

@router.delete("/categories/{category_id}")
async def delete_category(category_id: str):
    """Delete a category"""
    # Check if products exist in this category
    product_count = await db.jetpuan_products.count_documents({"category_id": category_id})
    if product_count > 0:
        raise HTTPException(status_code=400, detail=f"Bu kategoride {product_count} ürün var. Önce ürünleri silin veya taşıyın.")
    
    result = await db.jetpuan_categories.delete_one({"id": category_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Kategori bulunamadı")
    return {"message": "Kategori silindi"}


# ============ PRODUCTS ============

@router.get("/products")
async def get_products(category_id: Optional[str] = None):
    """Get all products, optionally filtered by category"""
    query = {}
    if category_id:
        query["category_id"] = category_id
    
    products = await db.jetpuan_products.find(query, {"_id": 0}).sort("name", 1).to_list(500)
    
    # Enrich with category names
    category_ids = list(set(p["category_id"] for p in products if p.get("category_id")))
    if category_ids:
        categories = await db.jetpuan_categories.find(
            {"id": {"$in": category_ids}},
            {"_id": 0, "id": 1, "name": 1}
        ).to_list(100)
        cat_map = {c["id"]: c["name"] for c in categories}
        for p in products:
            p["category_name"] = cat_map.get(p.get("category_id"), "")
    
    return products

@router.get("/products/{product_id}")
async def get_product(product_id: str):
    """Get a single product"""
    product = await db.jetpuan_products.find_one({"id": product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Ürün bulunamadı")
    return product

@router.post("/products")
async def create_product(data: ProductCreate):
    """Create a new product"""
    # Verify category exists
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
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.jetpuan_products.insert_one(product)
    return {"message": "Ürün oluşturuldu", "id": product["id"]}

@router.put("/products/{product_id}")
async def update_product(product_id: str, data: ProductUpdate):
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
        # Verify category exists
        category = await db.jetpuan_categories.find_one({"id": data.category_id})
        if not category:
            raise HTTPException(status_code=404, detail="Kategori bulunamadı")
        update_data["category_id"] = data.category_id
    if data.image_url is not None:
        update_data["image_url"] = data.image_url
    
    if update_data:
        await db.jetpuan_products.update_one(
            {"id": product_id},
            {"$set": update_data}
        )
    return {"message": "Ürün güncellendi"}

@router.delete("/products/{product_id}")
async def delete_product(product_id: str):
    """Delete a product"""
    result = await db.jetpuan_products.delete_one({"id": product_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Ürün bulunamadı")
    return {"message": "Ürün silindi"}


# ============ COURIER POINTS ============

@router.get("/balance/{courier_id}")
async def get_courier_balance(courier_id: str):
    """Get courier's JetPuan balance"""
    balance_doc = await db.jetpuan_balances.find_one({"courier_id": courier_id}, {"_id": 0})
    if not balance_doc:
        return {"courier_id": courier_id, "balance": 0}
    return balance_doc

@router.get("/transactions/{courier_id}")
async def get_courier_transactions(courier_id: str, limit: int = 50):
    """Get courier's JetPuan transaction history"""
    transactions = await db.jetpuan_transactions.find(
        {"courier_id": courier_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(limit)
    return transactions

@router.post("/credit/{courier_id}")
async def credit_points(courier_id: str, amount: float, description: str = "Hakediş puanı"):
    """Add points to courier's balance (called from accounting)"""
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Puan miktarı pozitif olmalı")
    
    # Update balance
    await db.jetpuan_balances.update_one(
        {"courier_id": courier_id},
        {"$inc": {"balance": amount}},
        upsert=True
    )
    
    # Record transaction
    transaction = {
        "id": str(uuid.uuid4()),
        "courier_id": courier_id,
        "amount": amount,
        "type": "credit",
        "description": description,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.jetpuan_transactions.insert_one(transaction)
    
    return {"message": f"{amount:.2f} JetPuan yüklendi"}


@router.post("/manual-credit/{courier_id}")
async def manual_credit_points(courier_id: str, amount: float, description: str = "Manuel puan ekleme"):
    """Manually add points to courier's balance (admin)"""
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Puan miktarı pozitif olmalı")
    
    # Update balance
    await db.jetpuan_balances.update_one(
        {"courier_id": courier_id},
        {"$inc": {"balance": amount}},
        upsert=True
    )
    
    # Record transaction
    transaction = {
        "id": str(uuid.uuid4()),
        "courier_id": courier_id,
        "amount": amount,
        "type": "credit",
        "description": description,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.jetpuan_transactions.insert_one(transaction)
    
    return {"message": f"{amount:.2f} JetPuan eklendi"}


@router.post("/manual-debit/{courier_id}")
async def manual_debit_points(courier_id: str, amount: float, description: str = "Manuel puan silme"):
    """Manually remove points from courier's balance (admin)"""
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Puan miktarı pozitif olmalı")
    
    # Get current balance
    balance_doc = await db.jetpuan_balances.find_one({"courier_id": courier_id})
    current_balance = balance_doc["balance"] if balance_doc else 0
    
    if current_balance < amount:
        raise HTTPException(status_code=400, detail=f"Yetersiz bakiye. Mevcut: {current_balance:.2f} JP")
    
    # Update balance
    await db.jetpuan_balances.update_one(
        {"courier_id": courier_id},
        {"$inc": {"balance": -amount}}
    )
    
    # Record transaction
    transaction = {
        "id": str(uuid.uuid4()),
        "courier_id": courier_id,
        "amount": -amount,
        "type": "debit",
        "description": description,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.jetpuan_transactions.insert_one(transaction)
    
    return {"message": f"{amount:.2f} JetPuan silindi"}


# ============ ORDERS ============

@router.get("/orders/admin")
async def get_all_orders(status: Optional[str] = None):
    """Get all orders (admin)"""
    query = {}
    if status:
        query["status"] = status
    
    orders = await db.jetpuan_orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    
    # Enrich with courier names
    courier_ids = list(set(o["courier_id"] for o in orders))
    if courier_ids:
        couriers = await db.couriers.find(
            {"id": {"$in": courier_ids}},
            {"_id": 0, "id": 1, "name": 1, "phone": 1}
        ).to_list(500)
        courier_map = {c["id"]: c for c in couriers}
        for o in orders:
            courier = courier_map.get(o["courier_id"], {})
            o["courier_name"] = courier.get("name", "Bilinmeyen")
            o["courier_phone"] = courier.get("phone", "")
    
    return orders

@router.get("/orders/courier/{courier_id}")
async def get_courier_orders(courier_id: str):
    """Get courier's orders"""
    orders = await db.jetpuan_orders.find(
        {"courier_id": courier_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return orders

@router.post("/orders/{courier_id}")
async def create_order(courier_id: str, data: OrderCreate):
    """Create a new order"""
    if not data.items:
        raise HTTPException(status_code=400, detail="Sepet boş")
    
    # Get courier balance
    balance_doc = await db.jetpuan_balances.find_one({"courier_id": courier_id})
    current_balance = balance_doc["balance"] if balance_doc else 0
    
    # Validate items and calculate total
    total_points = 0
    order_items = []
    
    for item in data.items:
        product = await db.jetpuan_products.find_one({"id": item.product_id}, {"_id": 0})
        if not product:
            raise HTTPException(status_code=404, detail=f"Ürün bulunamadı: {item.product_id}")
        
        if product["stock"] < item.quantity:
            raise HTTPException(
                status_code=400, 
                detail=f"Yetersiz stok: {product['name']} (Stok: {product['stock']}, İstenen: {item.quantity})"
            )
        
        item_total = product["price"] * item.quantity
        total_points += item_total
        
        order_items.append({
            "product_id": item.product_id,
            "product_name": product["name"],
            "quantity": item.quantity,
            "price": product["price"],
            "total": item_total
        })
    
    # Check balance
    if current_balance < total_points:
        raise HTTPException(
            status_code=400, 
            detail=f"Yetersiz JetPuan. Bakiye: {current_balance:.2f}, Gerekli: {total_points}"
        )
    
    # Deduct stock
    for item in data.items:
        await db.jetpuan_products.update_one(
            {"id": item.product_id},
            {"$inc": {"stock": -item.quantity}}
        )
    
    # Deduct balance
    await db.jetpuan_balances.update_one(
        {"courier_id": courier_id},
        {"$inc": {"balance": -total_points}}
    )
    
    # Record debit transaction
    transaction = {
        "id": str(uuid.uuid4()),
        "courier_id": courier_id,
        "amount": -total_points,
        "type": "debit",
        "description": f"Sipariş #{str(uuid.uuid4())[:8]}",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.jetpuan_transactions.insert_one(transaction)
    
    # Create order
    order = {
        "id": str(uuid.uuid4()),
        "courier_id": courier_id,
        "items": order_items,
        "total_points": total_points,
        "status": "pending",  # pending, delivered
        "created_at": datetime.now(timezone.utc).isoformat(),
        "delivered_at": None
    }
    await db.jetpuan_orders.insert_one(order)
    
    # Send notification for new order
    courier = await db.couriers.find_one({"id": courier_id}, {"_id": 0, "name": 1})
    if courier:
        # Get company_id from courier relation
        relation = await db.company_couriers.find_one({"courier_id": courier_id}, {"_id": 0, "company_id": 1})
        if relation:
            await send_jetpuan_notification(relation["company_id"], courier["name"], total_points, order["id"])
    
    return {"message": "Sipariş oluşturuldu", "order_id": order["id"], "total_points": total_points}

@router.put("/orders/{order_id}/deliver")
async def deliver_order(order_id: str):
    """Mark order as delivered (admin)"""
    order = await db.jetpuan_orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Sipariş bulunamadı")
    
    if order["status"] == "delivered":
        raise HTTPException(status_code=400, detail="Sipariş zaten teslim edildi")
    
    await db.jetpuan_orders.update_one(
        {"id": order_id},
        {"$set": {
            "status": "delivered",
            "delivered_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    return {"message": "Sipariş teslim edildi olarak işaretlendi"}

@router.delete("/orders/{order_id}")
async def cancel_order(order_id: str):
    """Cancel a pending order (refund points and restore stock)"""
    order = await db.jetpuan_orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Sipariş bulunamadı")
    
    if order["status"] == "delivered":
        raise HTTPException(status_code=400, detail="Teslim edilen sipariş iptal edilemez")
    
    # Restore stock
    for item in order["items"]:
        await db.jetpuan_products.update_one(
            {"id": item["product_id"]},
            {"$inc": {"stock": item["quantity"]}}
        )
    
    # Refund points
    await db.jetpuan_balances.update_one(
        {"courier_id": order["courier_id"]},
        {"$inc": {"balance": order["total_points"]}}
    )
    
    # Record refund transaction
    transaction = {
        "id": str(uuid.uuid4()),
        "courier_id": order["courier_id"],
        "amount": order["total_points"],
        "type": "credit",
        "description": f"Sipariş iadesi #{order_id[:8]}",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.jetpuan_transactions.insert_one(transaction)
    
    # Delete order
    await db.jetpuan_orders.delete_one({"id": order_id})
    
    return {"message": "Sipariş iptal edildi, puanlar iade edildi"}


# ============ HELPER FOR ACCOUNTING ============

async def calculate_and_credit_points(courier_id: str, hakedis_amount: float):
    """Calculate and credit JetPuan for hakediş (called from accounting router)"""
    settings = await db.jetpuan_settings.find_one({"id": "puan_ratio"}, {"_id": 0})
    puan_per_100tl = settings["puan_per_100tl"] if settings else 1.17
    
    # Calculate points: (amount / 100) * puan_per_100tl
    points = (hakedis_amount / 100) * puan_per_100tl
    
    if points > 0:
        # Update balance
        await db.jetpuan_balances.update_one(
            {"courier_id": courier_id},
            {"$inc": {"balance": points}},
            upsert=True
        )
        
        # Record transaction
        transaction = {
            "id": str(uuid.uuid4()),
            "courier_id": courier_id,
            "amount": points,
            "type": "credit",
            "description": f"Hakediş puanı ({hakedis_amount:.2f} TL)",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.jetpuan_transactions.insert_one(transaction)
    
    return points


async def calculate_and_debit_points(courier_id: str, hakedis_amount: float):
    """Calculate and debit JetPuan when hakediş is deleted (called from accounting router)"""
    settings = await db.jetpuan_settings.find_one({"id": "puan_ratio"}, {"_id": 0})
    puan_per_100tl = settings["puan_per_100tl"] if settings else 1.17
    
    # Calculate points: (amount / 100) * puan_per_100tl
    points = (hakedis_amount / 100) * puan_per_100tl
    
    if points > 0:
        # Get current balance
        balance_doc = await db.jetpuan_balances.find_one({"courier_id": courier_id})
        current_balance = balance_doc["balance"] if balance_doc else 0
        
        # Don't go negative, deduct what's available
        actual_debit = min(points, current_balance)
        
        if actual_debit > 0:
            # Update balance
            await db.jetpuan_balances.update_one(
                {"courier_id": courier_id},
                {"$inc": {"balance": -actual_debit}}
            )
            
            # Record transaction
            transaction = {
                "id": str(uuid.uuid4()),
                "courier_id": courier_id,
                "amount": -actual_debit,
                "type": "debit",
                "description": f"Hakediş iptali ({hakedis_amount:.2f} TL)",
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.jetpuan_transactions.insert_one(transaction)
        
        return actual_debit
    
    return 0
