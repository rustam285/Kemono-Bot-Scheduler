from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
async def health():
    return {"status": "ok", "ytdlp_health": "ok", "degraded_parsers": []}
