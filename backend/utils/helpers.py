import hashlib
import bcrypt
from datetime import datetime, timezone, timedelta

# Türkiye timezone (UTC+3)
TURKEY_TZ = timezone(timedelta(hours=3))


def hash_password(password: str) -> str:
    """Şifreyi bcrypt ile hashle (yeni şifreler için)"""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Şifreyi doğrula - bcrypt ve eski SHA-256 destekli.
    bcrypt hash'i $2b$ ile başlar, SHA-256 64 hex karakter.
    """
    if not hashed_password:
        return False
    # bcrypt hash kontrolü
    if hashed_password.startswith("$2b$") or hashed_password.startswith("$2a$"):
        try:
            return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
        except Exception:
            return False
    # Eski SHA-256 hash kontrolü (geçiş dönemi)
    sha256_hash = hashlib.sha256(plain_password.encode()).hexdigest()
    return hashed_password == sha256_hash

def format_name(name: str) -> str:
    """Format name with Turkish locale - capitalize each word"""
    return ' '.join(word.capitalize() for word in name.strip().split())

def ensure_turkey_timezone(date_str: str) -> str:
    """
    Tarih string'ine Türkiye timezone'u (+03:00) ekler.
    
    - Eğer timezone yoksa +03:00 ekler
    - Eğer +00:00 (UTC) varsa +03:00'a çevirir (3 saat ekler)
    - Eğer Z varsa +03:00'a çevirir (3 saat ekler)
    - Eğer zaten +03:00 varsa olduğu gibi döner
    
    Args:
        date_str: ISO 8601 formatında tarih string'i
        
    Returns:
        +03:00 timezone'lu tarih string'i
    """
    if not date_str:
        return datetime.now(TURKEY_TZ).isoformat()
    
    date_str = str(date_str).strip()
    
    # Zaten +03:00 varsa olduğu gibi döndür
    if "+03:00" in date_str:
        return date_str
    
    # +00:00 (UTC) varsa Türkiye'ye çevir
    if "+00:00" in date_str:
        try:
            dt = datetime.fromisoformat(date_str)
            dt_turkey = dt.astimezone(TURKEY_TZ)
            return dt_turkey.isoformat()
        except:
            return date_str.replace("+00:00", "+03:00")
    
    # Z (UTC) varsa Türkiye'ye çevir
    if date_str.endswith("Z"):
        try:
            dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
            dt_turkey = dt.astimezone(TURKEY_TZ)
            return dt_turkey.isoformat()
        except:
            return date_str.replace("Z", "+03:00")
    
    # Timezone yoksa +03:00 ekle (Türkiye kaynaklı sistemler için)
    if "+" not in date_str and "-" not in date_str[-6:]:
        return date_str + "+03:00"
    
    return date_str

def get_turkey_now() -> str:
    """Şu anki Türkiye saatini ISO formatında döndürür"""
    return datetime.now(TURKEY_TZ).isoformat()
