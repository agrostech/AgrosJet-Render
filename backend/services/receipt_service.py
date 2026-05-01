"""
Fiş Okuma Servisi — Fotoğraftan sipariş bilgisi çıkarma

GPT-4o Vision ile fiş/adisyon fotoğrafını analiz eder ve yapılandırılmış JSON döndürür.
"""
import os
import base64
import json
import logging
import uuid
from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

load_dotenv()
logger = logging.getLogger(__name__)

EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")

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


async def analyze_receipt(image_base64: str) -> dict:
    """
    Fiş fotoğrafını GPT-4o ile analiz eder.
    """
    api_key = EMERGENT_KEY or os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise ValueError("EMERGENT_LLM_KEY tanımlanmamış. Railway environment variables'a ekleyin.")

    chat = LlmChat(
        api_key=api_key,
        session_id=f"receipt-{uuid.uuid4().hex[:8]}",
        system_message=RECEIPT_ANALYSIS_PROMPT,
    ).with_model("openai", "gpt-4o")

    image_content = ImageContent(image_base64=image_base64)

    user_message = UserMessage(
        text="Bu fiş fotoğrafını analiz et ve sipariş bilgilerini JSON olarak döndür.",
        file_contents=[image_content]
    )

    response = await chat.send_message(user_message)

    # JSON parse
    try:
        # Markdown code block temizle
        cleaned = response.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3]
            cleaned = cleaned.strip()
            if cleaned.startswith("json"):
                cleaned = cleaned[4:].strip()
        
        result = json.loads(cleaned)
        return result
    except json.JSONDecodeError as e:
        logger.error(f"Fiş analiz JSON parse hatası: {e}, response: {response[:200]}")
        raise ValueError(f"AI yanıtı parse edilemedi: {str(e)}")
