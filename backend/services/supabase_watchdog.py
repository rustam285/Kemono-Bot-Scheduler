from __future__ import annotations

import asyncio
import time
from datetime import datetime, timezone
from typing import Any, Optional

import httpx
import structlog

from config import (
    SUPABASE_ACCESS_TOKEN,
    SUPABASE_RESTORE_TIMEOUT,
    SUPABASE_URL,
    SUPABASE_WATCHDOG_INTERVAL,
)

logger = structlog.get_logger(__name__)

MANAGEMENT_API = "https://api.supabase.com"
POLL_INTERVAL = 15  # секунды между опросами статуса во время восстановления

_state: dict[str, Any] = {
    "monitoring": False,
    "last_check_at": None,
    "db_ok": None,
    "restore": None,
}
_watchdog_task: Optional[asyncio.Task] = None


def get_state() -> dict[str, Any]:
    """Снимок состояния watchdog для /api/health."""
    return dict(_state)


def _project_ref() -> Optional[str]:
    """https://<ref>.supabase.co -> <ref>"""
    if not SUPABASE_URL:
        return None
    host = SUPABASE_URL.removeprefix("https://").removeprefix("http://").split("/")[0]
    ref = host.split(".")[0] if "." in host else ""
    return ref or None


async def _management_call(method: str, path: str) -> tuple[int, Any]:
    headers = {"Authorization": f"Bearer {SUPABASE_ACCESS_TOKEN}"}
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.request(method, f"{MANAGEMENT_API}{path}", headers=headers)
        try:
            body: Any = resp.json()
        except ValueError:
            body = resp.text
        return resp.status_code, body


async def _get_project_status() -> Optional[str]:
    ref = _project_ref()
    if not ref:
        return None
    try:
        code, body = await _management_call("GET", f"/v1/projects/{ref}")
        if code == 200 and isinstance(body, dict):
            return str(body.get("status", ""))
        logger.warning("watchdog.status_failed", code=code, body=str(body)[:200])
    except Exception as exc:
        logger.warning("watchdog.status_request_error", error=str(exc))
    return None


async def _trigger_restore() -> bool:
    """Запрашивает восстановление. True — запрос принят или восстановление уже идёт."""
    ref = _project_ref()
    if not ref:
        logger.error("watchdog.no_project_ref", supabase_url=SUPABASE_URL)
        return False
    try:
        code, body = await _management_call("POST", f"/v1/projects/{ref}/restore")
        if 200 <= code < 300:
            logger.info("watchdog.restore_requested", ref=ref)
            return True
        if code in (401, 403):
            logger.error(
                "watchdog.token_invalid",
                code=code,
                hint="Проверьте SUPABASE_ACCESS_TOKEN (https://supabase.com/dashboard/account/tokens)",
            )
            return False
        # Например, «restore уже выполняется» (запущен с дашборда) — всё равно подождём активации
        logger.warning("watchdog.restore_rejected", code=code, body=str(body)[:300])
        return True
    except Exception as exc:
        logger.error("watchdog.restore_request_failed", error=str(exc))
        return False


async def _wait_until_active(timeout: int) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        status = await _get_project_status()
        if status == "ACTIVE":
            return True
        await asyncio.sleep(POLL_INTERVAL)
    logger.error("watchdog.restore_timeout", timeout=timeout)
    return False


async def check_and_restore() -> bool:
    """Проверяет доступность БД; при паузе проекта запускает восстановление через Management API."""
    from services.supabase_client import check_supabase_health, recreate_client

    db_ok = await check_supabase_health()
    _state["last_check_at"] = datetime.now(timezone.utc).isoformat()
    _state["db_ok"] = db_ok
    if db_ok:
        return True

    if not SUPABASE_ACCESS_TOKEN:
        logger.error(
            "watchdog.db_unreachable_no_token",
            hint="Создайте personal access token на https://supabase.com/dashboard/account/tokens "
                 "и добавьте SUPABASE_ACCESS_TOKEN в .env для авто-восстановления",
        )
        return False

    status = await _get_project_status()
    logger.info("watchdog.project_status", status=status)
    if status == "ACTIVE":
        # Проект активен, но БД не отвечает — обычный сбой, restore не поможет
        return False

    started_at = datetime.now(timezone.utc).isoformat()
    _state["restore"] = {"status": "in_progress", "started_at": started_at, "error": None}

    if await _trigger_restore():
        restored = await _wait_until_active(SUPABASE_RESTORE_TIMEOUT)
        if restored:
            await recreate_client()
            db_ok = await check_supabase_health()
            _state["db_ok"] = db_ok
            _state["restore"] = {
                "status": "ok" if db_ok else "failed",
                "started_at": started_at,
                "finished_at": datetime.now(timezone.utc).isoformat(),
                "error": None if db_ok else "Проект активен, но БД всё ещё не отвечает",
            }
            logger.info("watchdog.restore_finished", db_ok=db_ok)
            return db_ok

    _state["restore"] = {
        "status": "failed",
        "started_at": started_at,
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "error": "Не удалось восстановить проект — проверьте дашборд Supabase и логи",
    }
    return False


async def _watchdog_loop() -> None:
    _state["monitoring"] = True
    while True:
        try:
            await check_and_restore()
        except Exception as exc:
            logger.error("watchdog.loop_error", error=str(exc))
        # Регулярный ping — пока приложение запущено, это тоже активность
        # для анти-паузы Supabase на free-тарифе
        await asyncio.sleep(SUPABASE_WATCHDOG_INTERVAL)


async def start_watchdog() -> None:
    global _watchdog_task
    if _watchdog_task is None or _watchdog_task.done():
        _watchdog_task = asyncio.create_task(_watchdog_loop())
