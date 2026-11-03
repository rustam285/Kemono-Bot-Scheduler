from __future__ import annotations

import asyncio
import json
import os
import re
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

import structlog

from config import VK_MAX_SLOT_ATTEMPTS, VK_SLOT_DELAY_SECONDS
from services.media_downloader import cleanup_old_temp_dirs, download_media_file
from services.scheduler import invalidate_cache
from services.settings_store import get_settings
from services.supabase_client import insert_scheduled_post, record_used_url
from services.sync_cache import invalidate_sync_cache
from services.task_store import Task, TaskStage
from services.url_shortener import get_short_link
from services.vk_api import VkApiError, call_method

logger = structlog.get_logger(__name__)


async def publish_processor(task: Task) -> None:
    settings = await get_settings()
    group_id = settings.get("vk_group_id")
    owner_id = settings.get("vk_owner_id")
    delay = settings.get("vk_publish_delay_seconds", 5)
    max_photo_mb = settings.get("max_photo_size_mb", 50)
    max_video_mb = settings.get("max_video_size_mb", 500)
    tg_channel = settings.get("tg_channel_id")

    posts = task.posts_data
    # original_total — число постов (не растёт от ретраев); total — длина очереди
    original_total = len(posts)
    total = len(posts)
    finished = 0
    max_retries = 2

    async with task._lock:
        task.progress.total = original_total
        task.progress.stage = TaskStage.DOWNLOADING_MEDIA

    processed = 0
    while processed < total:
        post_data = posts[processed] if processed < len(posts) else None
        if not post_data:
            break

        if task._cancel_event.is_set():
            return

        post_id = post_data.get("id", "")
        source_urls = post_data.get("source_urls", [])
        media_items = post_data.get("media_items", [])
        post_text = post_data.get("post_text", "")
        scheduled_at = post_data.get("scheduled_at")
        post_type = post_data.get("post_type", "art")
        platform = post_data.get("platform", "vk")
        retry_count = post_data.get("_retry", 0)

        do_vk = platform in ("vk", "both")
        do_tg = platform in ("tg", "both")

        if do_vk and (not group_id or not owner_id):
            logger.error("publish.vk_not_configured", post_id=post_id)
            do_vk = False
        if do_tg and not tg_channel:
            logger.error("publish.tg_not_configured", post_id=post_id)
            do_tg = False

        # Ранние ошибки: публиковать нечего — сразу отмечаем пост ошибкой,
        # не имитируя успешную публикацию
        early_error = None
        if not do_vk and not do_tg:
            early_error = "Нет настроенных платформ: задайте VK group/owner ID или TG-канал в настройках"
        elif not scheduled_at:
            early_error = "Пост без даты публикации: не хватило свободных слотов"

        if early_error:
            async with task._lock:
                result_entry = next((r for r in task.results if r.post_id == post_id), None)
                if result_entry:
                    result_entry.status = "error"
                    result_entry.error = early_error
            await insert_scheduled_post({
                "post_type": post_type,
                "scheduled_at": scheduled_at,
                "source_urls": source_urls,
                "post_text": post_text,
                "has_media": False,
                "status": "error",
                "error_message": early_error,
                "platform": platform,
            })
            finished += 1
            async with task._lock:
                task.progress.current = finished
            processed += 1
            if processed < total:
                await asyncio.sleep(delay)
            continue

        is_local_only = all(mi.get("source_tool") == "local" for mi in media_items) if media_items else False

        async with task._lock:
            task.progress.current = finished
            task.progress.stage = TaskStage.DOWNLOADING_MEDIA

        vk_text = post_text
        if do_vk and source_urls and not is_local_only:
            short_url = await get_short_link(source_urls[0])
            if short_url:
                vk_text = post_text.replace(source_urls[0], short_url, 1)

        if is_local_only:
            vk_text = re.sub(r"Source:\s*local:[^\n]*", "", vk_text).strip()
            vk_text = re.sub(r"\n{3,}", "\n\n", vk_text)

        downloaded_files: list[Path] = []
        download_failed = False
        # Кэш медиа переживает ретраи поста: успешно скачанные файлы и загруженные
        # в VK вложения переиспользуются, повторно обрабатываются только упавшие
        media_cache: dict[str, dict[str, Any]] = post_data.setdefault("_media_cache", {})

        for mi in media_items:
            if task._cancel_event.is_set():
                return

            mi_id = str(mi.get("id", ""))
            mi_url = mi.get("original_url", "")
            mi_type = mi.get("type", "photo")
            mi_tool = mi.get("source_tool", "unknown")

            cached = media_cache.get(mi_id) or {}
            filepath = Path(cached["path"]) if cached.get("path") else None
            if filepath is not None and not filepath.exists():
                media_cache.pop(mi_id, None)
                cached, filepath = {}, None
            attachment = cached.get("attachment")

            if filepath is None:
                logger.info("publish.downloading_media", url=mi_url[:100], type=mi_type, tool=mi_tool)
                max_size = max_video_mb if mi_type == "video" else max_photo_mb
                filepath = await download_media_file_from_dict(mi, task.task_id, max_size)
                if filepath is None:
                    logger.warning("publish.download_failed", url=mi_url[:100])
                    download_failed = True
                    continue
                logger.info("publish.media_downloaded", path=str(filepath), size=filepath.stat().st_size)

            if do_vk and attachment is None:
                try:
                    attachment = await upload_to_vk(filepath, mi_type, group_id)
                except Exception as exc:
                    logger.error("publish.upload_failed_vk", post_id=post_id, error=str(exc))
                    attachment = None
                media_cache[mi_id] = {"path": str(filepath), "attachment": attachment}
                if attachment is None:
                    logger.warning("publish.upload_vk_failed", url=mi_url[:100])
                    download_failed = True
                    continue
                logger.info("publish.media_uploaded_vk", attachment=attachment)

            media_cache[mi_id] = {"path": str(filepath), "attachment": attachment}
            if filepath not in downloaded_files:
                downloaded_files.append(filepath)

        if download_failed and retry_count < max_retries:
            # Файлы и вложения не удаляем — ретрай доиспользует их из media_cache.
            # progress.total не трогаем: ретрай — это тот же пост, а не новый
            post_data["_retry"] = retry_count + 1
            posts.append(post_data)
            total += 1
            async with task._lock:
                task.progress.retries += 1
            logger.info("publish.queued_for_retry", post_id=post_id, retry=retry_count + 1,
                        cached_media=len(media_cache))
            processed += 1
            continue

        async with task._lock:
            task.progress.current = finished + 1
            task.progress.stage = TaskStage.CREATING_POSTS

        if task._cancel_event.is_set():
            for f in downloaded_files:
                try:
                    f.unlink(missing_ok=True)
                except Exception:
                    pass
            return

        vk_post_id = None
        tg_message_ids = None
        publish_error = None

        # Вложения собираем в исходном порядке media_items, а не в порядке загрузки
        vk_attachments = [
            media_cache[str(mi.get("id", ""))]["attachment"]
            for mi in media_items
            if media_cache.get(str(mi.get("id", "")), {}).get("attachment")
        ]
        # Пост может выйти с неполным набором медиа (источник упирался) —
        # помечаем это и в задаче, и в БД, вместо молчаливой публикации без фото
        media_note = None
        if do_vk and media_items and len(vk_attachments) < len(media_items):
            media_note = f"медиа {len(vk_attachments)}/{len(media_items)}"
            logger.warning("publish.partial_media", post_id=post_id,
                           uploaded=len(vk_attachments), total=len(media_items))

        if do_vk:
            try:
                publish_date = None
                if scheduled_at:
                    dt = datetime.fromisoformat(scheduled_at)
                    if dt.tzinfo is None:
                        dt = dt.replace(tzinfo=timezone.utc)
                    now_ts = int(datetime.now(timezone.utc).timestamp())
                    if int(dt.timestamp()) <= now_ts:
                        dt = datetime.now(timezone.utc).replace(second=0, microsecond=0)
                        dt += timedelta(minutes=1)
                        scheduled_at = dt.isoformat()
                        logger.warning("publish.date_in_future_adjusted", post_id=post_id, new_time=scheduled_at)
                    publish_date = int(dt.timestamp())

                wall_params: dict[str, Any] = {
                    "owner_id": f"-{group_id}",
                    "from_group": 1,
                    "message": vk_text,
                }
                if vk_attachments:
                    wall_params["attachments"] = ",".join(vk_attachments)

                for slot_attempt in range(VK_MAX_SLOT_ATTEMPTS):
                    if publish_date:
                        wall_params["publish_date"] = publish_date

                    try:
                        result = await call_method("wall.post", wall_params)
                        vk_post_id = result.get("post_id") if isinstance(result, dict) else None
                        break
                    except VkApiError as slot_exc:
                        if slot_exc.code == 214 and publish_date:
                            publish_date += VK_SLOT_DELAY_SECONDS
                            new_dt = datetime.fromtimestamp(publish_date, tz=timezone.utc)
                            logger.info("publish.slot_occupied", new_time=new_dt.isoformat(), attempt=slot_attempt + 1)
                            scheduled_at = new_dt.isoformat()
                            continue
                        raise
                else:
                    publish_error = (
                        f"Не удалось занять слот за {VK_MAX_SLOT_ATTEMPTS} попыток "
                        f"(все соседние слоты заняты)"
                    )
                    logger.error("publish.slot_exhausted", post_id=post_id)

                if vk_post_id is not None:
                    logger.info("publish.vk_post_created", post_id=post_id, vk_post_id=vk_post_id)

            except VkApiError as exc:
                publish_error = f"VK API error: {exc.message}"
                logger.error("publish.vk_api_error", post_id=post_id, error=str(exc))
            except Exception as exc:
                publish_error = str(exc)
                logger.error("publish.vk_unexpected_error", post_id=post_id, error=str(exc))

        if do_tg:
            try:
                from services import telegram_api

                tg_text = post_text
                if is_local_only:
                    tg_text = re.sub(r"Source:\s*local:[^\n]*", "", tg_text).strip()
                    tg_text = re.sub(r"\n{3,}", "\n\n", tg_text)

                schedule_dt = None
                if scheduled_at:
                    schedule_dt = datetime.fromisoformat(scheduled_at)
                    if schedule_dt.tzinfo is None:
                        schedule_dt = schedule_dt.replace(tzinfo=timezone.utc)

                tg_ids = await telegram_api.send_scheduled(
                    channel=tg_channel,
                    text=tg_text,
                    media_files=downloaded_files,
                    schedule_dt=schedule_dt,
                )
                tg_message_ids = tg_ids
                logger.info("publish.tg_post_created", post_id=post_id, tg_ids=tg_ids)

            except Exception as exc:
                publish_error = f"TG error: {exc}" if not publish_error else publish_error + f"; TG error: {exc}"
                logger.error("publish.tg_error", post_id=post_id, error=str(exc))

        for f in downloaded_files:
            try:
                f.unlink(missing_ok=True)
            except Exception:
                pass

        if publish_error:
            async with task._lock:
                result_entry = next((r for r in task.results if r.post_id == post_id), None)
                if result_entry:
                    result_entry.status = "error"
                    result_entry.error = publish_error

            error_post = {
                "vk_post_id": vk_post_id,
                "post_type": post_type,
                "scheduled_at": scheduled_at,
                "source_urls": source_urls,
                "post_text": post_text,
                "has_media": len(downloaded_files) > 0,
                "status": "error",
                "error_message": publish_error,
                "platform": platform,
            }
            if tg_message_ids:
                error_post["tg_message_ids"] = json.dumps(tg_message_ids)
                error_post["tg_channel"] = str(tg_channel)
                _title = settings.get("tg_channel_title")
                if _title:
                    error_post["tg_channel_title"] = _title
            await insert_scheduled_post(error_post)
        else:
            async with task._lock:
                result_entry = next((r for r in task.results if r.post_id == post_id), None)
                if result_entry:
                    result_entry.vk_post_id = vk_post_id
                    result_entry.status = "ok"
                    result_entry.error = media_note

            vk_attachments_data = [
                {"type": mi.get("type"), "attachment": media_cache[str(mi.get("id", ""))]["attachment"]}
                for mi in media_items
                if media_cache.get(str(mi.get("id", "")), {}).get("attachment")
            ]

            if platform == "both" and vk_post_id and tg_message_ids:
                vk_db = {
                    "vk_post_id": vk_post_id,
                    "post_type": post_type,
                    "scheduled_at": scheduled_at,
                    "source_urls": source_urls,
                    "media_attachments": vk_attachments_data,
                    "post_text": post_text,
                    "has_media": len(downloaded_files) > 0,
                    "status": "scheduled",
                    "platform": "vk",
                }
                if media_note:
                    vk_db["error_message"] = media_note
                await insert_scheduled_post(vk_db)

                tg_db = {
                    "post_type": post_type,
                    "scheduled_at": scheduled_at,
                    "source_urls": source_urls,
                    "post_text": post_text,
                    "has_media": len(downloaded_files) > 0,
                    "status": "scheduled",
                    "platform": "tg",
                    "tg_message_ids": json.dumps(tg_message_ids),
                    "tg_channel": str(tg_channel),
                }
                _title = settings.get("tg_channel_title")
                if _title:
                    tg_db["tg_channel_title"] = _title
                await insert_scheduled_post(tg_db)
            else:
                db_post = {
                    "vk_post_id": vk_post_id,
                    "post_type": post_type,
                    "scheduled_at": scheduled_at,
                    "source_urls": source_urls,
                    "media_attachments": vk_attachments_data,
                    "post_text": post_text,
                    "has_media": len(downloaded_files) > 0,
                    "status": "scheduled",
                    "platform": platform,
                }
                if tg_message_ids:
                    db_post["tg_message_ids"] = json.dumps(tg_message_ids)
                    db_post["tg_channel"] = str(tg_channel)
                    _title = settings.get("tg_channel_title")
                    if _title:
                        db_post["tg_channel_title"] = _title
                if media_note:
                    db_post["error_message"] = media_note
                await insert_scheduled_post(db_post)

            for url in source_urls:
                await record_used_url(url, vk_post_id)

            logger.info("publish.post_created",
                        post_id=post_id, vk_post_id=vk_post_id, tg_ids=tg_message_ids, post_type=post_type)

        # Пост завершился окончательно (успех или ошибка) — считаем его один раз
        finished += 1
        async with task._lock:
            task.progress.current = min(finished, original_total)

        processed += 1
        if processed < total:
            await asyncio.sleep(delay)

    invalidate_cache()
    invalidate_sync_cache()
    await cleanup_old_temp_dirs()


async def download_media_file_from_dict(
    mi: dict[str, Any],
    task_id: str,
    max_size_mb: int,
) -> Optional[Path]:
    from services.media_downloader import MediaItem

    media_item = MediaItem(
        id=mi.get("id", ""),
        type=mi.get("type", "photo"),
        thumbnail_url=mi.get("thumbnail_url"),
        original_url=mi.get("original_url"),
        source_url=mi.get("source_url"),
        selected=mi.get("selected", True),
        source_tool=mi.get("source_tool", "yt-dlp"),
    )

    return await download_media_file(media_item, task_id, max_size_mb)


async def upload_to_vk(filepath: Path, media_type: str, group_id: int) -> Optional[str]:
    if media_type == "video":
        return await _upload_video(filepath, group_id)
    return await _upload_photo(filepath, group_id)


async def _upload_photo(filepath: Path, group_id: int) -> Optional[str]:
    import httpx

    for attempt in range(3):
        try:
            upload_server = await call_method("photos.getWallUploadServer", {"group_id": group_id})
            upload_url = upload_server.get("upload_url") if isinstance(upload_server, dict) else None
            if not upload_url:
                logger.error("upload_photo.no_upload_url")
                return None

            async with httpx.AsyncClient(timeout=120) as client:
                with open(filepath, "rb") as f:
                    resp = await client.post(
                        upload_url,
                        files={"photo": (filepath.name, f, "image/jpeg")},
                    )

            if resp.status_code >= 500:
                delay = [2, 8, 16][min(attempt, 2)]
                logger.warning("upload_photo.server_error", status=resp.status_code, attempt=attempt + 1, delay=delay)
                await asyncio.sleep(delay)
                continue

            upload_data = resp.json()
            server = upload_data.get("server")
            photo = upload_data.get("photo")
            hash_val = upload_data.get("hash")

            if not all([server, photo, hash_val]):
                logger.error("upload_photo.invalid_response", data=upload_data)
                return None

            saved = await call_method("photos.saveWallPhoto", {
                "group_id": group_id,
                "server": server,
                "photo": photo,
                "hash": hash_val,
            })

            if isinstance(saved, list) and saved:
                saved = saved[0]
            owner_id = saved.get("owner_id", f"-{group_id}")
            photo_id = saved.get("id")
            return f"photo{owner_id}_{photo_id}"

        except Exception as exc:
            delay = [2, 8, 16][min(attempt, 2)]
            logger.warning("upload_photo.error", error=str(exc), attempt=attempt + 1, delay=delay)
            await asyncio.sleep(delay)

    logger.error("upload_photo.all_retries_failed", path=str(filepath))
    return None


async def _upload_video(filepath: Path, group_id: int) -> Optional[str]:
    try:
        video_save = await call_method("video.save", {
            "group_id": group_id,
            "name": filepath.stem,
            "wallpost": 0,
        })

        upload_url = video_save.get("upload_url") if isinstance(video_save, dict) else None
        video_id = video_save.get("video_id") if isinstance(video_save, dict) else None
        owner_id = video_save.get("owner_id", f"-{group_id}")

        if not upload_url:
            logger.error("upload_video.no_upload_url")
            return None

        import httpx
        async with httpx.AsyncClient(timeout=300) as client:
            with open(filepath, "rb") as f:
                await client.post(
                    upload_url,
                    files={"video": (filepath.name, f, "video/mp4")},
                )

        return f"video{owner_id}_{video_id}"

    except Exception as exc:
        logger.error("upload_video.failed", error=str(exc))
        return None
