from __future__ import annotations

import asyncio
import time
from typing import Any, Optional

import httpx
import structlog

from config import VK_API_VERSION
from services.settings_store import get_settings

logger = structlog.get_logger(__name__)

BASE_URL = "https://api.vk.com/method"
MAX_RETRIES = 3
RETRY_DELAYS = [1, 4, 16]


class VkApiError(Exception):
    def __init__(self, code: int, message: str):
        self.code = code
        self.message = message
        super().__init__(f"VK API error {code}: {message}")


async def _call_method(
    method: str,
    params: dict[str, Any],
    token: str,
    retries: int = MAX_RETRIES,
) -> dict[str, Any]:
    all_params = {
        **params,
        "access_token": token,
        "v": VK_API_VERSION,
    }

    last_exc: Optional[Exception] = None
    for attempt in range(retries):
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(f"{BASE_URL}/{method}", data=all_params)
                data = resp.json()

            if "error" in data:
                err = data["error"]
                code = err.get("error_code", 0)
                msg = err.get("error_msg", "Unknown error")
                if code == 6:
                    delay = RETRY_DELAYS[min(attempt, len(RETRY_DELAYS) - 1)]
                    logger.warning("vk_api.too_many_requests", method=method, delay=delay)
                    await asyncio.sleep(delay)
                    continue
                raise VkApiError(code, msg)

            return data.get("response", data)

        except httpx.HTTPError as exc:
            last_exc = exc
            delay = RETRY_DELAYS[min(attempt, len(RETRY_DELAYS) - 1)]
            logger.warning("vk_api.http_error", method=method, error=str(exc), delay=delay)
            await asyncio.sleep(delay)

    raise VkApiError(0, f"All {retries} retries exhausted: {last_exc}")


async def call_method(method: str, params: dict[str, Any] | None = None) -> Any:
    settings = await get_settings()
    token = settings.get("vk_token", "")
    if not token:
        raise VkApiError(0, "VK token is not configured")
    return await _call_method(method, params or {}, token)


async def call_method_with_token(method: str, params: dict[str, Any], token: str) -> Any:
    return await _call_method(method, params, token)
