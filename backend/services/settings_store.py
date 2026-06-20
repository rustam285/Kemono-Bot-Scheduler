from __future__ import annotations

import asyncio
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import structlog

from config import COOKIES_PATH, DATA_DIR, ENCRYPTION_KEY, SETTINGS_PATH
from services.crypto import decrypt, encrypt

logger = structlog.get_logger(__name__)

DEFAULT_SETTINGS: dict[str, Any] = {
    "vk_token": "",
    "vk_group_id": None,
    "vk_owner_id": None,
    "time_slots": ["10:00", "15:00", "20:00"],
    "timezone": "Europe/Moscow",
    "max_download_workers": 3,
    "vk_publish_delay_seconds": 5,
    "ytdlp_timeout_seconds": 30,
    "max_photo_size_mb": 50,
    "max_video_size_mb": 500,
    "cookies_uploaded_at": None,
    "tg_channel_id": None,
    "tg_channel_title": None,
}

_lock = asyncio.Lock()


def _merge_with_defaults(data: dict[str, Any]) -> dict[str, Any]:
    merged = {**DEFAULT_SETTINGS, **data}
    return merged


def _encrypt_token(token: str) -> str:
    if not token or not ENCRYPTION_KEY:
        return token
    if token.startswith("enc:"):
        return token
    return "enc:" + encrypt(token, ENCRYPTION_KEY)


def _decrypt_token(token: str) -> str:
    if not token or not ENCRYPTION_KEY:
        return token
    if not token.startswith("enc:"):
        return token
    return decrypt(token[4:], ENCRYPTION_KEY)


def load_settings_sync() -> dict[str, Any]:
    if SETTINGS_PATH.exists():
        try:
            raw = json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
            merged = _merge_with_defaults(raw)
            if "vk_token" in merged:
                merged["vk_token"] = _decrypt_token(merged["vk_token"])
            return merged
        except (json.JSONDecodeError, OSError) as exc:
            logger.warning("settings.load_failed", error=str(exc))

    env_token = os.getenv("VK_TOKEN", "")
    env_group = os.getenv("VK_GROUP_ID")
    env_owner = os.getenv("VK_OWNER_ID")
    defaults = {**DEFAULT_SETTINGS}
    if env_token:
        defaults["vk_token"] = env_token
    if env_group:
        defaults["vk_group_id"] = int(env_group)
    if env_owner:
        defaults["vk_owner_id"] = int(env_owner)
    return defaults


def save_settings_sync(data: dict[str, Any]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    to_save = {**data}
    if "vk_token" in to_save:
        to_save["vk_token"] = _encrypt_token(to_save["vk_token"])
    tmp_path = SETTINGS_PATH.with_suffix(".tmp")
    tmp_path.write_text(json.dumps(to_save, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(str(tmp_path), str(SETTINGS_PATH))


async def get_settings() -> dict[str, Any]:
    async with _lock:
        return load_settings_sync()


async def update_settings(patch: dict[str, Any]) -> dict[str, Any]:
    async with _lock:
        current = load_settings_sync()
        for key, value in patch.items():
            if value is not None:
                current[key] = value
        save_settings_sync(current)
        return current


async def set_cookies_uploaded_at(dt: Optional[str] = None) -> None:
    async with _lock:
        current = load_settings_sync()
        current["cookies_uploaded_at"] = dt or datetime.now(timezone.utc).isoformat()
        save_settings_sync(current)


def cookies_file_exists() -> bool:
    return COOKIES_PATH.exists() and COOKIES_PATH.stat().st_size > 0
