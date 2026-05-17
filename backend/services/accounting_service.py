"""
Accounting Service - Helper functions for accounting operations
"""
from datetime import datetime, timezone
import uuid
from utils.database import db
from utils.helpers import get_turkey_now, ensure_turkey_timezone, TURKEY_TZ


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
    elif entity_type == "restaurant":
        restaurant = await db.restaurants.find_one({"id": entity_id}, {"_id": 0, "name": 1})
        return restaurant["name"] if restaurant else "Bilinmeyen Restoran"
    return "Bilinmeyen"


async def get_entity_transactions(entity_type: str, entity_id: str, skip: int = 0, limit: int = 10, category: str = None):
    """
    Get transactions and calculate balance for an entity.
    
    category filter (opsiyonel):
        - 'earning': type=earning veya is_hakedis=True (günlük otomatik hakediş dahil)
        - 'payout': payout_request_id var, installment_product_id yok
        - 'installment': installment_product_id var
        - 'mutabakat': mutabakat_date var veya description'da 'mütabakat'/'eksik'
        - 'penalty': penalty_violation_id var veya description "Ceza:" ile başlıyor
        - 'manual': yukarıdakilerin hiçbiri
    """
    base_query = {"entity_type": entity_type, "entity_id": entity_id}
    
    # Kategori filtresi (server-side)
    query = dict(base_query)
    if category == "earning":
        query["$or"] = [
            {"type": "earning"},
            {"is_hakedis": True},
        ]
    elif category == "payout":
        query["payout_request_id"] = {"$ne": None, "$exists": True}
        query["installment_product_id"] = {"$in": [None]}
    elif category == "installment":
        query["installment_product_id"] = {"$ne": None, "$exists": True}
    elif category == "mutabakat":
        query["$or"] = [
            {"mutabakat_date": {"$ne": None, "$exists": True}},
            {"description": {"$regex": "mütabakat|mutabakat|eksik", "$options": "i"}}
        ]
    elif category == "penalty":
        query["$or"] = [
            {"penalty_violation_id": {"$ne": None, "$exists": True}},
            {"description": {"$regex": "^Ceza:", "$options": "i"}},
        ]
    elif category == "manual":
        # earning/is_hakedis, payout, installment, mutabakat, penalty olmayan
        query["$and"] = [
            {"type": {"$nin": ["earning"]}},
            {"$or": [{"is_hakedis": {"$ne": True}}, {"is_hakedis": {"$exists": False}}]},
            {"$or": [{"payout_request_id": {"$in": [None]}}, {"payout_request_id": {"$exists": False}}]},
            {"$or": [{"installment_product_id": {"$in": [None]}}, {"installment_product_id": {"$exists": False}}]},
            {"$or": [{"mutabakat_date": {"$in": [None]}}, {"mutabakat_date": {"$exists": False}}]},
            {"$or": [{"penalty_violation_id": {"$in": [None]}}, {"penalty_violation_id": {"$exists": False}}]},
            {"description": {"$not": {"$regex": "mütabakat|mutabakat|eksik|^Ceza:", "$options": "i"}}}
        ]
    
    total_count = await db.transactions.count_documents(query)
    
    transactions = await db.transactions.find(
        query,
        {"_id": 0}
    ).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    # Hakediş işlemleri için fatura onay durumunu kontrol et
    for tx in transactions:
        if tx.get("is_hakedis"):
            # Bu işlem için onaylanmış fatura var mı?
            verified_invoice = await db.invoices.find_one({
                "transaction_id": tx["id"],
                "verified": True
            })
            tx["invoice_verified"] = verified_invoice is not None
    
    # Calculate balance using aggregation (optimized)
    # NOT: balance hesabı ÜLKE ÇAPLI (kategori filtre uygulanmaz, gerçek bakiye)
    pipeline = [
        {"$match": base_query},
        {"$group": {
            "_id": None,
            "total_out": {"$sum": {"$cond": [{"$in": ["$type", ["payment_out", "given"]]}, "$amount", 0]}},
            "total_in": {"$sum": {"$cond": [{"$in": ["$type", ["payment_in", "received", "earning"]]}, "$amount", 0]}}
        }}
    ]
    balance_result = await db.transactions.aggregate(pipeline).to_list(1)
    balance = 0
    if balance_result:
        balance = balance_result[0]["total_out"] - balance_result[0]["total_in"]
    
    return {
        "transactions": transactions, 
        "balance": balance,
        "total_count": total_count,
        "has_more": skip + limit < total_count
    }


async def calculate_total_balance(entity_type: str, entity_ids: list) -> float:
    """Calculate total balance for a list of entities using aggregation"""
    if not entity_ids:
        return 0
    
    pipeline = [
        {"$match": {"entity_type": entity_type, "entity_id": {"$in": entity_ids}}},
        {"$group": {
            "_id": None,
            "total_out": {"$sum": {"$cond": [{"$in": ["$type", ["payment_out", "given"]]}, "$amount", 0]}},
            "total_in": {"$sum": {"$cond": [{"$in": ["$type", ["payment_in", "received", "earning"]]}, "$amount", 0]}}
        }}
    ]
    result = await db.transactions.aggregate(pipeline).to_list(1)
    if result:
        return result[0]["total_out"] - result[0]["total_in"]
    return 0


async def calculate_balance_breakdown(entity_type: str, entity_ids: list) -> dict:
    """Calculate positive (alacak) and negative (borç) balances separately for entities"""
    if not entity_ids:
        return {"positive": 0, "negative": 0, "balance": 0}
    
    pipeline = [
        {"$match": {"entity_type": entity_type, "entity_id": {"$in": entity_ids}}},
        {"$group": {
            "_id": "$entity_id",
            "total_out": {"$sum": {"$cond": [{"$in": ["$type", ["payment_out", "given"]]}, "$amount", 0]}},
            "total_in": {"$sum": {"$cond": [{"$in": ["$type", ["payment_in", "received", "earning"]]}, "$amount", 0]}}
        }},
        {"$project": {
            "_id": 1,
            "balance": {"$subtract": ["$total_out", "$total_in"]}
        }}
    ]
    
    results = await db.transactions.aggregate(pipeline).to_list(1000)
    
    positive_total = 0  # Alacak (yeşil)
    negative_total = 0  # Borç (kırmızı)
    
    for r in results:
        bal = r.get("balance", 0)
        if bal > 0:
            positive_total += bal
        elif bal < 0:
            negative_total += abs(bal)
    
    return {
        "positive": positive_total,
        "negative": negative_total,
        "balance": positive_total - negative_total
    }


async def calculate_entity_balances_map(entity_type: str, entity_ids: list) -> dict:
    """Calculate per-entity balance map in a single aggregation.
    Returns: { entity_id: balance, ... }
    """
    if not entity_ids:
        return {}

    pipeline = [
        {"$match": {"entity_type": entity_type, "entity_id": {"$in": entity_ids}}},
        {"$group": {
            "_id": "$entity_id",
            "total_out": {"$sum": {"$cond": [{"$in": ["$type", ["payment_out", "given"]]}, "$amount", 0]}},
            "total_in": {"$sum": {"$cond": [{"$in": ["$type", ["payment_in", "received", "earning"]]}, "$amount", 0]}}
        }},
        {"$project": {
            "_id": 1,
            "balance": {"$subtract": ["$total_out", "$total_in"]}
        }}
    ]

    results = await db.transactions.aggregate(pipeline).to_list(1000)
    balance_map = {}
    for r in results:
        balance_map[r["_id"]] = r.get("balance", 0)

    # Entity'ler için 0 bakiye ekle (işlemi olmayanlar)
    for eid in entity_ids:
        if eid not in balance_map:
            balance_map[eid] = 0

    return balance_map


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
    return get_turkey_now()
