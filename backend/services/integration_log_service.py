"""
Entegrasyon Log Servisi
Entegrasyon loglarını MongoDB'ye kaydeder ve dosyadan okur
"""
import os
import re
from datetime import datetime, timezone, timedelta
from motor.motor_asyncio import AsyncIOMotorClient

MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME")

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

turkey_tz = timezone(timedelta(hours=3))

LOG_FILE_PATHS = [
    "/var/log/supervisor/backend.err.log",
    "/var/log/supervisor/backend.out.log",
]

INTEGRATION_KEYWORDS = {
    "migros": ["migros", "Migros", "MIGROS", "migrosonline"],
    "getir": ["getir", "Getir", "GETIR"],
    "trendyol": ["trendyol", "Trendyol", "TRENDYOL"],
    "adisyo": ["adisyo", "Adisyo", "ADISYO"],
    "sepettakip": ["sepettakip", "Sepettakip", "SEPETTAKIP"],
    "yemeksepeti": ["yemeksepeti", "Yemeksepeti", "YEMEKSEPETI"],
    "firebase": ["firebase", "Firebase", "FCM", "fcm"],
}


async def save_integration_log(integration: str, level: str, message: str, data: dict = None):
    """Entegrasyon logunu MongoDB'ye kaydet"""
    log_entry = {
        "integration": integration,
        "level": level,
        "message": message,
        "data": data,
        "timestamp": datetime.now(turkey_tz).isoformat(),
    }
    await db.integration_logs.insert_one(log_entry)


def read_file_logs(integration_filter: str = None, limit: int = 500):
    """Log dosyalarından entegrasyon loglarını oku"""
    lines = []

    for log_path in LOG_FILE_PATHS:
        if not os.path.exists(log_path):
            continue
        try:
            with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue

                    if integration_filter:
                        keywords = INTEGRATION_KEYWORDS.get(
                            integration_filter.lower(), [integration_filter]
                        )
                        if not any(kw in line for kw in keywords):
                            continue
                    else:
                        # Herhangi bir entegrasyon kelimesi içeriyorsa al
                        has_keyword = False
                        for kw_list in INTEGRATION_KEYWORDS.values():
                            if any(kw in line for kw in kw_list):
                                has_keyword = True
                                break
                        if not has_keyword:
                            continue

                    # Seviye belirle
                    level = "INFO"
                    if "ERROR" in line or "error" in line or "Hata" in line or "hatası" in line:
                        level = "ERROR"
                    elif "WARNING" in line or "warning" in line:
                        level = "WARNING"

                    # Tarih parse
                    ts_match = re.match(r"(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})", line)
                    timestamp = ts_match.group(1) if ts_match else ""

                    lines.append({
                        "timestamp": timestamp,
                        "level": level,
                        "message": line,
                    })
        except Exception:
            continue

    # Son N satırı döndür
    return lines[-limit:]


async def get_db_logs(integration_filter: str = None, limit: int = 500):
    """MongoDB'den entegrasyon loglarını oku"""
    query = {}
    if integration_filter:
        query["integration"] = integration_filter.lower()

    logs = await db.integration_logs.find(
        query, {"_id": 0}
    ).sort("timestamp", -1).limit(limit).to_list(limit)

    return list(reversed(logs))
