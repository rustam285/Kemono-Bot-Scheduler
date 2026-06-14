from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class SettingsResponse(BaseModel):
    vk_token_configured: bool
    vk_token_hint: str
    vk_group_id: Optional[int] = None
    vk_owner_id: Optional[int] = None
    time_slots: list[str] = ["10:00", "15:00", "20:00"]
    timezone: str = "Europe/Moscow"
    max_download_workers: int = 3
    vk_publish_delay_seconds: int = 5
    ytdlp_timeout_seconds: int = 30
    max_photo_size_mb: int = 50
    max_video_size_mb: int = 500
    cookies_uploaded_at: Optional[str] = None


class SettingsUpdate(BaseModel):
    vk_token: Optional[str] = None
    vk_group_id: Optional[int] = None
    vk_owner_id: Optional[int] = None
    time_slots: Optional[list[str]] = None
    timezone: Optional[str] = None
    max_download_workers: Optional[int] = Field(None, ge=1, le=10)
    vk_publish_delay_seconds: Optional[int] = Field(None, ge=1, le=60)
    ytdlp_timeout_seconds: Optional[int] = Field(None, ge=5, le=300)
    max_photo_size_mb: Optional[int] = Field(None, ge=1, le=50)
    max_video_size_mb: Optional[int] = Field(None, ge=1, le=2048)


class VerifyVkRequest(BaseModel):
    vk_token: str
    vk_group_id: int
    vk_owner_id: int


class VerifyVkResponse(BaseModel):
    status: str
    account: Optional[dict] = None
    group: Optional[dict] = None
    error: Optional[str] = None


class CookiesUploadResponse(BaseModel):
    status: str
    uploaded_at: str
    file_size_bytes: int


class HealthResponse(BaseModel):
    status: str
    ytdlp_health: str
    degraded_parsers: list[dict] = []
