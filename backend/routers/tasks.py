from __future__ import annotations

from fastapi import APIRouter, HTTPException

from schemas import error_response
from services.task_store import cancel_task, get_task

router = APIRouter(tags=["tasks"])


@router.get("/task/{task_id}")
async def get_task_status(task_id: str):
    task = get_task(task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    return task.to_dict()


@router.delete("/task/{task_id}")
async def cancel_task_endpoint(task_id: str):
    success, error = await cancel_task(task_id)
    if not success:
        if "not found" in error.lower():
            raise HTTPException(404, error)
        raise HTTPException(409, error)
    return {"status": "cancelled"}
