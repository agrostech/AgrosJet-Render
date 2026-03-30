"""
Yük Testi Servisi - A'dan Z'ye kurye simülasyonu.
Geçici veri oluşturur, simülasyon çalıştırır, sonuçları raporlar, temizler.
Tüm geçici veriler _loadtest: True flag'i ile işaretlenir.
"""
import asyncio
import time
import uuid
import random
import httpx
from datetime import datetime
from collections import defaultdict
from utils.database import db
from utils.helpers import get_turkey_now, hash_password
from utils.jwt_utils import create_token

LOADTEST_FLAG = "_loadtest"
INTERNAL_URL = "http://localhost:8001/api"


class LoadTestMetrics:
    def __init__(self):
        self.reset()

    def reset(self):
        self.total = 0
        self.success = 0
        self.failed = 0
        self.rate_limited = 0
        self.by_endpoint = defaultdict(lambda: {"total": 0, "success": 0, "failed": 0, "times": [], "rate_limited": 0})
        self.start_time = None
        self.timeline = []
        self.errors = []
        self._lock = asyncio.Lock()

    async def record(self, endpoint: str, elapsed: float, status: int):
        async with self._lock:
            self.total += 1
            ep = self.by_endpoint[endpoint]
            ep["total"] += 1
            ep["times"].append(elapsed)

            if status == 429:
                self.rate_limited += 1
                ep["rate_limited"] += 1
            elif 200 <= status < 400:
                self.success += 1
                ep["success"] += 1
            else:
                self.failed += 1
                ep["failed"] += 1

    async def record_error(self, endpoint: str, error: str):
        async with self._lock:
            self.total += 1
            self.failed += 1
            self.by_endpoint[endpoint]["total"] += 1
            self.by_endpoint[endpoint]["failed"] += 1
            if len(self.errors) < 50:
                self.errors.append({"endpoint": endpoint, "error": error, "time": get_turkey_now()})

    def snapshot(self):
        elapsed = time.time() - self.start_time if self.start_time else 0
        rps = self.total / elapsed if elapsed > 0 else 0

        endpoints = {}
        for name, ep in self.by_endpoint.items():
            times = ep["times"]
            sorted_times = sorted(times) if times else [0]
            avg = sum(times) / len(times) if times else 0
            p95 = sorted_times[int(len(sorted_times) * 0.95)] if len(sorted_times) > 1 else (sorted_times[0] if sorted_times else 0)
            p99 = sorted_times[int(len(sorted_times) * 0.99)] if len(sorted_times) > 1 else (sorted_times[0] if sorted_times else 0)
            endpoints[name] = {
                "total": ep["total"],
                "success": ep["success"],
                "failed": ep["failed"],
                "rate_limited": ep["rate_limited"],
                "avg_ms": round(avg * 1000, 1),
                "p95_ms": round(p95 * 1000, 1),
                "p99_ms": round(p99 * 1000, 1),
            }

        return {
            "total_requests": self.total,
            "successful": self.success,
            "failed": self.failed,
            "rate_limited": self.rate_limited,
            "elapsed_seconds": round(elapsed, 1),
            "rps": round(rps, 1),
            "endpoints": endpoints,
            "recent_errors": self.errors[-10:],
            "timeline": self.timeline[-60:],
        }


class LoadTestRunner:
    _instance = None

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def __init__(self):
        self.running = False
        self.phase = "idle"
        self.metrics = LoadTestMetrics()
        self.courier_count = 0
        self.orders_per_courier = 3
        self.duration = 60
        self.temp_company_id = None
        self.temp_courier_ids = []
        self.temp_courier_tokens = {}
        self.temp_order_ids = []
        self.temp_restaurant_id = None
        self.admin_token = None
        self._task = None
        self._stop_event = asyncio.Event()
        self.progress = 0
        self.setup_log = []

    def get_status(self):
        return {
            "running": self.running,
            "phase": self.phase,
            "courier_count": self.courier_count,
            "progress": self.progress,
            "setup_log": self.setup_log[-15:],
            "metrics": self.metrics.snapshot() if self.metrics.start_time else None,
        }

    async def start(self, courier_count: int, duration: int = 60):
        if self.running:
            return {"error": "Test zaten çalışıyor"}

        self.running = True
        self.courier_count = courier_count
        self.duration = duration
        self.orders_per_courier = 3
        self.metrics.reset()
        self.setup_log = []
        self.progress = 0
        self._stop_event.clear()

        self._task = asyncio.create_task(self._run())
        return {"message": f"{courier_count} kurye ile yük testi başlatıldı"}

    async def stop(self):
        if not self.running:
            return {"error": "Test çalışmıyor"}
        self._stop_event.set()
        self.phase = "stopping"
        return {"message": "Test durduruluyor..."}

    async def _run(self):
        try:
            await self._setup()
            if not self._stop_event.is_set():
                await self._simulate()
        except Exception as e:
            self._log(f"HATA: {str(e)}")
        finally:
            self.phase = "cleaning"
            self._log("Geçici veriler temizleniyor...")
            await self._cleanup()
            self.phase = "done"
            self.running = False
            self._log("Test tamamlandı.")

    def _log(self, msg):
        self.setup_log.append({"time": get_turkey_now(), "msg": msg})

    # ─── SETUP ────────────────────────────────────────────
    async def _setup(self):
        self.phase = "setup"
        self._log(f"Kurulum başlıyor: {self.courier_count} kurye, {self.courier_count * self.orders_per_courier} sipariş")

        # 1. Geçici şirket
        self.temp_company_id = str(uuid.uuid4())
        await db.companies.insert_one({
            "id": self.temp_company_id,
            "name": "LoadTest Şirketi",
            "owner_id": "loadtest",
            LOADTEST_FLAG: True,
            "created_at": get_turkey_now(),
        })
        self._log("Geçici şirket oluşturuldu")

        # 2. Geçici admin token
        self.admin_token = create_token("loadtest-admin", "admin", {"company_id": self.temp_company_id})

        # 3. Geçici restoran
        self.temp_restaurant_id = str(uuid.uuid4())
        await db.restaurants.insert_one({
            "id": self.temp_restaurant_id,
            "name": "LoadTest Restoran",
            "company_id": self.temp_company_id,
            LOADTEST_FLAG: True,
            "created_at": get_turkey_now(),
        })

        # 4. Geçici kuryeler (batch insert)
        courier_docs = []
        relation_docs = []
        self.temp_courier_ids = []
        self.temp_courier_tokens = {}

        for i in range(self.courier_count):
            cid = str(uuid.uuid4())
            self.temp_courier_ids.append(cid)

            courier_docs.append({
                "id": cid,
                "name": f"LT Kurye {i+1}",
                "phone": f"05599{i:06d}",
                "password": hash_password("loadtest"),
                "availability_status": "active",
                "company_id": self.temp_company_id,
                LOADTEST_FLAG: True,
                "created_at": get_turkey_now(),
            })

            relation_docs.append({
                "id": str(uuid.uuid4()),
                "company_id": self.temp_company_id,
                "courier_id": cid,
                "status": "active",
                "is_active": True,
                "is_archived": False,
                LOADTEST_FLAG: True,
                "created_at": get_turkey_now(),
            })

            self.temp_courier_tokens[cid] = create_token(cid, "courier", {"company_id": self.temp_company_id})

        if courier_docs:
            await db.couriers.insert_many(courier_docs)
            await db.company_couriers.insert_many(relation_docs)
        self.progress = 10
        self._log(f"{self.courier_count} kurye oluşturuldu")

        # 5. Geçici siparişler (her kuryeye 3 sipariş)
        order_docs = []
        self.temp_order_ids = []
        for cid in self.temp_courier_ids:
            for j in range(self.orders_per_courier):
                oid = str(uuid.uuid4())
                self.temp_order_ids.append(oid)
                order_docs.append({
                    "id": oid,
                    "company_id": self.temp_company_id,
                    "restaurant_id": self.temp_restaurant_id,
                    "courier_id": cid,
                    "status": "assigned",
                    "customer_name": f"Musteri {j+1}",
                    "customer_phone": f"0532{random.randint(1000000, 9999999)}",
                    "customer_address": "Test adres, Burdur",
                    "total_amount": round(random.uniform(50, 300), 2),
                    "payment_method": random.choice(["cash", "card", "online"]),
                    LOADTEST_FLAG: True,
                    "created_at": get_turkey_now(),
                })

        if order_docs:
            await db.orders.insert_many(order_docs)
        self.progress = 20
        total_orders = self.courier_count * self.orders_per_courier
        self._log(f"{total_orders} sipariş oluşturuldu")
        self._log("Kurulum tamamlandı. Simülasyon başlıyor...")

    # ─── SIMULATION ───────────────────────────────────────
    async def _simulate(self):
        self.phase = "running"
        self.metrics.start_time = time.time()

        # Worker'ları başlat
        tasks = []
        for i, cid in enumerate(self.temp_courier_ids):
            token = self.temp_courier_tokens[cid]
            courier_orders = self.temp_order_ids[i * self.orders_per_courier:(i + 1) * self.orders_per_courier]
            tasks.append(asyncio.create_task(
                self._courier_worker(cid, token, courier_orders)
            ))

        # Admin polling worker (2 adet)
        tasks.append(asyncio.create_task(self._admin_worker()))
        tasks.append(asyncio.create_task(self._admin_worker()))

        # Timeline tracker
        tasks.append(asyncio.create_task(self._timeline_tracker()))

        # Duration timer
        try:
            await asyncio.wait_for(self._stop_event.wait(), timeout=self.duration)
        except asyncio.TimeoutError:
            pass

        self._stop_event.set()
        self._log("Simülasyon durduruluyor, worker'lar bitiyor...")

        # Worker'ların bitmesini bekle (max 10sn)
        for t in tasks:
            t.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)

        self.progress = 90
        self._log("Simülasyon tamamlandı")

    async def _courier_worker(self, courier_id: str, token: str, order_ids: list):
        """Tek kurye simülasyonu: poll + location + sipariş döngüsü"""
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        poll_interval = 10
        location_interval = 30
        order_cycle_interval = 20  # Her 20 saniyede bir sipariş durumu değişir

        last_poll = 0
        last_location = 0
        last_order_action = 0
        order_index = 0
        order_phase = 0  # 0: picked_up, 1: delivered, 2: yeni sipariş cycle

        async with httpx.AsyncClient(timeout=15) as client:
            while not self._stop_event.is_set():
                now = time.time()

                # Poll (her 10sn)
                if now - last_poll >= poll_interval:
                    last_poll = now
                    await self._timed_request(
                        client, "GET",
                        f"{INTERNAL_URL}/couriers/{courier_id}/poll?company_id={self.temp_company_id}",
                        "courier_poll", headers=headers
                    )

                # Location (her 30sn)
                if now - last_location >= location_interval:
                    last_location = now
                    lat = 37.75 + random.uniform(-0.05, 0.05)
                    lng = 30.55 + random.uniform(-0.05, 0.05)
                    await self._timed_request(
                        client, "PUT",
                        f"{INTERNAL_URL}/couriers/{courier_id}/location",
                        "courier_location",
                        json={
                            "latitude": lat, "longitude": lng,
                            "batteryLevel": random.uniform(0.1, 1.0),
                            "batteryState": random.choice(["charging", "unplugged"]),
                            "accuracy": random.uniform(5, 50),
                        }
                    )

                # Sipariş döngüsü (her 20sn)
                if now - last_order_action >= order_cycle_interval and order_ids:
                    last_order_action = now
                    oid = order_ids[order_index % len(order_ids)]

                    if order_phase == 0:
                        # Sipariş onayı (assigned → confirmed)
                        await self._timed_request(
                            client, "POST",
                            f"{INTERNAL_URL}/orders/courier/{courier_id}/order/{oid}/confirm",
                            "order_confirm",
                            headers=headers,
                        )
                    elif order_phase == 1:
                        # Yola çıktı (confirmed → on_the_way)
                        await self._timed_request(
                            client, "POST",
                            f"{INTERNAL_URL}/orders/courier/{courier_id}/order/{oid}/pickup",
                            "order_pickup",
                            headers=headers,
                        )
                    elif order_phase == 2:
                        # Teslim edildi (on_the_way → delivered)
                        await self._timed_request(
                            client, "POST",
                            f"{INTERNAL_URL}/orders/courier/{courier_id}/order/{oid}/deliver",
                            "order_deliver",
                            headers=headers,
                        )
                    elif order_phase == 3:
                        # Siparişi sıfırla (cycle için - doğrudan DB güncelle)
                        await db.orders.update_one(
                            {"id": oid},
                            {"$set": {"status": "assigned"}}
                        )
                        await self.metrics.record("order_reset_db", 0.001, 200)

                    order_phase = (order_phase + 1) % 4
                    if order_phase == 0:
                        order_index = (order_index + 1) % len(order_ids)

                # Sipariş listesi (her 15sn)
                if now - last_poll >= 5 and int(now) % 15 == 0:
                    await self._timed_request(
                        client, "GET",
                        f"{INTERNAL_URL}/orders/v2/list?panel=courier&courier_id={courier_id}&status=active&limit=50",
                        "courier_order_list", headers=headers
                    )

                await asyncio.sleep(1)

    async def _admin_worker(self):
        """Admin panel simülasyonu: kurye listesi + sipariş listesi polling"""
        headers = {"Authorization": f"Bearer {self.admin_token}", "Content-Type": "application/json"}
        async with httpx.AsyncClient(timeout=15) as client:
            while not self._stop_event.is_set():
                # Kurye konumları (her 10sn)
                await self._timed_request(
                    client, "GET",
                    f"{INTERNAL_URL}/companies/{self.temp_company_id}/couriers/with-availability",
                    "admin_courier_map", headers=headers
                )
                await asyncio.sleep(5)

                if self._stop_event.is_set():
                    break

                # Sipariş listesi (her 5sn)
                await self._timed_request(
                    client, "GET",
                    f"{INTERNAL_URL}/orders/v2/list?panel=admin&company_id={self.temp_company_id}&limit=100",
                    "admin_order_list", headers=headers
                )
                await asyncio.sleep(5)

    async def _timed_request(self, client, method, url, endpoint_name, headers=None, json=None):
        start = time.time()
        try:
            if method == "GET":
                r = await client.get(url, headers=headers)
            elif method == "PUT":
                r = await client.put(url, headers=headers, json=json)
            elif method == "POST":
                r = await client.post(url, headers=headers, json=json)
            else:
                return

            elapsed = time.time() - start
            await self.metrics.record(endpoint_name, elapsed, r.status_code)
        except Exception as e:
            await self.metrics.record_error(endpoint_name, str(e)[:100])

    async def _timeline_tracker(self):
        """Her 2 saniyede bir timeline snapshot'ı al"""
        last_total = 0
        while not self._stop_event.is_set():
            await asyncio.sleep(2)
            snap = self.metrics.snapshot()
            current_total = snap["total_requests"]
            rps = (current_total - last_total) / 2
            last_total = current_total

            elapsed = snap["elapsed_seconds"]
            self.progress = min(85, int(20 + (elapsed / self.duration) * 65))

            self.metrics.timeline.append({
                "t": round(elapsed, 1),
                "rps": round(rps, 1),
                "total": current_total,
                "failed": snap["failed"],
                "rate_limited": snap["rate_limited"],
            })

    # ─── CLEANUP ──────────────────────────────────────────
    async def _cleanup(self):
        try:
            r1 = await db.orders.delete_many({LOADTEST_FLAG: True})
            r2 = await db.company_couriers.delete_many({LOADTEST_FLAG: True})
            r3 = await db.couriers.delete_many({LOADTEST_FLAG: True})
            r4 = await db.companies.delete_many({LOADTEST_FLAG: True})
            r5 = await db.restaurants.delete_many({LOADTEST_FLAG: True})
            total = r1.deleted_count + r2.deleted_count + r3.deleted_count + r4.deleted_count + r5.deleted_count
            self._log(f"Temizlik tamamlandı: {total} kayıt silindi")
        except Exception as e:
            self._log(f"Temizlik hatası: {str(e)}")

        self.temp_company_id = None
        self.temp_courier_ids = []
        self.temp_courier_tokens = {}
        self.temp_order_ids = []
        self.temp_restaurant_id = None
        self.progress = 100

    async def force_cleanup(self):
        """Manuel temizlik - crash sonrası kalan verileri siler"""
        r1 = await db.orders.delete_many({LOADTEST_FLAG: True})
        r2 = await db.company_couriers.delete_many({LOADTEST_FLAG: True})
        r3 = await db.couriers.delete_many({LOADTEST_FLAG: True})
        r4 = await db.companies.delete_many({LOADTEST_FLAG: True})
        r5 = await db.restaurants.delete_many({LOADTEST_FLAG: True})
        total = r1.deleted_count + r2.deleted_count + r3.deleted_count + r4.deleted_count + r5.deleted_count
        return {"message": f"{total} geçici kayıt silindi", "deleted": total}
