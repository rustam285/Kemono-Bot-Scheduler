import structlog
from fastapi import APIRouter

from services.media_downloader import get_degraded_parsers, is_degraded
from services.supabase_client import check_supabase_health
from services.supabase_watchdog import get_state as get_watchdog_state

router = APIRouter()
logger = structlog.get_logger(__name__)


@router.get("/health")
async def health():
    db_ok = await check_supabase_health()
    degraded = get_degraded_parsers()

    status = "ok" if db_ok else "degraded"
    return {
        "status": status,
        "database": "ok" if db_ok else "unavailable",
        "ytdlp_health": "degraded" if is_degraded() else "ok",
        "degraded_parsers": degraded,
        # monitoring / last_check_at / db_ok / restore (in_progress|ok|failed)
        "supabase_watchdog": get_watchdog_state(),
    }
