"""
Kontör düşme servisi - Sipariş oluşturulduğunda çağrılır
"""
from utils.database import db
from utils.helpers import get_turkey_now
import uuid


async def get_company_pool_id(company_id: str) -> str:
    """Şirketin ait olduğu havuz ID'sini döndürür"""
    superadmins = await db.admins.find(
        {
            "role": "superadmin",
            "company_ids": company_id
        },
        {"_id": 0, "id": 1, "company_ids": 1}
    ).to_list(100)
    
    if not superadmins:
        return company_id
    
    all_company_ids = set()
    for sa in superadmins:
        for cid in (sa.get("company_ids") or []):
            all_company_ids.add(cid)
    
    if len(all_company_ids) <= 1:
        return company_id
    
    sorted_ids = sorted(all_company_ids)
    pool_id = "_".join(sorted_ids)
    return pool_id


async def deduct_order_credit(company_id: str, order_id: str = None) -> dict:
    """
    Sipariş için 1 kontör düşer.
    Bu fonksiyon tüm webhook ve sipariş oluşturma noktalarından çağrılmalıdır.
    
    Returns: 
        {"deducted": bool, "credits": int, "unlimited": bool}
    """
    if not company_id:
        return {"deducted": False, "credits": None, "unlimited": False, "error": "company_id yok"}
    
    try:
        pool_id = await get_company_pool_id(company_id)
        
        # Havuzu getir veya oluştur
        pool = await db.credit_pools.find_one({"pool_id": pool_id}, {"_id": 0})
        
        if not pool:
            pool = {
                "pool_id": pool_id,
                "company_ids": [company_id],
                "credits": 0,
                "unlimited": False,
                "last_credit_date": None,
                "created_at": get_turkey_now()
            }
            await db.credit_pools.insert_one(pool)
        
        # Sınırsız ise düşme
        if pool.get("unlimited", False):
            return {"deducted": False, "credits": None, "unlimited": True}
        
        # Kontör düş
        result = await db.credit_pools.find_one_and_update(
            {"pool_id": pool_id},
            {"$inc": {"credits": -1}},
            return_document=True,
            projection={"_id": 0, "credits": 1}
        )
        
        new_credits = result["credits"] if result else pool["credits"] - 1
        
        # İşlem kaydı (arka planda, hata olsa bile sipariş devam etmeli)
        try:
            transaction = {
                "id": str(uuid.uuid4()),
                "pool_id": pool_id,
                "company_id": company_id,
                "type": "order_deduct",
                "amount": -1,
                "order_id": order_id,
                "note": "Sipariş kontörü",
                "created_at": get_turkey_now()
            }
            await db.credit_transactions.insert_one(transaction)
        except Exception:
            pass  # İşlem kaydı başarısız olsa bile kontör düşmüş olacak
        
        return {"deducted": True, "credits": new_credits, "unlimited": False}
    
    except Exception as e:
        print(f"Credit deduction error for company {company_id}: {e}")
        return {"deducted": False, "credits": None, "unlimited": False, "error": str(e)}
