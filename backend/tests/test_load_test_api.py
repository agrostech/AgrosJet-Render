"""
Load Test API Tests - Yük Testi API Testleri
Tests for /api/load-test/* endpoints
"""
import pytest
import requests
import time
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestLoadTestAPI:
    """Load Test API endpoint tests"""
    
    def test_get_status_initial(self):
        """GET /api/load-test/status - should return status object"""
        response = requests.get(f"{BASE_URL}/api/load-test/status")
        assert response.status_code == 200
        
        data = response.json()
        assert "running" in data
        assert "phase" in data
        assert "courier_count" in data
        assert "progress" in data
        assert "setup_log" in data
        assert isinstance(data["running"], bool)
        assert isinstance(data["phase"], str)
        print(f"✓ Status endpoint returns valid structure: running={data['running']}, phase={data['phase']}")
    
    def test_cleanup_endpoint(self):
        """POST /api/load-test/cleanup - should clean up any leftover test data"""
        response = requests.post(f"{BASE_URL}/api/load-test/cleanup")
        assert response.status_code == 200
        
        data = response.json()
        assert "message" in data
        assert "deleted" in data
        assert isinstance(data["deleted"], int)
        print(f"✓ Cleanup endpoint works: {data['message']}")
    
    def test_start_load_test_with_10_couriers_15_seconds(self):
        """POST /api/load-test/start - start test with 10 couriers, 15 seconds"""
        # First ensure no test is running
        status = requests.get(f"{BASE_URL}/api/load-test/status").json()
        if status.get("running"):
            requests.post(f"{BASE_URL}/api/load-test/stop")
            time.sleep(10)  # Wait for cleanup
        
        # Start the test
        response = requests.post(
            f"{BASE_URL}/api/load-test/start",
            json={"courier_count": 10, "duration": 15}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "message" in data
        assert "10 kurye" in data["message"]
        print(f"✓ Load test started: {data['message']}")
        
        # Wait a bit and check status
        time.sleep(3)
        status = requests.get(f"{BASE_URL}/api/load-test/status").json()
        assert status["running"] == True or status["phase"] in ["setup", "running", "cleaning", "done"]
        print(f"✓ Test is running: phase={status['phase']}, progress={status['progress']}%")
        
        # Wait for test to complete
        max_wait = 30
        waited = 0
        while waited < max_wait:
            status = requests.get(f"{BASE_URL}/api/load-test/status").json()
            if not status["running"] and status["phase"] == "done":
                break
            time.sleep(2)
            waited += 2
        
        # Verify test completed
        final_status = requests.get(f"{BASE_URL}/api/load-test/status").json()
        assert final_status["phase"] == "done"
        assert final_status["progress"] == 100
        print(f"✓ Test completed: phase={final_status['phase']}, progress={final_status['progress']}%")
        
        # Verify metrics
        metrics = final_status.get("metrics")
        assert metrics is not None
        assert metrics["total_requests"] > 0
        assert metrics["successful"] >= 0
        assert metrics["failed"] >= 0
        print(f"✓ Metrics: total={metrics['total_requests']}, success={metrics['successful']}, failed={metrics['failed']}")
    
    def test_stop_running_test(self):
        """POST /api/load-test/stop - should stop a running test"""
        # Start a longer test
        requests.post(
            f"{BASE_URL}/api/load-test/start",
            json={"courier_count": 10, "duration": 60}
        )
        time.sleep(3)
        
        # Stop it
        response = requests.post(f"{BASE_URL}/api/load-test/stop")
        assert response.status_code == 200
        
        data = response.json()
        assert "message" in data
        print(f"✓ Stop endpoint works: {data['message']}")
        
        # Wait for cleanup
        time.sleep(10)
        
        # Verify test stopped
        status = requests.get(f"{BASE_URL}/api/load-test/status").json()
        assert status["running"] == False
        print(f"✓ Test stopped: running={status['running']}, phase={status['phase']}")
    
    def test_stop_when_not_running(self):
        """POST /api/load-test/stop - should return error when no test running"""
        # Ensure no test is running
        status = requests.get(f"{BASE_URL}/api/load-test/status").json()
        if status.get("running"):
            requests.post(f"{BASE_URL}/api/load-test/stop")
            time.sleep(10)
        
        # Try to stop again
        response = requests.post(f"{BASE_URL}/api/load-test/stop")
        assert response.status_code == 200
        
        data = response.json()
        assert "error" in data
        print(f"✓ Stop when not running returns error: {data['error']}")
    
    def test_start_when_already_running(self):
        """POST /api/load-test/start - should return error when test already running"""
        # Start a test
        requests.post(
            f"{BASE_URL}/api/load-test/start",
            json={"courier_count": 10, "duration": 60}
        )
        time.sleep(2)
        
        # Try to start another
        response = requests.post(
            f"{BASE_URL}/api/load-test/start",
            json={"courier_count": 10, "duration": 30}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "error" in data
        assert "zaten" in data["error"].lower()  # "Test zaten çalışıyor"
        print(f"✓ Start when already running returns error: {data['error']}")
        
        # Cleanup
        requests.post(f"{BASE_URL}/api/load-test/stop")
        time.sleep(10)


class TestLoadTestDataCleanup:
    """Tests to verify _loadtest flagged data is properly cleaned up"""
    
    def test_no_loadtest_data_remains_after_test(self):
        """Verify no _loadtest flagged records remain in DB after test completes"""
        # Run a quick test
        requests.post(
            f"{BASE_URL}/api/load-test/start",
            json={"courier_count": 10, "duration": 10}
        )
        
        # Wait for completion
        max_wait = 30
        waited = 0
        while waited < max_wait:
            status = requests.get(f"{BASE_URL}/api/load-test/status").json()
            if not status["running"] and status["phase"] == "done":
                break
            time.sleep(2)
            waited += 2
        
        # Force cleanup just in case
        cleanup_response = requests.post(f"{BASE_URL}/api/load-test/cleanup")
        data = cleanup_response.json()
        
        # Should have 0 records to delete (already cleaned)
        assert data["deleted"] == 0, f"Expected 0 leftover records, found {data['deleted']}"
        print(f"✓ No _loadtest data remains after test: {data['message']}")


class TestLoadTestMetrics:
    """Tests for load test metrics and reporting"""
    
    def test_metrics_structure(self):
        """Verify metrics structure after test completion"""
        # Run a quick test
        requests.post(
            f"{BASE_URL}/api/load-test/start",
            json={"courier_count": 10, "duration": 10}
        )
        
        # Wait for completion
        max_wait = 30
        waited = 0
        while waited < max_wait:
            status = requests.get(f"{BASE_URL}/api/load-test/status").json()
            if not status["running"] and status["phase"] == "done":
                break
            time.sleep(2)
            waited += 2
        
        # Check metrics structure
        status = requests.get(f"{BASE_URL}/api/load-test/status").json()
        metrics = status.get("metrics")
        
        assert metrics is not None
        assert "total_requests" in metrics
        assert "successful" in metrics
        assert "failed" in metrics
        assert "rate_limited" in metrics
        assert "elapsed_seconds" in metrics
        assert "rps" in metrics
        assert "endpoints" in metrics
        assert "recent_errors" in metrics
        assert "timeline" in metrics
        
        print(f"✓ Metrics structure is valid")
        print(f"  - Total requests: {metrics['total_requests']}")
        print(f"  - Successful: {metrics['successful']}")
        print(f"  - Failed: {metrics['failed']}")
        print(f"  - Rate limited: {metrics['rate_limited']}")
        print(f"  - RPS: {metrics['rps']}")
        print(f"  - Endpoints tested: {list(metrics['endpoints'].keys())}")
    
    def test_endpoint_metrics_detail(self):
        """Verify per-endpoint metrics are captured"""
        status = requests.get(f"{BASE_URL}/api/load-test/status").json()
        metrics = status.get("metrics")
        
        if metrics and metrics.get("endpoints"):
            for endpoint_name, endpoint_data in metrics["endpoints"].items():
                assert "total" in endpoint_data
                assert "success" in endpoint_data
                assert "failed" in endpoint_data
                assert "rate_limited" in endpoint_data
                assert "avg_ms" in endpoint_data
                assert "p95_ms" in endpoint_data
                assert "p99_ms" in endpoint_data
                print(f"✓ Endpoint {endpoint_name}: total={endpoint_data['total']}, avg={endpoint_data['avg_ms']}ms")
        else:
            pytest.skip("No endpoint metrics available (no recent test run)")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
