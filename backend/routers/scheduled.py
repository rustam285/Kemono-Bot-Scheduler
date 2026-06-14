from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from services.supabase_client import (
    get_posts_without_media,
    get_scheduled_post_by_vk_id,
    get_scheduled_posts,
    update_scheduled_post,
)
from services.vk_api import VkApiError, call_method

router = APIRouter(prefix="/scheduled", tags=["scheduled"])


async def _sync_with_vk() -> list[dict[str, Any]]:
    settings_mod = __import__("services.settings_store", fromlist=["get_settings"])
    settings = await settings_mod.get_settings()
    group_id = settings.get("vk_group_id")
    if not group_id:
        raise HTTPException(400, "VK Group ID is not configured")

    vk_posts: list[dict[str, Any]] = []
    offset = 0
    count = 100

    while True:
        try:
            result = await call_method("wall.get", {
                "owner_id": f"-{group_id}",
                "filter": "postponed",
                "offset": offset,
                "count": count,
            })
        except VkApiError as exc:
            raise HTTPException(502, f"VK API error: {exc.message}")

        items = result.get("items", []) if isinstance(result, dict) else []
        vk_posts.extend(items)
        if len(items) < count:
            break
        offset += count

    db_posts = await get_scheduled_posts()
    db_by_vk_id = {p["vk_post_id"]: p for p in db_posts if p.get("vk_post_id")}

    vk_ids = set()
    for vk_post in vk_posts:
        vk_id = vk_post.get("id")
        if not vk_id:
            continue
        vk_ids.add(vk_id)

        attachments = vk_post.get("attachments", [])
        has_media = any(a.get("type") in ("photo", "video") for a in attachments)

        if vk_id not in db_by_vk_id:
            from services.supabase_client import insert_scheduled_post
            source_urls = []
            text = vk_post.get("text", "")
            for line in text.split("\n"):
                if line.strip().startswith("Source:"):
                    source_urls.append(line.strip().replace("Source:", "").strip())

            media_attachments = []
            for att in attachments:
                if att.get("type") == "photo":
                    p = att.get("photo", {})
                    media_attachments.append({
                        "type": "photo",
                        "owner_id": p.get("owner_id"),
                        "media_id": p.get("id"),
                    })
                elif att.get("type") == "video":
                    v = att.get("video", {})
                    media_attachments.append({
                        "type": "video",
                        "owner_id": v.get("owner_id"),
                        "media_id": v.get("id"),
                    })

            post_type = "art"
            for line in text.split("\n"):
                if "#fursuit" in line:
                    post_type = "fursuit"
                elif "#video" in line:
                    post_type = "video"

            await insert_scheduled_post({
                "vk_post_id": vk_id,
                "post_type": post_type,
                "scheduled_at": datetime.fromtimestamp(vk_post["publish_date"]).isoformat() if vk_post.get("publish_date") else None,
                "source_urls": source_urls,
                "media_attachments": media_attachments,
                "post_text": text,
                "has_media": has_media,
                "status": "scheduled",
            })

    for db_post in db_posts:
        if db_post.get("status") == "scheduled" and db_post.get("vk_post_id") and db_post["vk_post_id"] not in vk_ids:
            await update_scheduled_post(db_post["vk_post_id"], {"status": "deleted"})

    all_posts = await get_scheduled_posts()
    return [p for p in all_posts if p.get("status") != "deleted"]


@router.get("")
async def get_scheduled():
    return await _sync_with_vk()


@router.get("/calendar")
async def get_calendar(year: int = Query(...), month: int = Query(..., ge=1, le=12)):
    posts = await _sync_with_vk()

    calendar: dict[str, dict[str, int]] = {}
    for post in posts:
        sa = post.get("scheduled_at")
        if not sa:
            continue
        try:
            dt = datetime.fromisoformat(sa.replace("Z", "+00:00"))
        except Exception:
            continue
        if dt.year == year and dt.month == month:
            day_key = dt.strftime("%Y-%m-%d")
            if day_key not in calendar:
                calendar[day_key] = {"art": 0, "fursuit": 0, "video": 0, "total": 0}
            pt = post.get("post_type", "art")
            if pt in calendar[day_key]:
                calendar[day_key][pt] += 1
            calendar[day_key]["total"] += 1

    return {"year": year, "month": month, "days": calendar}


@router.get("/no-media")
async def get_no_media():
    return await get_posts_without_media()


@router.get("/{vk_post_id}")
async def get_post_detail(vk_post_id: int):
    post = await get_scheduled_post_by_vk_id(vk_post_id)
    if not post:
        raise HTTPException(404, "Post not found")
    return post


class PostUpdate(BaseModel):
    scheduled_at: Optional[str] = None
    post_text: Optional[str] = None
    media_items: Optional[list[dict]] = None


@router.put("/{vk_post_id}")
async def update_post(vk_post_id: int, body: PostUpdate):
    post = await get_scheduled_post_by_vk_id(vk_post_id)
    if not post:
        raise HTTPException(404, "Post not found")

    settings_mod = __import__("services.settings_store", fromlist=["get_settings"])
    settings = await settings_mod.get_settings()
    group_id = settings.get("vk_group_id")

    has_media_change = body.media_items is not None and body.media_items != post.get("media_attachments")

    if has_media_change:
        try:
            publish_date = None
            sa = body.scheduled_at or post.get("scheduled_at")
            if sa:
                dt = datetime.fromisoformat(sa.replace("Z", "+00:00"))
                publish_date = int(dt.timestamp())

            params: dict[str, Any] = {
                "owner_id": f"-{group_id}",
                "from_group": 1,
                "message": body.post_text or post.get("post_text", ""),
                "publish_date": publish_date,
            }

            attachments = []
            for mi in (body.media_items or []):
                att_type = mi.get("type", "photo")
                owner = mi.get("owner_id", f"-{group_id}")
                mid = mi.get("media_id")
                if mid:
                    attachments.append(f"{att_type}{owner}_{mid}")
            if attachments:
                params["attachments"] = ",".join(attachments)

            result = await call_method("wall.post", params)
            new_vk_id = result.get("post_id") if isinstance(result, dict) else None

            if new_vk_id:
                await call_method("wall.delete", {"owner_id": f"-{group_id}", "post_id": vk_post_id})

            updates = {
                "vk_post_id": new_vk_id,
                "post_text": body.post_text or post.get("post_text"),
                "scheduled_at": body.scheduled_at or post.get("scheduled_at"),
                "media_attachments": body.media_items,
                "has_media": len(body.media_items) > 0 if body.media_items else post.get("has_media"),
            }
            await update_scheduled_post(vk_post_id, {"status": "deleted"})
            from services.supabase_client import insert_scheduled_post
            await insert_scheduled_post({k: v for k, v in updates.items() if v is not None})
            return {"status": "ok", "new_vk_post_id": new_vk_id}

        except VkApiError as exc:
            raise HTTPException(502, f"VK API error: {exc.message}")
    else:
        try:
            edit_params: dict[str, Any] = {"owner_id": f"-{group_id}", "post_id": vk_post_id}
            if body.post_text is not None:
                edit_params["message"] = body.post_text
            if body.scheduled_at is not None:
                dt = datetime.fromisoformat(body.scheduled_at.replace("Z", "+00:00"))
                edit_params["publish_date"] = int(dt.timestamp())

            await call_method("wall.edit", edit_params)

            db_updates: dict[str, Any] = {}
            if body.post_text is not None:
                db_updates["post_text"] = body.post_text
            if body.scheduled_at is not None:
                db_updates["scheduled_at"] = body.scheduled_at
            if db_updates:
                await update_scheduled_post(vk_post_id, db_updates)

            return {"status": "ok"}

        except VkApiError as exc:
            raise HTTPException(502, f"VK API error: {exc.message}")


@router.delete("/{vk_post_id}")
async def delete_post(vk_post_id: int):
    post = await get_scheduled_post_by_vk_id(vk_post_id)
    if not post:
        raise HTTPException(404, "Post not found")

    settings_mod = __import__("services.settings_store", fromlist=["get_settings"])
    settings = await settings_mod.get_settings()
    group_id = settings.get("vk_group_id")

    try:
        await call_method("wall.delete", {"owner_id": f"-{group_id}", "post_id": vk_post_id})
    except VkApiError as exc:
        raise HTTPException(502, f"VK API error: {exc.message}")

    await update_scheduled_post(vk_post_id, {"status": "deleted"})
    return {"status": "ok"}
