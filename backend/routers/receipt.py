"""
Fiş Okuma API Endpoint

Restoran panelinden fiş fotoğrafı yüklenir, AI analiz eder, sipariş bilgisi döner.
"""
import os
import base64
import httpx
import logging
from fastapi import APIRouter, HTTPException, UploadFile, File, Depends
from pydantic import BaseModel
from typing import Optional
from dotenv import load_dotenv

from utils.jwt_utils import require_auth
from services.receipt_service import analyze_receipt

load_dotenv()
router = APIRouter(prefix="/api/receipt", tags=["Receipt OCR"])
logger = logging.getLogger(__name__)

GOOGLE_MAPS_KEY = os.environ.get("GOOGLE_MAPS_API_KEY", os.environ.get("REACT_APP_GOOGLE_MAPS_API_KEY", ""))


def normalize_receipt_phone(phone: str) -> str:
    """
    Fişteki telefon numarasını DTMF uyumlu formata çevirir.
    
    Örnekler:
    - "02123653403 / 1185552156" → "02123653403,1185552156"
    - "5553337766" → "05553337766"
    - "0212 365 34 03/1185552156" → "02123653403,1185552156"
    - "02123653403" → "02123653403"
    """
    if not phone:
        return phone
    
    # Boşlukları ve tireleri kaldır
    clean = phone.replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
    
    # "/" ayırıcıyı DTMF pause (,) formatına çevir
    if "/" in clean:
        clean = clean.replace("/", ",")
    
    # Birden fazla virgülü teke düşür
    while ",," in clean:
        clean = clean.replace(",,", ",")
    
    # Parçalara ayır ve her parçayı kontrol et
    parts = clean.split(",")
    normalized_parts = []
    
    for i, part in enumerate(parts):
        part = part.strip()
        if not part:
            continue
        if i == 0:
            # Ana numara — başında 0 yoksa ekle
            if part.startswith("5") and len(part) == 10:
                part = "0" + part
            elif part.startswith("2") and len(part) == 10:
                part = "0" + part
            elif part.startswith("3") and len(part) == 10:
                part = "0" + part
        normalized_parts.append(part)
    
    return ",".join(normalized_parts)


@router.post("/analyze")
async def analyze_receipt_endpoint(
    file: UploadFile = File(...),
    auth: dict = Depends(require_auth),
):
    """
    Fiş fotoğrafını analiz edip sipariş bilgilerini döndürür.
    Desteklenen formatlar: JPEG, PNG, WEBP
    """
    # Dosya tipi kontrolü
    allowed_types = ["image/jpeg", "image/png", "image/webp", "image/jpg"]
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Sadece JPEG, PNG veya WEBP dosyaları desteklenir")

    # Dosya boyutu kontrolü (max 10MB)
    contents = await file.read()
    if len(contents) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Dosya boyutu 10MB'ı aşamaz")

    # Base64'e çevir
    image_base64 = base64.b64encode(contents).decode("utf-8")

    # AI analiz
    try:
        result = await analyze_receipt(image_base64)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(f"Fiş analiz hatası: {e}")
        raise HTTPException(status_code=500, detail="Fiş analiz edilemedi")

    # Telefon numarasını normalize et
    raw_phone = result.get("customer_phone", "")
    if raw_phone:
        result["customer_phone"] = normalize_receipt_phone(raw_phone)

    # Adres → Koordinat (Google Geocoding)
    location = None
    address = result.get("delivery_address", "")
    if address and GOOGLE_MAPS_KEY:
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    "https://maps.googleapis.com/maps/api/geocode/json",
                    params={"address": address, "key": GOOGLE_MAPS_KEY, "language": "tr"},
                    timeout=5,
                )
                geo_data = resp.json()
                if geo_data.get("status") == "OK" and geo_data.get("results"):
                    loc = geo_data["results"][0]["geometry"]["location"]
                    location = {"latitude": loc["lat"], "longitude": loc["lng"]}
        except Exception as e:
            logger.warning(f"Geocoding hatası: {e}")

    result["delivery_location"] = location
    return result
