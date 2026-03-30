"""
Yük Testi API Endpoint'leri.
System Admin panelinden tetiklenir.
"""
from fastapi import APIRouter
from services.load_test_service import LoadTestRunner
from pydantic import BaseModel

router = APIRouter(prefix="/api/load-test", tags=["Load Test"])


class LoadTestStartRequest(BaseModel):
    courier_count: int = 50
    duration: int = 60


@router.post("/start")
async def start_load_test(data: LoadTestStartRequest):
    runner = LoadTestRunner.get_instance()
    return await runner.start(data.courier_count, data.duration)


@router.get("/status")
async def get_load_test_status():
    runner = LoadTestRunner.get_instance()
    return runner.get_status()


@router.post("/stop")
async def stop_load_test():
    runner = LoadTestRunner.get_instance()
    return await runner.stop()


@router.post("/cleanup")
async def force_cleanup():
    runner = LoadTestRunner.get_instance()
    return await runner.force_cleanup()
