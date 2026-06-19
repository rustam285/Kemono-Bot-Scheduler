from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from services.publisher import publish_processor
from services.scheduler import generate_preview
from services.task_store import create_task, run_task

router = APIRouter(tags=["publish"])


class PostGroup(BaseModel):
    source_urls: list[str] = []
    media_item_ids: list[str] = []


class PreviewRequest(BaseModel):
    post_groups: list[PostGroup]
    post_type: str = Field(..., pattern="^(art|fursuit|video)$")
    start_date: str
    time_slots: list[str]
    timezone: str
    session_key: Optional[str] = None
    platform: str = Field("vk", pattern="^(vk|tg|both)$")


class PreviewPostResponse(BaseModel):
    id: str
    post_type: str
    scheduled_at: Optional[str] = None
    media_item_ids: list[str] = []
    post_text: str = ""
    source_urls: list[str] = []
    platform: str = "vk"


class PreviewResponse(BaseModel):
    session_key: str
    posts: list[PreviewPostResponse]


@router.post("/preview", response_model=PreviewResponse)
async def preview_endpoint(body: PreviewRequest):
    if not body.post_groups:
        raise HTTPException(400, "post_groups must not be empty")

    groups_data = [pg.model_dump() for pg in body.post_groups]

    try:
        session_key, posts = await generate_preview(
            post_groups=groups_data,
            post_type=body.post_type,
            start_date=body.start_date,
            time_slots=body.time_slots,
            timezone_name=body.timezone,
            session_key=body.session_key,
            platform=body.platform,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc))

    post_responses = [
        PreviewPostResponse(
            id=p["id"],
            post_type=p["post_type"],
            scheduled_at=p["scheduled_at"],
            media_item_ids=p["media_item_ids"],
            post_text=p["post_text"],
            source_urls=p["source_urls"],
            platform=p.get("platform", "vk"),
        )
        for p in posts
    ]

    return PreviewResponse(session_key=session_key, posts=post_responses)


class PublishPostItem(BaseModel):
    id: str
    post_type: str = "art"
    scheduled_at: Optional[str] = None
    media_items: list[dict] = []
    post_text: str = ""
    source_urls: list[str] = []
    platform: str = Field("vk", pattern="^(vk|tg|both)$")


class PublishRequest(BaseModel):
    posts: list[PublishPostItem]


@router.post("/publish")
async def publish_endpoint(body: PublishRequest):
    if not body.posts:
        raise HTTPException(400, "posts must not be empty")

    now = datetime.now(timezone.utc)
    one_year = now + timedelta(days=365)
    violations = []

    for p in body.posts:
        if p.scheduled_at:
            dt = datetime.fromisoformat(p.scheduled_at)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            if dt <= now:
                violations.append(f"Post {p.id}: scheduled_at must be in the future")
            if dt > one_year:
                violations.append(f"Post {p.id}: scheduled_at cannot exceed 1 year from now")

    if violations:
        raise HTTPException(400, detail=violations)

    posts_data = [p.model_dump() for p in body.posts]
    task = create_task(posts_data)

    import asyncio
    asyncio.create_task(run_task(task, publish_processor))

    return {"task_id": task.task_id}
