from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel


class ErrorResponse(BaseModel):
    error: str
    detail: Optional[str] = None
    code: Optional[str] = None


def error_response(error: str, detail: str = None, code: str = None) -> dict[str, Any]:
    result: dict[str, Any] = {"error": error}
    if detail:
        result["detail"] = detail
    if code:
        result["code"] = code
    return result
