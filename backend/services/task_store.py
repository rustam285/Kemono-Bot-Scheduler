from __future__ import annotations

import asyncio
import json
import os
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any, Optional

import structlog

from config import DATA_DIR, MAX_CONCURRENT_TASKS, TASK_CLEANUP_INTERVAL, TASK_MAX_AGE_SECONDS

logger = structlog.get_logger(__name__)

TASKS_PATH = DATA_DIR / "tasks.json"


class TaskStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    ERROR = "error"
    CANCELLED = "cancelled"
    INTERRUPTED = "interrupted"


class TaskStage(str, Enum):
    DOWNLOADING_MEDIA = "downloading_media"
    UPLOADING_MEDIA = "uploading_media"
    CREATING_POSTS = "creating_posts"
    DONE = "done"


@dataclass
class PostResult:
    post_id: str
    vk_post_id: Optional[int] = None
    status: str = "pending"
    error: Optional[str] = None


@dataclass
class TaskProgress:
    current: int = 0
    total: int = 0
    stage: str = TaskStage.DOWNLOADING_MEDIA


@dataclass
class Task:
    task_id: str
    status: TaskStatus = TaskStatus.PENDING
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    progress: TaskProgress = field(default_factory=TaskProgress)
    results: list[PostResult] = field(default_factory=list)
    posts_data: list[dict[str, Any]] = field(default_factory=list)
    _cancel_event: asyncio.Event = field(default_factory=asyncio.Event)
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    def to_dict(self) -> dict[str, Any]:
        return {
            "task_id": self.task_id,
            "status": self.status.value,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "progress": {
                "current": self.progress.current,
                "total": self.progress.total,
                "stage": self.progress.stage,
            },
            "results": [
                {
                    "post_id": r.post_id,
                    "vk_post_id": r.vk_post_id,
                    "status": r.status,
                    "error": r.error,
                }
                for r in self.results
            ],
        }

    def to_persist(self) -> dict[str, Any]:
        return {
            "task_id": self.task_id,
            "status": self.status.value,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "progress": {
                "current": self.progress.current,
                "total": self.progress.total,
                "stage": self.progress.stage,
            },
            "results": [
                {
                    "post_id": r.post_id,
                    "vk_post_id": r.vk_post_id,
                    "status": r.status,
                    "error": r.error,
                }
                for r in self.results
            ],
        }


_tasks: dict[str, Task] = {}
_semaphore: Optional[asyncio.Semaphore] = None
_cleanup_task: Optional[asyncio.Task] = None


def _get_semaphore() -> asyncio.Semaphore:
    global _semaphore
    if _semaphore is None:
        _semaphore = asyncio.Semaphore(MAX_CONCURRENT_TASKS)
    return _semaphore


def _persist_tasks() -> None:
    try:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        data = [t.to_persist() for t in _tasks.values()]
        tmp_path = TASKS_PATH.with_suffix(".tmp")
        tmp_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(str(tmp_path), str(TASKS_PATH))
    except Exception as exc:
        logger.warning("task_store.persist_failed", error=str(exc))


def _load_tasks() -> None:
    if not TASKS_PATH.exists():
        return
    try:
        data = json.loads(TASKS_PATH.read_text(encoding="utf-8"))
        for item in data:
            task = Task(
                task_id=item["task_id"],
                status=TaskStatus(item["status"]),
                started_at=item.get("started_at"),
                finished_at=item.get("finished_at"),
            )
            if "progress" in item:
                task.progress.current = item["progress"].get("current", 0)
                task.progress.total = item["progress"].get("total", 0)
                task.progress.stage = item["progress"].get("stage", TaskStage.DOWNLOADING_MEDIA)
            for r in item.get("results", []):
                task.results.append(PostResult(
                    post_id=r["post_id"],
                    vk_post_id=r.get("vk_post_id"),
                    status=r.get("status", "pending"),
                    error=r.get("error"),
                ))
            if task.status == TaskStatus.PROCESSING:
                task.status = TaskStatus.INTERRUPTED
                task.finished_at = datetime.now(timezone.utc).isoformat()
            _tasks[task.task_id] = task
        logger.info("task_store.loaded", count=len(_tasks))
    except Exception as exc:
        logger.warning("task_store.load_failed", error=str(exc))


def create_task(posts_data: list[dict[str, Any]]) -> Task:
    task_id = str(uuid.uuid4())
    task = Task(
        task_id=task_id,
        posts_data=posts_data,
        progress=TaskProgress(total=len(posts_data)),
        results=[PostResult(post_id=p.get("id", str(uuid.uuid4()))) for p in posts_data],
    )
    _tasks[task_id] = task
    _persist_tasks()
    logger.info("task.created", task_id=task_id, total_posts=len(posts_data))
    return task


def get_task(task_id: str) -> Optional[Task]:
    return _tasks.get(task_id)


async def cancel_task(task_id: str) -> tuple[bool, str]:
    task = _tasks.get(task_id)
    if not task:
        return False, "Task not found"

    async with task._lock:
        if task.status == TaskStatus.PENDING:
            task.status = TaskStatus.CANCELLED
            task.finished_at = datetime.now(timezone.utc).isoformat()
            task._cancel_event.set()
            _persist_tasks()
            logger.info("task.cancelled", task_id=task_id)
            return True, ""
        elif task.status == TaskStatus.PROCESSING:
            return False, "Task is already processing, cannot cancel"
        else:
            return False, f"Task is already {task.status.value}"


async def run_task(task: Task, processor: Any) -> None:
    sem = _get_semaphore()

    async with task._lock:
        if task._cancel_event.is_set():
            return
        task.status = TaskStatus.PENDING

    async with sem:
        async with task._lock:
            if task._cancel_event.is_set():
                return
            task.status = TaskStatus.PROCESSING
            task.started_at = datetime.now(timezone.utc).isoformat()
            _persist_tasks()

        try:
            await processor(task)
            async with task._lock:
                if not task._cancel_event.is_set():
                    task.status = TaskStatus.COMPLETED
                    task.finished_at = datetime.now(timezone.utc).isoformat()
                    task.progress.stage = TaskStage.DONE
                    _persist_tasks()
        except Exception as exc:
            async with task._lock:
                task.status = TaskStatus.ERROR
                task.finished_at = datetime.now(timezone.utc).isoformat()
                _persist_tasks()
            logger.error("task.failed", task_id=task.task_id, error=str(exc))


async def start_cleanup_loop() -> None:
    global _cleanup_task
    _load_tasks()
    _cleanup_old_tasks()
    _cleanup_task = asyncio.create_task(_cleanup_loop())


async def _cleanup_loop() -> None:
    while True:
        await asyncio.sleep(TASK_CLEANUP_INTERVAL)
        _cleanup_old_tasks()


def _cleanup_old_tasks() -> None:
    now = time.time()
    to_remove = []
    for task_id, task in _tasks.items():
        if task.finished_at:
            try:
                finished = datetime.fromisoformat(task.finished_at)
                age = now - finished.timestamp()
                if age > TASK_MAX_AGE_SECONDS:
                    to_remove.append(task_id)
            except Exception:
                pass

    for tid in to_remove:
        del _tasks[tid]

    if to_remove:
        _persist_tasks()
        logger.info("task.cleanup", removed=len(to_remove))
