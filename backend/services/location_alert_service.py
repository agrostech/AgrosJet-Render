"""
Konum Güncelliği Bildirimi Servisi

Aktif kuryelerin konumunun güncel olup olmadığını kontrol eder.
2 dakikadan eski konum bilgisi olan kuryelere push bildirim gönderir.
Aynı kuryeye 10 dakikada bir tekrar gönderir (spam engeli).
"""
import logging
from datetime import datetime, timezone, timedelta
from utils.database import db
from services.push_notification_service import send_push_notification

logger = logging.getLogger(__name__)

TURKEY_TZ = timezone(timedelta(hours=3))
STALE_THRESHOLD_MINUTES = 2
NOTIFICATION_COOLDOWN_MINUTES = 10


async def check_stale_locations():
    """
    Aktif kuryelerin konum güncelliğini kontrol et.
    Konum 2 dk'dan eski + son bildirimden 10 dk geçmişse bildirim gönder.
    """
    try:
        now = datetime.now(TURKEY_TZ)
        stale_cutoff = now - timedelta(minutes=STALE_THRESHOLD_MINUTES)
        cooldown_cutoff = now - timedelta(minutes=NOTIFICATION_COOLDOWN_MINUTES)

        # Aktif kuryeleri couriers tablosundan bul (status=active)
        active_couriers = await db.couriers.find(
            {"status": "active"},
            {"_id": 0, "id": 1, "name": 1, "current_location": 1,
             "permissions": 1, "last_location_alert_at": 1}
        ).to_list(500)

        sent_count = 0

        for courier in active_couriers:
            courier_id = courier.get("id")
            permissions = courier.get("permissions", {})

            # Toggle kontrolü (varsayılan: açık)
            if not permissions.get("location_alert_enabled", True):
                continue

            # Konum bilgisi var mı ve güncel mi
            loc = courier.get("current_location")
            if not loc or not loc.get("updated_at"):
                is_stale = True
            else:
                updated_at = loc["updated_at"]
                if isinstance(updated_at, str):
                    try:
                        updated_at = datetime.fromisoformat(updated_at)
                    except (ValueError, TypeError):
                        is_stale = True
                        updated_at = None
                if updated_at:
                    is_stale = updated_at < stale_cutoff

            if not is_stale:
                continue

            # Spam engeli: son bildirimden 10 dk geçmiş mi
            last_alert = courier.get("last_location_alert_at")
            if last_alert:
                if isinstance(last_alert, str):
                    try:
                        last_alert = datetime.fromisoformat(last_alert)
                    except (ValueError, TypeError):
                        last_alert = None
                if last_alert and last_alert > cooldown_cutoff:
                    continue

            # Bildirim gönder
            try:
                await send_push_notification(
                    courier_id=courier_id,
                    title="Konumunuz Güncel Değil",
                    body="Lütfen uygulamayı açık tutun. Açık tutmanıza rağmen bildirim alıyorsanız uygulamayı tamamen kapatıp tekrar açın.",
                    data={"type": "LOCATION_STALE"},
                    sound="default"
                )

                # Son bildirim zamanını güncelle
                await db.couriers.update_one(
                    {"id": courier_id},
                    {"$set": {"last_location_alert_at": now.isoformat()}}
                )

                sent_count += 1
            except Exception as e:
                logger.error(f"Konum bildirimi gönderilemedi: courier={courier_id}, error={e}")

        if sent_count > 0:
            logger.info(f"Konum bildirimi gönderildi: {sent_count} kurye")

    except Exception as e:
        logger.error(f"check_stale_locations hatası: {e}")
