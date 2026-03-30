"""
Yük Testi API Endpoint'leri.
System Admin panelinden tetiklenir.
"""
from fastapi import APIRouter
from services.load_test_service import LoadTestRunner
from pydantic import BaseModel

router = APIRouter(tags=["Load Test"])


class LoadTestStartRequest(BaseModel):
    courier_count: int = 50
    duration: int = 60


@router.post("/api/load-test/start")
@router.post("/load-test/start")
async def start_load_test(data: LoadTestStartRequest):
    runner = LoadTestRunner.get_instance()
    return await runner.start(data.courier_count, data.duration)


@router.get("/api/load-test/status")
@router.get("/load-test/status")
async def get_load_test_status():
    runner = LoadTestRunner.get_instance()
    return runner.get_status()


@router.post("/api/load-test/stop")
@router.post("/load-test/stop")
async def stop_load_test():
    runner = LoadTestRunner.get_instance()
    return await runner.stop()


@router.post("/api/load-test/cleanup")
@router.post("/load-test/cleanup")
async def force_cleanup():
    runner = LoadTestRunner.get_instance()
    return await runner.force_cleanup()
