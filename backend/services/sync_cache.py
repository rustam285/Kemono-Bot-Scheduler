from __future__ import annotations

import asyncio
import time
from typing import Any, Optional

_sync_cache: Optional[tuple[float, list]] = None
_SYNC_CACHE_TTL = 3600
_sync_lock = asyncio.Lock()


def get_sync_lock() -> asyncio.Lock:
    return _sync_lock


def get_cached_sync() -> Optional[tuple[float, list]]:
    return _sync_cache


def set_cached_sync(data: list) -> None:
    global _sync_cache
    _sync_cache = (time.time(), data)


def invalidate_sync_cache() -> None:
    global _sync_cache
    _sync_cache = None


def get_sync_cache_ttl() -> int:
    return _SYNC_CACHE_TTL
