"""
JetPuan Service - Helper functions for JetPuan market operations
"""
from datetime import datetime, timezone
import uuid
from utils.database import db


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


async def get_puan_ratio() -> float:
    """Get current puan ratio from settings"""
    settings = await db.jetpuan_settings.find_one({"id": "puan_ratio"}, {"_id": 0})
    return settings["puan_per_100tl"] if settings else 1.17


async def credit_points_to_courier(courier_id: str, amount: float, description: str) -> dict:
    """Add points to courier's balance"""
    await db.jetpuan_balances.update_one(
        {"courier_id": courier_id},
        {"$inc": {"balance": amount}},
        upsert=True
    )
    
    transaction = {
        "id": str(uuid.uuid4()),
        "courier_id": courier_id,
        "amount": amount,
        "type": "credit",
        "description": description,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.jetpuan_transactions.insert_one(transaction)
    return transaction


async def debit_points_from_courier(courier_id: str, amount: float, description: str) -> dict:
    """Remove points from courier's balance"""
    await db.jetpuan_balances.update_one(
        {"courier_id": courier_id},
        {"$inc": {"balance": -amount}}
    )
    
    transaction = {
        "id": str(uuid.uuid4()),
        "courier_id": courier_id,
        "amount": -amount,
        "type": "debit",
        "description": description,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.jetpuan_transactions.insert_one(transaction)
    return transaction


async def get_courier_balance(courier_id: str) -> float:
    """Get courier's current JetPuan balance"""
    balance_doc = await db.jetpuan_balances.find_one({"courier_id": courier_id})
    return balance_doc["balance"] if balance_doc else 0


async def validate_order_stock(items: list) -> tuple:
    """Validate order items and calculate total points"""
    total_points = 0
    order_items = []
    
    for item in items:
        product = await db.jetpuan_products.find_one({"id": item.product_id}, {"_id": 0})
        if not product:
            return None, None, f"Ürün bulunamadı: {item.product_id}"
        
        if product["stock"] < item.quantity:
            return None, None, f"Yetersiz stok: {product['name']} (Stok: {product['stock']}, İstenen: {item.quantity})"
        
        item_total = product["price"] * item.quantity
        total_points += item_total
        
        order_items.append({
            "product_id": item.product_id,
            "product_name": product["name"],
            "quantity": item.quantity,
            "price": product["price"],
            "total": item_total
        })
    
    return total_points, order_items, None


async def deduct_product_stock(items: list):
    """Deduct stock for order items"""
    for item in items:
        await db.jetpuan_products.update_one(
            {"id": item.product_id},
            {"$inc": {"stock": -item.quantity}}
        )


async def restore_product_stock(items: list):
    """Restore stock for cancelled order items"""
    for item in items:
        await db.jetpuan_products.update_one(
            {"id": item["product_id"]},
            {"$inc": {"stock": item["quantity"]}}
        )


async def enrich_orders_with_courier_info(orders: list) -> list:
    """Add courier names and phones to orders"""
    courier_ids = list(set(o["courier_id"] for o in orders))
    if not courier_ids:
        return orders
    
    couriers = await db.couriers.find(
        {"id": {"$in": courier_ids}},
        {"_id": 0, "id": 1, "name": 1, "phone": 1}
    ).to_list(500)
    courier_map = {c["id"]: c for c in couriers}
    
    for order in orders:
        courier = courier_map.get(order["courier_id"], {})
        order["courier_name"] = courier.get("name", "Bilinmeyen")
        order["courier_phone"] = courier.get("phone", "")
    
    return orders


async def enrich_products_with_category_names(products: list) -> list:
    """Add category names to products"""
    category_ids = list(set(p["category_id"] for p in products if p.get("category_id")))
    if not category_ids:
        return products
    
    categories = await db.jetpuan_categories.find(
        {"id": {"$in": category_ids}},
        {"_id": 0, "id": 1, "name": 1}
    ).to_list(100)
    cat_map = {c["id"]: c["name"] for c in categories}
    
    for product in products:
        product["category_name"] = cat_map.get(product.get("category_id"), "")
    
    return products
