from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.dependencies import get_analytics_service
from app.schemas.analytics import AnalyticsResumo, EstoqueLojaIndicador, PeriodoAnaliseRequest
from app.schemas.insights import InsightResponse
from app.services.analytics_service import AnalyticsService


router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/resumo", response_model=AnalyticsResumo)
def resumo_operacional(
    periodo_inicio: date | None = Query(default=None),
    periodo_fim: date | None = Query(default=None),
    service: AnalyticsService = Depends(get_analytics_service),
) -> AnalyticsResumo:
    try:
        return service.resumo_operacional(periodo_inicio=periodo_inicio, periodo_fim=periodo_fim)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get("/estoque-lojas", response_model=list[EstoqueLojaIndicador])
def estoque_lojas(
    service: AnalyticsService = Depends(get_analytics_service),
) -> list[EstoqueLojaIndicador]:
    try:
        return service.estoque_lojas()
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.post("/insight-executivo", response_model=InsightResponse)
def insight_executivo(
    payload: PeriodoAnaliseRequest,
    service: AnalyticsService = Depends(get_analytics_service),
) -> InsightResponse:
    try:
        return service.insight_executivo(payload)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
