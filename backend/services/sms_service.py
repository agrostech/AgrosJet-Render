"""
VatanSMS Servisi
SMS gönderimi için VatanSMS API entegrasyonu.
"""
import httpx
from utils.database import db


VATANSMS_BASE_URL = "https://api.vatansms.net/api/v1"


async def get_sms_settings():
    """DB'den SMS ayarlarını çek"""
    settings = await db.system_settings.find_one(
        {"type": "vatansms"},
        {"_id": 0}
    )
    if not settings or not settings.get("enabled"):
        return None
    return settings


async def fetch_senders(api_id: str, api_key: str):
    """VatanSMS hesabına tanımlı gönderici başlıklarını çek"""
    payload = {"api_id": api_id, "api_key": api_key}
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(f"{VATANSMS_BASE_URL}/senders", json=payload)
        return resp.json()


async def send_sms(phones: list, message: str, message_type: str = "turkce"):
    """
    1:N SMS gönderimi.
    phones: ["5xxxxxxxxx", ...]
    message: Mesaj içeriği
    message_type: "normal" veya "turkce"
    """
    settings = await get_sms_settings()
    if not settings:
        raise Exception("SMS ayarları yapılandırılmamış veya devre dışı")

    payload = {
        "api_id": settings["api_id"],
        "api_key": settings["api_key"],
        "sender": settings["sender"],
        "message_type": message_type,
        "message": message,
        "message_content_type": "bilgi",
        "phones": phones
    }

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(f"{VATANSMS_BASE_URL}/1toN", json=payload)
        return resp.json()


async def send_otp(phone: str, message: str, message_type: str = "turkce"):
    """
    OTP SMS gönderimi.
    phone: "5xxxxxxxxx"
    message: Mesaj içeriği ({code} placeholder kullanılabilir)
    """
    settings = await get_sms_settings()
    if not settings:
        raise Exception("SMS ayarları yapılandırılmamış veya devre dışı")

    payload = {
        "api_id": settings["api_id"],
        "api_key": settings["api_key"],
        "sender": settings["sender"],
        "message_type": message_type,
        "message": message,
        "phones": [phone]
    }

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(f"{VATANSMS_BASE_URL}/otp", json=payload)
        return resp.json()
