"""
Native App Endpoint'leri - JWT gerektirmeyen endpoint'ler.
Native app (Android/iOS) arka planda doğrudan backend'e istek atar.
WebView'daki axios interceptor'dan geçmediği için JWT token içermez.
Bu yüzden bu endpoint'ler auth koruması dışında bırakılmıştır.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from utils.database import db
from utils.helpers import get_turkey_now

router = APIRouter(prefix="/api", tags=["Courier Native (No Auth)"])


# --- Courier Location Update (Native App) ---
class CourierLocationUpdate(BaseModel):
    latitude: float
    longitude: float
    accuracy: Optional[float] = None
    speed: Optional[float] = None
    timestamp: Optional[int] = None
    batteryLevel: Optional[float] = None  # 0.0 - 1.0 arası
    batteryState: Optional[str] = None    # "charging", "unplugged", "full", "unknown"
    push_token: Optional[str] = None      # Cihazın push notification token'ı
    platform: Optional[str] = None        # "android" veya "ios"


@router.put("/couriers/{courier_id}/location")
async def update_courier_location(courier_id: str, data: CourierLocationUpdate):
    """Update courier's current location (Native app - no JWT required)"""

    update_data = {
        "current_location": {
            "latitude": data.latitude,
            "longitude": data.longitude,
            "updated_at": get_turkey_now()
        }
    }

    # Accuracy ve speed varsa ekle
    if data.accuracy is not None:
        update_data["current_location"]["accuracy"] = data.accuracy
    if data.speed is not None:
        update_data["current_location"]["speed"] = data.speed

    # Batarya bilgisi varsa ekle
    if data.batteryLevel is not None:
        update_data["battery"] = {
            "level": data.batteryLevel,
            "state": data.batteryState or "unknown",
            "updated_at": get_turkey_now()
        }

    # Push token varsa ve değişmişse güncelle
    if data.push_token:
        courier = await db.couriers.find_one(
            {"id": courier_id},
            {"_id": 0, "fcm_token": 1, "fcm_platform": 1}
        )
        if courier:
            token_changed = data.push_token != courier.get("fcm_token")
            platform_changed = data.platform and data.platform != courier.get("fcm_platform")
            if token_changed or platform_changed:
                update_data["fcm_token"] = data.push_token
                update_data["fcm_token_updated_at"] = get_turkey_now()
                if data.platform:
                    update_data["fcm_platform"] = data.platform

    result = await db.couriers.update_one(
        {"id": courier_id},
        {"$set": update_data}
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Kurye bulunamadı")

    return {"message": "Konum güncellendi"}
