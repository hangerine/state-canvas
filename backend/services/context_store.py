import os
import json
import logging
import time
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

class ContextStore:
    def __init__(self, ttl_ms: int = 4_200_000):
        self.ttl_ms = ttl_ms

    async def get(self, key: str) -> Optional[Dict[str, Any]]:
        raise NotImplementedError

    async def set(self, key: str, value: Dict[str, Any]) -> None:
        raise NotImplementedError


class InMemoryContextStore(ContextStore):
    def __init__(self, ttl_ms: int = 4_200_000):
        super().__init__(ttl_ms)
        self._store: Dict[str, Dict[str, Any]] = {}

    async def get(self, key: str) -> Optional[Dict[str, Any]]:
        entry = self._store.get(key)
        if not entry:
            return None
        expires_at = entry.get("_expires_at", 0)
        if expires_at and expires_at < int(time.time() * 1000):
            self._store.pop(key, None)
            return None
        return entry.get("data")

    async def set(self, key: str, value: Dict[str, Any]) -> None:
        self._store[key] = {
            "data": value,
            "_expires_at": int(time.time() * 1000) + self.ttl_ms
        }


class RedisContextStore(ContextStore):
    def __init__(self, redis_url: str, ttl_ms: int = 4_200_000):
        super().__init__(ttl_ms)
        self._redis = None
        self._redis_url = redis_url
        try:
            import aioredis  # type: ignore
            self._aioredis = aioredis
        except Exception:
            self._aioredis = None
            logger.warning("aioredis not available; falling back to InMemory store")

    async def _ensure(self):
        if self._redis or not self._aioredis:
            return
        self._redis = await self._aioredis.from_url(self._redis_url, encoding="utf-8", decode_responses=True)

    async def get(self, key: str) -> Optional[Dict[str, Any]]:
        if not self._aioredis:
            return None
        await self._ensure()
        raw = await self._redis.get(key)
        if not raw:
            return None
        try:
            return json.loads(raw)
        except Exception:
            return None

    async def set(self, key: str, value: Dict[str, Any]) -> None:
        if not self._aioredis:
            return
        await self._ensure()
        await self._redis.set(key, json.dumps(value), px=self.ttl_ms)


def build_context_store_from_env() -> ContextStore:
    ttl_ms_str = os.getenv("CONTEXT_TTL_MS", "4200000")
    try:
        ttl_ms = int(ttl_ms_str)
    except Exception:
        ttl_ms = 4_200_000
    redis_url = os.getenv("REDIS_URL", "").strip()
    if redis_url:
        store = RedisContextStore(redis_url, ttl_ms)
        if getattr(store, "_aioredis", None) is not None:
            return store
    return InMemoryContextStore(ttl_ms)


