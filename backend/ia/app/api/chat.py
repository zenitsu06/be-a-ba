from fastapi import APIRouter, Depends, HTTPException

from app.api.dependencies import get_analytics_service
from app.schemas.analytics import ChatPerguntaRequest, ChatPerguntaResponse
from app.services.analytics_service import AnalyticsService


router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("/perguntar", response_model=ChatPerguntaResponse)
def perguntar(
    payload: ChatPerguntaRequest,
    service: AnalyticsService = Depends(get_analytics_service),
) -> ChatPerguntaResponse:
    try:
        return service.responder_chat(payload)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
