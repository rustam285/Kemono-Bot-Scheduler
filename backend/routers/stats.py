from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, HTTPException

from services.supabase_client import get_scheduled_posts
from services.vk_api import VkApiError, call_method

router = APIRouter(tags=["stats"])


@router.get("/stats")
async def get_stats():
    settings_mod = __import__("services.settings_store", fromlist=["get_settings"])
    settings = await settings_mod.get_settings()
    group_id = settings.get("vk_group_id")
    owner_id = settings.get("vk_owner_id")

    if not group_id or not owner_id:
        return {
            "total_scheduled": 0,
            "last_post_datetime": None,
            "last_dense_date": None,
            "account": None,
            "group": None,
        }

    try:
        user_data = await call_method("users.get", {
            "user_ids": str(owner_id),
            "fields": "photo_100",
        })
        u = user_data[0] if isinstance(user_data, list) else user_data
        account = {
            "id": u.get("id"),
            "name": f"{u.get('first_name', '')} {u.get('last_name', '')}".strip(),
            "photo_url": u.get("photo_100", ""),
        }
    except Exception:
        account = {"id": owner_id, "name": "Unknown", "photo_url": ""}

    try:
        group_resp = await call_method("groups.getById", {
            "group_id": str(group_id),
            "fields": "photo_100",
        })
        if isinstance(group_resp, dict) and "groups" in group_resp:
            g = group_resp["groups"][0]
        elif isinstance(group_resp, list):
            g = group_resp[0]
        else:
            g = group_resp
        group = {
            "id": g.get("id"),
            "name": g.get("name", ""),
            "photo_url": g.get("photo_100", ""),
        }
    except Exception:
        group = {"id": group_id, "name": "Unknown", "photo_url": ""}

    posts = await get_scheduled_posts()
    scheduled = [p for p in posts if p.get("status") == "scheduled"]

    total_scheduled = len(scheduled)
    last_post_datetime = None
    last_dense_date = None

    if scheduled:
        dates = []
        for p in scheduled:
            sa = p.get("scheduled_at")
            if sa:
                try:
                    dates.append(datetime.fromisoformat(sa.replace("Z", "+00:00")))
                except Exception:
                    pass

        if dates:
            last_post_datetime = max(dates).isoformat()

            date_counts: dict[str, int] = {}
            for d in dates:
                day = d.strftime("%Y-%m-%d")
                date_counts[day] = date_counts.get(day, 0) + 1

            dense_dates = [day for day, count in date_counts.items() if count >= 3]
            if dense_dates:
                last_dense_date = max(dense_dates)

    return {
        "total_scheduled": total_scheduled,
        "last_post_datetime": last_post_datetime,
        "last_dense_date": last_dense_date,
        "account": account,
        "group": group,
    }
