from fastapi import APIRouter, HTTPException

from app.llm.openrouter_client import OpenRouterClient, OpenRouterError
from app.schemas.llm import LlmTesteRequest


router = APIRouter(prefix="/llm", tags=["llm"])


@router.post("/teste")
def testar_llm(payload: LlmTesteRequest) -> dict[str, object]:
    client = OpenRouterClient.from_settings()
    try:
        result = client.test_prompt(payload.prompt)
    except OpenRouterError as exc:
        raise HTTPException(
            status_code=502,
            detail={
                "provider": "openrouter",
                "status_code": exc.status_code,
                "message": exc.message,
            },
        ) from exc
    return {
        "model_requested": result.model_requested,
        "model_returned": result.model_returned,
        "content": result.content,
        "usage": result.usage.model_dump(),
    }

