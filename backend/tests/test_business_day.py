"""
Şirket iş günü helper testleri.
06:00 cutoff vs takvim günü ayrımı doğru çalışıyor mu?
"""
import uuid
from datetime import datetime, timedelta, timezone
import pytest

from utils.business_day import (
    compute_business_date,
    get_business_day_key,
    get_company_opening_time,
    WEEKDAYS_TR,
)
from utils.database import db


TR = timezone(timedelta(hours=3))


def test_compute_business_date_before_cutoff():
    # Perşembe (2026-05-14) saat 02:00 → iş günü Çarşamba (2026-05-13)
    now = datetime(2026, 5, 14, 2, 0, tzinfo=TR)
    bd = compute_business_date(now, "06:00")
    assert bd.date() == datetime(2026, 5, 13).date()
    assert WEEKDAYS_TR[bd.weekday()] == "carsamba"


def test_compute_business_date_after_cutoff():
    # Perşembe (2026-05-14) saat 10:00 → iş günü Perşembe
    now = datetime(2026, 5, 14, 10, 0, tzinfo=TR)
    bd = compute_business_date(now, "06:00")
    assert bd.date() == datetime(2026, 5, 14).date()
    assert WEEKDAYS_TR[bd.weekday()] == "persembe"


def test_compute_business_date_at_cutoff_exact():
    # Tam 06:00 → iş günü o gün (>= cutoff)
    now = datetime(2026, 5, 14, 6, 0, tzinfo=TR)
    bd = compute_business_date(now, "06:00")
    assert WEEKDAYS_TR[bd.weekday()] == "persembe"


def test_compute_business_date_custom_opening():
    # Açılış 08:00, saat 07:30 → iş günü dün
    now = datetime(2026, 5, 14, 7, 30, tzinfo=TR)
    bd = compute_business_date(now, "08:00")
    assert WEEKDAYS_TR[bd.weekday()] == "carsamba"
    
    # Açılış 04:00, saat 03:00 → iş günü dün
    now2 = datetime(2026, 5, 14, 3, 0, tzinfo=TR)
    bd2 = compute_business_date(now2, "04:00")
    assert WEEKDAYS_TR[bd2.weekday()] == "carsamba"
    
    # Açılış 04:00, saat 05:00 → iş günü bugün
    now3 = datetime(2026, 5, 14, 5, 0, tzinfo=TR)
    bd3 = compute_business_date(now3, "04:00")
    assert WEEKDAYS_TR[bd3.weekday()] == "persembe"


@pytest.mark.asyncio
async def test_get_business_day_key_reads_company_opening_time():
    company_id = f"test-bd-co-{uuid.uuid4()}"
    await db.companies.insert_one({
        "id": company_id,
        "name": "Test BD",
        "opening_time": "06:00",
    })
    try:
        # Perşembe 02:00 → carsamba
        now = datetime(2026, 5, 14, 2, 0, tzinfo=TR)
        key = await get_business_day_key(company_id, now)
        assert key == "carsamba"
        
        # Perşembe 10:00 → persembe
        now2 = datetime(2026, 5, 14, 10, 0, tzinfo=TR)
        key2 = await get_business_day_key(company_id, now2)
        assert key2 == "persembe"
        
        # Opening_time eksikse fallback 06:00
        company_id2 = f"test-bd-co2-{uuid.uuid4()}"
        await db.companies.insert_one({"id": company_id2, "name": "No opening"})
        try:
            now3 = datetime(2026, 5, 14, 3, 0, tzinfo=TR)
            key3 = await get_business_day_key(company_id2, now3)
            assert key3 == "carsamba"
        finally:
            await db.companies.delete_one({"id": company_id2})
        
        # Bulunmayan şirket için default
        key4 = await get_business_day_key("nonexistent-co", datetime(2026, 5, 14, 2, 0, tzinfo=TR))
        assert key4 == "carsamba"
        
        # get_company_opening_time default fallback (eksik şirket)
        opening = await get_company_opening_time("nonexistent-co")
        assert opening == "06:00"
    finally:
        await db.companies.delete_one({"id": company_id})
