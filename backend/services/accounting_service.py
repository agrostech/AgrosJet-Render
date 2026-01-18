"""
Accounting Service - Helper functions for accounting operations
"""
from datetime import datetime, timezone
import uuid
from utils.database import db


async def get_entity_name(entity_type: str, entity_id: str) -> str:
    """Get entity name based on type and ID"""
    if entity_type == "courier":
        courier = await db.couriers.find_one({"id": entity_id}, {"_id": 0, "name": 1})
        return courier["name"] if courier else "Bilinmeyen Kurye"
    elif entity_type == "business":
        business = await db.businesses.find_one({"id": entity_id}, {"_id": 0, "name": 1})
        return business["name"] if business else "Bilinmeyen İşletme"
    elif entity_type == "vendor":
        vendor = await db.vendors.find_one({"id": entity_id}, {"_id": 0, "name": 1})
        return vendor["name"] if vendor else "Bilinmeyen Cari"
    return "Bilinmeyen"


async def get_entity_transactions(entity_type: str, entity_id: str, skip: int = 0, limit: int = 10):
    """Get transactions and calculate balance for an entity"""
    total_count = await db.transactions.count_documents({"entity_type": entity_type, "entity_id": entity_id})
    
    transactions = await db.transactions.find(
        {"entity_type": entity_type, "entity_id": entity_id},
        {"_id": 0}
    ).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    # Calculate balance from ALL transactions
    all_transactions = await db.transactions.find(
        {"entity_type": entity_type, "entity_id": entity_id},
        {"_id": 0, "type": 1, "amount": 1}
    ).to_list(10000)
    
    balance = 0
    for tx in all_transactions:
        if tx["type"] == "payment_out":
            balance += tx["amount"]
        else:
            balance -= tx["amount"]
    
    return {
        "transactions": transactions, 
        "balance": balance,
        "total_count": total_count,
        "has_more": skip + limit < total_count
    }


async def calculate_total_balance(entity_type: str, entity_ids: list) -> float:
    """Calculate total balance for a list of entities"""
    if not entity_ids:
        return 0
    
    all_transactions = await db.transactions.find(
        {"entity_type": entity_type, "entity_id": {"$in": entity_ids}},
        {"_id": 0, "type": 1, "amount": 1}
    ).to_list(100000)
    
    balance = 0
    for tx in all_transactions:
        if tx["type"] == "payment_out":
            balance += tx["amount"]
        else:
            balance -= tx["amount"]
    return balance


def parse_custom_date(custom_date: str = None) -> str:
    """Parse custom date string or return current UTC time"""
    if custom_date:
        try:
            tx_date = datetime.fromisoformat(custom_date.replace('Z', '+00:00'))
            if tx_date.tzinfo is None:
                tx_date = tx_date.replace(tzinfo=timezone.utc)
            return tx_date.isoformat()
        except Exception:
            pass
    return datetime.now(timezone.utc).isoformat()
