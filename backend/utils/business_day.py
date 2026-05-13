"""
Şirket iş günü (business day) yardımcıları.

Bir şirketin "günü", takvim 00:00 yerine `opening_time` (örn. 06:00) ile başlar
ve 24 saat sonra biter. Bu nedenle 06:00 öncesi yapılan kontroller, atanmış
bir önceki takvim gününe aittir.

Hem `weekday key` (pazartesi/sali/...) hem datetime/date dönüşleri sağlar.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

from utils.database import db

TURKEY_TZ = timezone(timedelta(hours=3))
WEEKDAYS_TR = ["pazartesi", "sali", "carsamba", "persembe", "cuma", "cumartesi", "pazar"]
DEFAULT_OPENING_TIME = "06:00"


def _parse_hhmm(value: str) -> tuple[int, int]:
    """`"HH:MM"` -> (h, m). Hata olursa varsayılan 06:00 döner."""
    try:
        h_str, m_str = (value or DEFAULT_OPENING_TIME).split(":")
        return int(h_str), int(m_str)
    except Exception:
        return 6, 0


async def get_company_opening_time(company_id: str) -> str:
    """Şirketin açılış saatini "HH:MM" olarak döner. Yoksa 06:00."""
    company = await db.companies.find_one(
        {"id": company_id}, {"_id": 0, "opening_time": 1}
    )
    return (company or {}).get("opening_time") or DEFAULT_OPENING_TIME


def compute_business_date(now: datetime, opening_time: str = DEFAULT_OPENING_TIME) -> datetime:
    """
    Verilen `now` (TR tz olmalı) için şirketin iş günü tarihini döner.
    Şu an açılış saatinden ÖNCEYSE → iş günü dün.
    """
    if now.tzinfo is None:
        now = now.replace(tzinfo=TURKEY_TZ)
    open_h, open_m = _parse_hhmm(opening_time)
    cutoff = now.replace(hour=open_h, minute=open_m, second=0, microsecond=0)
    if now < cutoff:
        return now - timedelta(days=1)
    return now


async def get_business_day_key(company_id: str, now: Optional[datetime] = None) -> str:
    """
    Şirket iş gününe göre weekday anahtarı döner ("pazartesi"..."pazar").
    `now` verilmezse Türkiye saati alınır.
    """
    if now is None:
        now = datetime.now(TURKEY_TZ)
    opening = await get_company_opening_time(company_id)
    business_dt = compute_business_date(now, opening)
    return WEEKDAYS_TR[business_dt.weekday()]
