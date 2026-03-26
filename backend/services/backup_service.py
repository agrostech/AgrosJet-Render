"""
MongoDB Backup Service
- 15 dakikada bir otomatik yedek → R2'ye yükler (max 5 döngüsel)
- 12 saatte bir günlük yedek → R2'ye yükler (max 4 döngüsel, ~48 saat)
"""
import os
import subprocess
import shutil
import logging
from datetime import datetime, timezone, timedelta
from io import BytesIO
import zipfile

logger = logging.getLogger(__name__)

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "agrosjet_32")
BACKUP_DIR = "/tmp/mongo_backups"
R2_BACKUP_PREFIX = "YEDEKLER"
R2_DAILY_PREFIX = "YEDEKLER_GUNLUK"
MAX_FREQUENT_BACKUPS = 5
MAX_DAILY_BACKUPS = 4

TURKEY_TZ = timezone(timedelta(hours=3))


def _get_turkey_now():
    return datetime.now(TURKEY_TZ)


def _run_mongodump() -> bytes:
    """mongodump çalıştır ve zip olarak döndür"""
    dump_path = os.path.join(BACKUP_DIR, "dump")
    
    # Temizle
    if os.path.exists(dump_path):
        shutil.rmtree(dump_path)
    os.makedirs(dump_path, exist_ok=True)
    
    # mongodump
    cmd = [
        "mongodump",
        "--uri", MONGO_URL,
        "--db", DB_NAME,
        "--out", dump_path
    ]
    
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if result.returncode != 0:
        logger.error(f"mongodump failed: {result.stderr}")
        raise Exception(f"mongodump failed: {result.stderr}")
    
    # Zip olarak sıkıştır
    zip_buffer = BytesIO()
    db_dump_path = os.path.join(dump_path, DB_NAME)
    
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(db_dump_path):
            for file in files:
                file_path = os.path.join(root, file)
                arcname = os.path.relpath(file_path, db_dump_path)
                zf.write(file_path, arcname)
    
    # Temizle
    shutil.rmtree(dump_path, ignore_errors=True)
    
    zip_buffer.seek(0)
    return zip_buffer.read()


async def _list_r2_backups(prefix: str) -> list:
    """R2'deki belirli prefix altındaki dosyaları listele"""
    from services.r2_storage import get_r2_client, get_r2_settings_sync
    
    client = get_r2_client()
    if not client:
        return []
    
    settings = get_r2_settings_sync()
    bucket = settings.get("bucket_name", "shiftjet")
    
    try:
        response = client.list_objects_v2(Bucket=bucket, Prefix=prefix)
        contents = response.get("Contents", [])
        return sorted(contents, key=lambda x: x.get("LastModified", datetime.min.replace(tzinfo=timezone.utc)))
    except Exception as e:
        logger.error(f"R2 list error: {e}")
        return []


async def _delete_r2_key(key: str):
    """R2'den dosya sil"""
    from services.r2_storage import delete_file_from_r2
    await delete_file_from_r2(key)


async def _upload_backup(zip_data: bytes, r2_key: str) -> bool:
    """Yedeği R2'ye yükle"""
    from services.r2_storage import upload_file_to_r2
    
    result = await upload_file_to_r2(zip_data, r2_key, "application/zip")
    return result.get("success", False)


async def _get_last_backup_size(prefix: str) -> int:
    """R2'deki son yedeğin boyutunu döndür (byte)"""
    backups = await _list_r2_backups(f"{prefix}/")
    if not backups:
        return 0
    return backups[-1].get("Size", 0)


async def run_frequent_backup():
    """15 dakikada bir çalışan yedek (max 5 adet döngüsel)"""
    try:
        now = _get_turkey_now()
        timestamp = now.strftime("%Y%m%d_%H%M%S")
        r2_key = f"{R2_BACKUP_PREFIX}/{DB_NAME}_{timestamp}.zip"
        
        logger.info(f"[BACKUP] 15dk yedek başlatılıyor: {r2_key}")
        
        # Dump al
        zip_data = _run_mongodump()
        new_size = len(zip_data)
        size_mb = new_size / (1024 * 1024)
        logger.info(f"[BACKUP] Dump alındı: {size_mb:.1f} MB")
        
        # Boyut kontrolü: son yedeğin %50'sinden küçükse anomali
        last_size = await _get_last_backup_size(R2_BACKUP_PREFIX)
        if last_size > 0 and new_size < (last_size * 0.5):
            logger.warning(f"[BACKUP] ANOMALI! Yeni yedek ({new_size} byte) son yedeğin ({last_size} byte) %50'sinden küçük. DB sıfırlanmış olabilir. Yedek ATLANIYIOR.")
            return
        
        # R2'ye yükle
        success = await _upload_backup(zip_data, r2_key)
        if not success:
            logger.error("[BACKUP] R2 yükleme başarısız!")
            return
        
        logger.info(f"[BACKUP] R2'ye yüklendi: {r2_key}")
        
        # Eski yedekleri temizle (max 5)
        backups = await _list_r2_backups(f"{R2_BACKUP_PREFIX}/")
        if len(backups) > MAX_FREQUENT_BACKUPS:
            to_delete = backups[:len(backups) - MAX_FREQUENT_BACKUPS]
            for obj in to_delete:
                await _delete_r2_key(obj["Key"])
                logger.info(f"[BACKUP] Eski yedek silindi: {obj['Key']}")
        
        logger.info(f"[BACKUP] 15dk yedek tamamlandı. Toplam: {min(len(backups), MAX_FREQUENT_BACKUPS)} yedek")
        
    except Exception as e:
        logger.error(f"[BACKUP] 15dk yedek hatası: {e}")


async def run_daily_backup():
    """12 saatte bir çalışan günlük yedek (max 4 adet döngüsel, ~48 saat)"""
    try:
        now = _get_turkey_now()
        timestamp = now.strftime("%Y%m%d_%H%M%S")
        r2_key = f"{R2_DAILY_PREFIX}/{DB_NAME}_{timestamp}.zip"
        
        logger.info(f"[BACKUP-GUNLUK] 12 saatlik yedek başlatılıyor: {r2_key}")
        
        # Dump al
        zip_data = _run_mongodump()
        new_size = len(zip_data)
        size_mb = new_size / (1024 * 1024)
        logger.info(f"[BACKUP-GUNLUK] Dump alındı: {size_mb:.1f} MB")
        
        # Boyut kontrolü: son yedeğin %50'sinden küçükse anomali
        last_size = await _get_last_backup_size(R2_DAILY_PREFIX)
        if last_size > 0 and new_size < (last_size * 0.5):
            logger.warning(f"[BACKUP-GUNLUK] ANOMALI! Yeni yedek ({new_size} byte) son yedeğin ({last_size} byte) %50'sinden küçük. DB sıfırlanmış olabilir. Yedek ATLANIYOR.")
            return
        
        # R2'ye yükle
        success = await _upload_backup(zip_data, r2_key)
        if not success:
            logger.error("[BACKUP-GUNLUK] R2 yükleme başarısız!")
            return
        
        logger.info(f"[BACKUP-GUNLUK] R2'ye yüklendi: {r2_key}")
        
        # Eski yedekleri temizle (max 4)
        backups = await _list_r2_backups(f"{R2_DAILY_PREFIX}/")
        if len(backups) > MAX_DAILY_BACKUPS:
            to_delete = backups[:len(backups) - MAX_DAILY_BACKUPS]
            for obj in to_delete:
                await _delete_r2_key(obj["Key"])
                logger.info(f"[BACKUP-GUNLUK] Eski yedek silindi: {obj['Key']}")
        
        logger.info(f"[BACKUP-GUNLUK] 12 saatlik yedek tamamlandı. Toplam: {min(len(backups), MAX_DAILY_BACKUPS)} yedek")
        
    except Exception as e:
        logger.error(f"[BACKUP-GUNLUK] Günlük yedek hatası: {e}")
