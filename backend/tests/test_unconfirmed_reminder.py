"""
Onay bekleyen sipariş için 60 saniyede bir hatırlatma push testi.
"""
import uuid
import asyncio
from datetime import datetime, timezone, timedelta
import pytest

from services.auto_dispatch.dispatcher import send_reminders_to_unconfirmed_couriers
from utils.database import db


COMPANY_ID = "test-co-reminder"


@pytest.mark.asyncio
async def test_reminder_logic(monkeypatch):
    """
    Senaryolar:
    1. assigned_at < 60s → hatırlatma gönderilmez.
    2. assigned_at >= 60s, last_reminder_sent_at yok → gönderilir.
    3. last_reminder_sent_at son 60s içinde → gönderilmez.
    4. auto_cancel_enabled=True ve timeout dolmuş → gönderilmez.
    5. auto_cancel_enabled=False, timeout dolmuş sayılır → yine gönderilir.
    """
    sent_to = []

    async def mock_push(courier_id=None, title=None, body=None, data=None, sound=None, **kwargs):
        sent_to.append({"courier_id": courier_id, "data": data, "title": title})
        return True

    from services import push_notification_service
    monkeypatch.setattr(push_notification_service, "send_push_notification", mock_push)

    courier_id = f"test-rem-courier-{uuid.uuid4()}"
    
    o_fresh = {
        "id": f"test-rem-o1-{uuid.uuid4()}",
        "company_id": COMPANY_ID,
        "courier_id": courier_id,
        "status": "assigned",
        "assigned_at": (datetime.now(timezone.utc) - timedelta(seconds=30)).isoformat(),
        "restaurant_name": "TestR",
    }
    o_due = {
        "id": f"test-rem-o2-{uuid.uuid4()}",
        "company_id": COMPANY_ID,
        "courier_id": courier_id,
        "status": "assigned",
        "assigned_at": (datetime.now(timezone.utc) - timedelta(seconds=90)).isoformat(),
        "restaurant_name": "TestR",
    }
    o_recent_reminder = {
        "id": f"test-rem-o3-{uuid.uuid4()}",
        "company_id": COMPANY_ID,
        "courier_id": courier_id,
        "status": "assigned",
        "assigned_at": (datetime.now(timezone.utc) - timedelta(seconds=120)).isoformat(),
        "last_reminder_sent_at": (datetime.now(timezone.utc) - timedelta(seconds=30)).isoformat(),
        "restaurant_name": "TestR",
    }
    o_expired = {
        "id": f"test-rem-o4-{uuid.uuid4()}",
        "company_id": COMPANY_ID,
        "courier_id": courier_id,
        "status": "assigned",
        "assigned_at": (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat(),
        "restaurant_name": "TestR",
    }
    
    await db.orders.insert_many([o_fresh, o_due, o_recent_reminder, o_expired])
    
    try:
        # Auto-cancel KAPALI: o_expired da gönderilmeli (b şıkkı - süresiz)
        await send_reminders_to_unconfirmed_couriers(COMPANY_ID, {
            "auto_cancel_enabled": False,
            "auto_cancel_timeout": 5,
        })
        sent_ids = {item["data"]["orderId"] for item in sent_to}
        assert o_fresh["id"] not in sent_ids, "30s dolmamış sipariş için gönderilmemeli"
        assert o_due["id"] in sent_ids, "90s dolmuş sipariş için gönderilmeli"
        assert o_recent_reminder["id"] not in sent_ids, "Son hatırlatma 30s önce → gönderilmemeli"
        assert o_expired["id"] in sent_ids, "auto_cancel kapalı → süre dolsa bile gönderilmeli"
        # isReminder flag
        for item in sent_to:
            assert item["data"].get("isReminder") is True

        # last_reminder_sent_at DB'ye yazıldı mı?
        updated = await db.orders.find_one({"id": o_due["id"]}, {"_id": 0, "last_reminder_sent_at": 1})
        assert updated.get("last_reminder_sent_at"), "last_reminder_sent_at güncellenmeliydi"

        # Auto-cancel AÇIK + timeout dolmuş: o_expired gönderilmemeli
        sent_to.clear()
        # o_due'nun last_reminder_sent_at'i şimdi var, 1 dk geçtikten sonra tekrar test için sil
        await db.orders.update_one({"id": o_due["id"]}, {"$set": {"last_reminder_sent_at": None}})
        await send_reminders_to_unconfirmed_couriers(COMPANY_ID, {
            "auto_cancel_enabled": True,
            "auto_cancel_timeout": 5,
        })
        sent_ids_2 = {item["data"]["orderId"] for item in sent_to}
        assert o_due["id"] in sent_ids_2, "Auto-cancel açık ama timeout dolmamış → gönderilmeli"
        assert o_expired["id"] not in sent_ids_2, "Auto-cancel açık ve timeout dolmuş → gönderilmemeli"
    finally:
        await db.orders.delete_many({"id": {"$in": [o_fresh["id"], o_due["id"], o_recent_reminder["id"], o_expired["id"]]}})
