"""
Fiş Okuma Servisi — Fotoğraftan sipariş bilgisi çıkarma

Google Gemini 2.0 Flash Vision ile fiş/adisyon fotoğrafını analiz eder ve yapılandırılmış JSON döndürür.
Free tier: 1500 istek/gün, 15 RPM (Google AI Studio).
"""
import os
import base64
import json
import logging
import asyncio
from dotenv import load_dotenv
import google.generativeai as genai

load_dotenv()
logger = logging.getLogger(__name__)

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
MODEL_NAME = "gemini-2.0-flash"

if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)


RECEIPT_ANALYSIS_PROMPT = """Sen bir fiş/adisyon okuma asistanısın. Gönderilen fiş fotoğrafını analiz et ve aşağıdaki bilgileri JSON formatında çıkar.

Kurallar:
- Sadece fişte yazan bilgileri çıkar, tahmin yapma
- Telefon numarasını fişte yazan şekliyle AYNEN yaz. "/" işareti, boşluk veya sipariş kodu varsa HİÇBİR karakteri atma. Örnek: "02123653403 / 1185552156" → aynen böyle yaz
- Adres bilgisini tam olarak yaz
- Tutar olarak İNDİRİM SONRASI son toplam tutarı yaz (varsa indirimli tutar)
- Ödeme yöntemi: "cash" (nakit), "card" (kredi kartı), "online" (online ödeme) olarak belirle
  - "Trendyol Online", "Yemeksepeti Online", "Getir" gibi ifadeler → "online"
  - "Nakit", "Kapıda Nakit" → "cash"
  - "Kredi Kartı", "Kapıda Kart" → "card"
- Sipariş kanalı: "trendyol", "yemeksepeti", "getir", "migros", "adisyo", "telefon" veya "bilinmiyor"

JSON formatı (başka bir şey yazma, sadece JSON):
{
  "customer_name": "Müşteri adı",
  "customer_phone": "Telefon numarasını fişte yazdığı gibi aynen yaz",
  "delivery_address": "Tam teslimat adresi",
  "total_amount": 0.00,
  "payment_method": "online",
  "order_channel": "trendyol",
  "order_note": "Sipariş notu (varsa)"
}
"""


def _parse_json_response(text: str) -> dict:
    """Markdown code block'ları temizleyip JSON parse et."""
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()
        if cleaned.startswith("json"):
            cleaned = cleaned[4:].strip()
    return json.loads(cleaned)


async def analyze_receipt(image_base64: str) -> dict:
    """
    Fiş fotoğrafını Gemini 2.0 Flash ile analiz eder.

    Args:
        image_base64: Base64 ile encode edilmiş image (data URI prefix olmadan)

    Returns:
        {
          "customer_name": str,
          "customer_phone": str,
          "delivery_address": str,
          "total_amount": float,
          "payment_method": "cash" | "card" | "online",
          "order_channel": str,
          "order_note": str
        }
    """
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY tanımlanmamış. backend/.env dosyasına ekleyin.")

    # data URI prefix varsa temizle
    if image_base64.startswith("data:"):
        image_base64 = image_base64.split(",", 1)[1]

    # Base64 → bytes
    image_bytes = base64.b64decode(image_base64)

    # MIME type tahmin (jpeg / png / webp)
    if image_bytes.startswith(b"\xff\xd8\xff"):
        mime_type = "image/jpeg"
    elif image_bytes.startswith(b"\x89PNG"):
        mime_type = "image/png"
    elif image_bytes[:4] == b"RIFF" and image_bytes[8:12] == b"WEBP":
        mime_type = "image/webp"
    else:
        mime_type = "image/jpeg"

    model = genai.GenerativeModel(
        MODEL_NAME,
        system_instruction=RECEIPT_ANALYSIS_PROMPT,
        generation_config={
            "temperature": 0.1,
            "max_output_tokens": 1024,
            "response_mime_type": "application/json"
        }
    )

    image_part = {"mime_type": mime_type, "data": image_bytes}
    user_text = "Bu fiş fotoğrafını analiz et ve sipariş bilgilerini JSON olarak döndür."

    # google.generativeai SDK senkron — executor ile async wrap
    loop = asyncio.get_event_loop()
    try:
        response = await loop.run_in_executor(
            None,
            lambda: model.generate_content([user_text, image_part])
        )
    except Exception as e:
        logger.exception(f"Gemini API hatası: {e}")
        raise ValueError(f"Fiş analiz hatası: {str(e)}")

    text = (response.text or "").strip()
    if not text:
        raise ValueError("Gemini boş yanıt döndü")

    try:
        return _parse_json_response(text)
    except json.JSONDecodeError as e:
        logger.error(f"Fiş analiz JSON parse hatası: {e}, response: {text[:200]}")
        raise ValueError(f"AI yanıtı parse edilemedi: {str(e)}")
