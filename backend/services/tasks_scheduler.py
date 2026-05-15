"""
Tasks Scheduler — Görev zamanlama background işleri.

İki ayrı iş yapar (her dakika çalışır):
1. Scheduled task aktivasyonu: status="scheduled" + scheduled_at <= now → status="pending"
2. Recurring task instance üretimi: status="recurring_template" template'lerden,
   bugünkü gün + saat eşleşmesinde child instance oluşturur (idempotent).
"""
import logging
from datetime import datetime, timezone, timedelta
import uuid

from utils.database import db

logger = logging.getLogger(__name__)
TR_TZ = timezone(timedelta(hours=3))


async def activate_scheduled_tasks() -> int:
    """scheduled_at süresi gelmiş scheduled görevleri pending'e çek."""
    now_iso = datetime.now(TR_TZ).isoformat()
    result = await db.tasks.update_many(
        {
            "status": "scheduled",
            "scheduled_at": {"$lte": now_iso},
        },
        {
            "$set": {
                "status": "pending",
                "updated_at": now_iso,
            }
        }
    )
    if result.modified_count:
        logger.info(f"[tasks] {result.modified_count} scheduled görev pending'e geçti")
    return result.modified_count


async def spawn_recurring_instances() -> int:
    """Recurring template'lerden bugünkü gün/saat eşleşmesine göre child task oluştur."""
    now = datetime.now(TR_TZ)
    today_weekday = now.weekday()  # 0=Pzt
    current_hhmm = f"{now.hour:02d}:{now.minute:02d}"
    today_key = now.strftime("%Y-%m-%d")  # idempotency anahtarı

    # Aktif template'leri çek
    templates = await db.tasks.find(
        {"status": "recurring_template"},
        {"_id": 0}
    ).to_list(1000)

    spawned = 0
    for tpl in templates:
        rec = tpl.get("recurrence") or {}
        days = rec.get("days_of_week") or []
        time_of_day = rec.get("time_of_day") or ""
        until = rec.get("until")

        # Bitiş tarihi geçti mi?
        if until:
            try:
                until_dt = datetime.fromisoformat(until.replace("Z", "+00:00"))
                if now > until_dt:
                    continue
            except ValueError:
                pass

        # Gün eşleşiyor mu?
        if today_weekday not in days:
            continue
        # Saat eşleşiyor mu? (template'in tam dakikasında çalış)
        if time_of_day != current_hhmm:
            continue

        # Bugün için zaten oluşturulmuş mu? (idempotency)
        existing = await db.tasks.find_one({
            "parent_task_id": tpl["id"],
            "spawn_date": today_key,
        }, {"_id": 0, "id": 1})
        if existing:
            continue

        # Child instance oluştur
        child = {
            "id": str(uuid.uuid4()),
            "company_id": tpl["company_id"],
            "title": tpl["title"],
            "description": tpl.get("description"),
            "assigned_to": tpl["assigned_to"],
            "assigned_to_name": tpl.get("assigned_to_name", ""),
            "assigned_by": tpl["assigned_by"],
            "assigned_by_name": tpl.get("assigned_by_name", ""),
            "due_date": None,
            "is_urgent": False,
            "status": "pending",
            "completed_at": None,
            "completion_notes": None,
            "completion_images": [],
            "scheduled_at": None,
            "recurrence": None,
            "parent_task_id": tpl["id"],
            "spawn_date": today_key,
            "created_at": now.isoformat(),
            "updated_at": now.isoformat(),
        }
        await db.tasks.insert_one(child)
        spawned += 1

    if spawned:
        logger.info(f"[tasks] {spawned} recurring instance üretildi")
    return spawned


async def run_tasks_scheduler_tick():
    """Her dakika çağrılır: scheduled aktivasyon + recurring spawn."""
    try:
        await activate_scheduled_tasks()
    except Exception as e:
        logger.exception(f"[tasks] activate_scheduled_tasks hata: {e}")

    try:
        await spawn_recurring_instances()
    except Exception as e:
        logger.exception(f"[tasks] spawn_recurring_instances hata: {e}")
