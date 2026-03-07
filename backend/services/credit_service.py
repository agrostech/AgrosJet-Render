"""
Kontör düşme servisi - Merkezi sipariş ekleme fonksiyonu ile otomatik kontör düşme
Her sipariş insert_order() fonksiyonu üzerinden eklenmeli.
"""
from utils.database import db
from utils.helpers import get_turkey_now
import uuid
import logging

logger = logging.getLogger(__name__)


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


async def insert_order(order_data: dict) -> dict:
    """
    Merkezi sipariş ekleme fonksiyonu.
    Tüm sipariş eklemeleri bu fonksiyon üzerinden yapılmalıdır.
    
    1. Restoran'ın order_transfer_mode ayarını kontrol eder
    2. Manuel moddaysa is_restaurant_delivery=True yapar
    3. Siparişi veritabanına ekler
    4. Otomatik olarak kontör düşer (sınırsız değilse)
    
    Args:
        order_data: Sipariş verisi (dict)
    
    Returns:
        Eklenen sipariş verisi (_id hariç)
    """
    # Restoran'ın order_transfer_mode ayarını kontrol et
    restaurant_id = order_data.get("restaurant_id")
    if restaurant_id and not order_data.get("is_restaurant_delivery"):
        restaurant = await db.restaurants.find_one(
            {"id": restaurant_id}, 
            {"_id": 0, "order_transfer_mode": 1}
        )
        if restaurant and restaurant.get("order_transfer_mode") == "manual":
            order_data["is_restaurant_delivery"] = True
            order_data["manual_transfer_mode"] = True  # Manuel mod işareti
            logger.info(f"Manuel aktarım modu - sipariş restoran teslimatı olarak işaretlendi: {order_data.get('id')}")
    
    # Siparişi ekle
    await db.orders.insert_one(order_data)
    
    # Kontör düş (company_id varsa)
    company_id = order_data.get("company_id")
    if company_id:
        order_id = order_data.get("id")
        result = await deduct_order_credit(company_id, order_id)
        
        if result.get("deducted"):
            logger.info(f"Kontör düşüldü: company={company_id}, order={order_id}, kalan={result.get('credits')}")
        elif result.get("unlimited"):
            logger.debug(f"Sınırsız kontör: company={company_id}, order={order_id}")
    
    # _id'yi kaldır (MongoDB tarafından ekleniyor)
    order_data.pop("_id", None)
    
    return order_data


async def insert_orders(orders: list) -> list:
    """
    Toplu sipariş ekleme fonksiyonu.
    
    1. Siparişleri veritabanına ekler
    2. Her sipariş için kontör düşer (sınırsız değilse)
    
    Args:
        orders: Sipariş listesi
    
    Returns:
        Eklenen sipariş listesi (_id hariç)
    """
    if not orders:
        return []
    
    # Siparişleri ekle
    await db.orders.insert_many(orders)
    
    # Her sipariş için kontör düş
    for order_data in orders:
        company_id = order_data.get("company_id")
        if company_id:
            order_id = order_data.get("id")
            result = await deduct_order_credit(company_id, order_id)
            
            if result.get("deducted"):
                logger.info(f"Kontör düşüldü: company={company_id}, order={order_id}, kalan={result.get('credits')}")
        
        # _id'yi kaldır
        order_data.pop("_id", None)
    
    return orders
