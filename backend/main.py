from contextlib import asynccontextmanager

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from logging_config import setup_logging
from routers.extract import router as extract_router
from routers.health import router as health_router
from routers.publish import router as publish_router
from routers.scheduled import router as scheduled_router
from routers.settings import router as settings_router
from routers.stats import router as stats_router
from routers.tasks import router as tasks_router
from services.task_store import start_cleanup_loop

setup_logging()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await start_cleanup_loop()
    yield


app = FastAPI(title="VK Post Scheduler", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router, prefix="/api")
app.include_router(settings_router, prefix="/api")
app.include_router(extract_router, prefix="/api")
app.include_router(publish_router, prefix="/api")
app.include_router(scheduled_router, prefix="/api")
app.include_router(stats_router, prefix="/api")
app.include_router(tasks_router, prefix="/api")
