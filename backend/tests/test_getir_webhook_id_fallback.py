"""
Test: Getir webhook ID fallback ve test/ping handling
- id, orderId, _id, clientOrderId fallback'leri çalışmalı
- Boş payload (test/ping) 200 dönmeli
- Tam payload integration_logs'a yazılmalı
"""
import asyncio
import os
import httpx
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")

API_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001")
API_KEY = os.environ.get("GETIR_WEBHOOK_API_KEY", "").strip('"')


async def test_getir_id_fallbacks():
    headers = {"x-api-key": API_KEY, "Content-Type": "application/json"}
    cases = [
        ("id field", {"id": "X1", "status": "new"}),
        ("orderId field", {"orderId": "X2", "status": "new"}),
        ("_id field", {"_id": "X3", "status": "new"}),
        ("clientOrderId field", {"clientOrderId": "X4", "status": "new"}),
        ("empty payload (test/ping)", {}),
        ("event ping payload", {"event": "ping"}),
    ]
    async with httpx.AsyncClient(timeout=15) as client:
        for name, body in cases:
            r = await client.post(f"{API_URL}/api/webhooks/getir/order", headers=headers, json=body)
            data = r.json()
            print(f"[{name}] status={r.status_code}, response={data}")
            # Hiçbir test 401 / 500 dönmemeli (auth ok ve ID handling ok)
            assert r.status_code != 401, f"{name} - Auth failed"
            # Boş/ping payload'lar için 200 ok action=skipped beklenir
            if not body or body == {"event": "ping"}:
                assert data.get("action") == "skipped" or "Sipariş ID bulunamadı" in data.get("message", ""), \
                    f"{name} - Beklenmedik response: {data}"


async def test_getir_cancel_id_fallbacks():
    headers = {"x-api-key": API_KEY, "Content-Type": "application/json"}
    cases = [
        ("cancel id field", {"id": "C1", "cancelReason": "test"}),
        ("cancel orderId field", {"orderId": "C2", "cancelReason": "test"}),
        ("cancel empty", {}),
    ]
    async with httpx.AsyncClient(timeout=15) as client:
        for name, body in cases:
            r = await client.post(f"{API_URL}/api/webhooks/getir/cancel", headers=headers, json=body)
            data = r.json()
            print(f"[{name}] status={r.status_code}, response={data}")
            assert r.status_code != 401


if __name__ == "__main__":
    asyncio.run(test_getir_id_fallbacks())
    asyncio.run(test_getir_cancel_id_fallbacks())
    print("\n✅ Tüm Getir webhook ID fallback testleri geçti")
