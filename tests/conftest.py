import os

TEST_DB_PATH = os.path.join(os.path.dirname(__file__), "_test_app.db")
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{TEST_DB_PATH}"
os.environ.setdefault("REDIS_URL", "redis://localhost:6380")

import pytest
import redis.asyncio as redis_async

from multiplayer import redis_bus


@pytest.fixture(scope="session", autouse=True)
def _clean_shared_db_file():
    if os.path.exists(TEST_DB_PATH):
        os.remove(TEST_DB_PATH)
    yield
    if os.path.exists(TEST_DB_PATH):
        os.remove(TEST_DB_PATH)


@pytest.fixture(autouse=True)
def _fresh_redis_client_per_test():

    redis_bus.redis_client = redis_async.from_url(redis_bus.REDIS_URL, decode_responses=True)
    yield