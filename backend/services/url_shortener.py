from __future__ import annotations

import structlog

from services.vk_api import VkApiError, call_method

logger = structlog.get_logger(__name__)


async def get_short_link(url: str) -> str:
    try:
        result = await call_method("utils.getShortLink", {"url": url, "private": 0})
        if isinstance(result, dict) and "short_url" in result:
            short = result["short_url"]
            logger.debug("url_shortener.success", original=url, short=short)
            return short
    except VkApiError as exc:
        logger.warning("url_shortener.failed", url=url, error=str(exc))
    except Exception as exc:
        logger.warning("url_shortener.unexpected_error", url=url, error=str(exc))

    return url
