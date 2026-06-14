from __future__ import annotations

import re
from datetime import datetime, timezone
from pathlib import Path

import pytz
from fastapi import APIRouter, File, HTTPException, UploadFile

from config import COOKIES_PATH
from models.schemas import (
    CookiesUploadResponse,
    SettingsResponse,
    SettingsUpdate,
    VerifyVkRequest,
    VerifyVkResponse,
)
from services.settings_store import (
    cookies_file_exists,
    get_settings,
    set_cookies_uploaded_at,
    update_settings,
)
from services.vk_api import VkApiError, call_method_with_token

router = APIRouter(prefix="/settings", tags=["settings"])


def _validate_time_slots(slots: list[str]) -> None:
    if not slots:
        raise HTTPException(400, "time_slots must not be empty")
    pattern = re.compile(r"^\d{2}:\d{2}$")
    for s in slots:
        if not pattern.match(s):
            raise HTTPException(400, f"Invalid time slot format: {s!r}, expected HH:MM")
    if slots != sorted(slots):
        raise HTTPException(400, "time_slots must be sorted in ascending order")


def _validate_timezone(tz: str) -> None:
    try:
        pytz.timezone(tz)
    except pytz.UnknownTimeZoneError:
        raise HTTPException(400, f"Unknown timezone: {tz}")


@router.get("", response_model=SettingsResponse)
async def get_settings_endpoint():
    s = await get_settings()
    token = s.get("vk_token", "")
    return SettingsResponse(
        vk_token_configured=bool(token),
        vk_token_hint=token[:8] + "***" if len(token) > 8 else "",
        vk_group_id=s.get("vk_group_id"),
        vk_owner_id=s.get("vk_owner_id"),
        time_slots=s.get("time_slots", ["10:00", "15:00", "20:00"]),
        timezone=s.get("timezone", "Europe/Moscow"),
        max_download_workers=s.get("max_download_workers", 3),
        vk_publish_delay_seconds=s.get("vk_publish_delay_seconds", 5),
        ytdlp_timeout_seconds=s.get("ytdlp_timeout_seconds", 30),
        max_photo_size_mb=s.get("max_photo_size_mb", 50),
        max_video_size_mb=s.get("max_video_size_mb", 500),
        cookies_uploaded_at=s.get("cookies_uploaded_at"),
    )


@router.put("", response_model=SettingsResponse)
async def update_settings_endpoint(body: SettingsUpdate):
    patch = body.model_dump(exclude_none=True)

    if "vk_token" in patch and not patch["vk_token"]:
        del patch["vk_token"]

    if "time_slots" in patch:
        _validate_time_slots(patch["time_slots"])
    if "timezone" in patch:
        _validate_timezone(patch["timezone"])

    await update_settings(patch)
    return await get_settings_endpoint()


@router.post("/verify-vk", response_model=VerifyVkResponse)
async def verify_vk(body: VerifyVkRequest):
    try:
        user = await call_method_with_token(
            "users.get",
            {"user_ids": str(body.vk_owner_id), "fields": "photo_100"},
            body.vk_token,
        )
        group = await call_method_with_token(
            "groups.getById",
            {"group_id": str(body.vk_group_id), "fields": "photo_100"},
            body.vk_token,
        )

        u = user[0] if isinstance(user, list) else user
        if isinstance(group, dict) and "groups" in group:
            g = group["groups"][0]
        elif isinstance(group, list):
            g = group[0]
        else:
            g = group

        return VerifyVkResponse(
            status="ok",
            account={
                "id": u.get("id"),
                "name": f"{u.get('first_name', '')} {u.get('last_name', '')}".strip(),
                "photo_url": u.get("photo_100", ""),
            },
            group={
                "id": g.get("id"),
                "name": g.get("name", ""),
                "photo_url": g.get("photo_100", ""),
            },
        )
    except VkApiError as exc:
        return VerifyVkResponse(status="error", error=f"{exc.message} ({exc.code})")
    except Exception as exc:
        return VerifyVkResponse(status="error", error=str(exc))


@router.post("/cookies", response_model=CookiesUploadResponse)
async def upload_cookies(file: UploadFile = File(...)):
    content = await file.read()
    if not content:
        raise HTTPException(400, "Empty file")

    COOKIES_PATH.parent.mkdir(parents=True, exist_ok=True)
    COOKIES_PATH.write_bytes(content)

    uploaded_at = datetime.now(timezone.utc).isoformat()
    await set_cookies_uploaded_at(uploaded_at)

    return CookiesUploadResponse(
        status="ok",
        uploaded_at=uploaded_at,
        file_size_bytes=len(content),
    )


@router.delete("/cookies")
async def delete_cookies():
    if COOKIES_PATH.exists():
        COOKIES_PATH.unlink()
    await set_cookies_uploaded_at(None)
    return {"status": "ok"}
