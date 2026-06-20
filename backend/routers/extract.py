from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

from services.media_downloader import ExtractResult, extract_media
from services.supabase_client import check_urls_used

router = APIRouter(tags=["extract"])


class ExtractRequest(BaseModel):
    urls: list[str]
    local_files: list[str] = []


class MediaItemResponse(BaseModel):
    id: str
    type: str
    thumbnail_url: Optional[str] = None
    original_url: Optional[str] = None
    source_url: Optional[str] = None
    selected: bool = True


class ExtractItemResponse(BaseModel):
    id: str
    source_url: str
    already_used: bool = False
    media_items: list[MediaItemResponse] = []
    error: Optional[str] = None


class ExtractResponse(BaseModel):
    items: list[ExtractItemResponse]


@router.post("/extract", response_model=ExtractResponse)
async def extract_endpoint(body: ExtractRequest):
    if not body.urls:
        return ExtractResponse(items=[])

    import structlog
    logger = structlog.get_logger(__name__)

    used_map = await check_urls_used(body.urls)

    results: list[ExtractItemResponse] = []
    for url in body.urls:
        logger.info("extract_endpoint.processing", url=url)
        extract_result: ExtractResult = await extract_media(url)
        logger.info("extract_endpoint.result", url=url, items=len(extract_result.media_items), error=extract_result.error)

        media_responses = [
            MediaItemResponse(
                id=m.id,
                type=m.type,
                thumbnail_url=m.thumbnail_url,
                original_url=m.original_url,
                source_url=m.source_url,
                selected=m.selected,
            )
            for m in extract_result.media_items
        ]

        results.append(ExtractItemResponse(
            id=str(uuid.uuid4()),
            source_url=url,
            already_used=used_map.get(url, False),
            media_items=media_responses,
            error=extract_result.error,
        ))

    return ExtractResponse(items=results)
