from fastapi import APIRouter, Depends, HTTPException

from app.api.dependencies import get_insight_service
from app.llm.openrouter_client import OpenRouterError
from app.schemas.insights import CalculoNodeRequest, InsightResponse
from app.services.insight_service import InsightService


router = APIRouter(prefix="/insights", tags=["insights"])


@router.post("/analisar-calculos", response_model=InsightResponse)
def analisar_calculos(
    payload: CalculoNodeRequest,
    service: InsightService = Depends(get_insight_service),
) -> InsightResponse:
    try:
        return service.analisar_calculos(payload)
    except OpenRouterError as exc:
        raise HTTPException(
            status_code=502,
            detail={
                "provider": "openrouter",
                "status_code": exc.status_code,
                "message": exc.message,
            },
        ) from exc

