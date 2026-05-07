"""Shared pytest config for backend tests."""
import sys
import pytest

sys.path.insert(0, "/app/backend")


def pytest_collection_modifyitems(config, items):
    """Force session-scoped event loop for async tests so motor client is reused."""
    for item in items:
        if "asyncio" in getattr(item, "keywords", {}):
            continue


@pytest.fixture(scope="session")
def event_loop_policy():
    import asyncio
    return asyncio.DefaultEventLoopPolicy()
