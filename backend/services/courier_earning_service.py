"""
Kurye Otomatik Hakediş Servisi
Sipariş 'delivered' olduğunda kuryeye otomatik 'earning' transaction yazar.
İşlem idempotent — aynı sipariş için 2. kez yazmaya çalışılırsa atlanır.
"""
import logging
import uuid
from utils.database import db
from utils.helpers import get_turkey_now

logger = logging.getLogger(__name__)


async def credit_courier_earning(order: dict) -> dict | None:
    """
    Sipariş teslim edildiğinde kuryenin bakiyesine otomatik 'earning' transaction yazar.
    
    Returns:
        - Transaction dict: yeni kayıt oluşturulduysa
        - None: kurye yoksa, fee yoksa veya zaten kayıt varsa
    """
    if not order:
        return None
    
    courier_id = order.get("courier_id")
    if not courier_id:
        return None
    
    courier_fee = order.get("courier_fee") or 0
    if courier_fee <= 0:
        return None
    
    order_id = order.get("id")
    if not order_id:
        return None
    
    company_id = order.get("company_id")
    if not company_id:
        return None
    
    # Idempotency: aynı sipariş için zaten earning transaction var mı?
    existing = await db.transactions.find_one(
        {
            "entity_type": "courier",
            "entity_id": courier_id,
            "type": "earning",
            "order_id": order_id
        },
        {"_id": 0, "id": 1}
    )
    if existing:
        logger.info(f"Earning zaten mevcut: order={order_id[:8]}, courier={courier_id[:8]}")
        return None
    
    # Sipariş bilgileri (description için)
    order_number = order.get("order_number") or order_id[:8]
    restaurant_name = order.get("restaurant_name") or "Restoran"
    
    transaction = {
        "id": str(uuid.uuid4()),
        "entity_type": "courier",
        "entity_id": courier_id,
        "company_id": company_id,
        "type": "earning",  # Otomatik hakediş tipi (balance hesabında payment_in gibi davranır)
        "amount": float(courier_fee),
        "description": f"Sipariş hakedişi #{order_number} - {restaurant_name}",
        "is_hakedis": True,
        "auto_generated": True,
        "order_id": order_id,
        "order_number": order_number,
        "restaurant_id": order.get("restaurant_id"),
        "restaurant_name": restaurant_name,
        "courier_name": order.get("courier_name") or "",
        "created_at": get_turkey_now()
    }
    
    try:
        await db.transactions.insert_one(transaction)
        transaction.pop("_id", None)
        logger.info(
            f"Otomatik hakediş yazıldı: courier={courier_id[:8]}, "
            f"order={order_id[:8]}, amount={courier_fee}"
        )
        return transaction
    except Exception as e:
        logger.exception(f"Earning transaction yazılamadı: {e}")
        return None


async def revert_courier_earning(order_id: str) -> bool:
    """
    Sipariş iptal edilirse veya delivered'dan başka bir duruma alınırsa
    earning transaction'ı sil. Idempotent — yoksa sessiz geçer.
    """
    if not order_id:
        return False
    
    result = await db.transactions.delete_many(
        {
            "type": "earning",
            "order_id": order_id,
            "auto_generated": True
        }
    )
    
    if result.deleted_count > 0:
        logger.info(f"Earning iptal edildi: order={order_id[:8]}, count={result.deleted_count}")
        return True
    return False
