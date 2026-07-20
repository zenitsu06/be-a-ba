from __future__ import annotations

from typing import Any

from app.analytics.fingerprints import calculation_hash
from app.core.config import get_settings
from app.llm.openrouter_client import OpenRouterClient
from app.llm.prompts import build_insight_prompt
from app.repositories.insight_repository import InsightRepository
from app.repositories.semantic_repository import SemanticLayerRepository
from app.schemas.insights import CalculoNodeRequest, InsightGerado, InsightResponse, UsoTokens


class InsightService:
    def __init__(
        self,
        *,
        insight_repository: InsightRepository,
        semantic_repository: SemanticLayerRepository,
        llm_client: OpenRouterClient,
    ) -> None:
        self.insight_repository = insight_repository
        self.semantic_repository = semantic_repository
        self.llm_client = llm_client

    def analisar_calculos(self, request: CalculoNodeRequest) -> InsightResponse:
        fingerprint_payload = _fingerprint_payload(request)
        calculo_hash = calculation_hash(fingerprint_payload)

        settings = get_settings()
        if settings.insight_cache_enabled and not request.forcar_nova_analise:
            stored = self.insight_repository.find_by_hash(calculo_hash)
            if stored is not None:
                return _response_from_stored(stored, cache_hit=True)

        indicador = self.semantic_repository.find_by_name(request.indicador)
        prompt = build_insight_prompt(
            indicador=indicador,
            periodo_inicio=str(request.periodo_inicio),
            periodo_fim=str(request.periodo_fim),
            filtros=request.filtros,
            calculos=request.calculos,
            observacoes=request.observacoes,
        )
        insight, llm_result = self.llm_client.gerar_insight(prompt)

        stored = self.insight_repository.save(
            calculo_hash=calculo_hash,
            indicador=request.indicador,
            periodo_inicio=str(request.periodo_inicio),
            periodo_fim=str(request.periodo_fim),
            origem=request.origem,
            filtros=request.filtros,
            calculos=request.calculos,
            insight=insight,
            model_requested=llm_result.model_requested,
            model_returned=llm_result.model_returned,
            usage=llm_result.usage,
        )
        return _response_from_stored(stored, cache_hit=False)


def _fingerprint_payload(request: CalculoNodeRequest) -> dict[str, Any]:
    return {
        "indicador": request.indicador,
        "periodo_inicio": str(request.periodo_inicio),
        "periodo_fim": str(request.periodo_fim),
        "origem": request.origem,
        "filtros": request.filtros,
        "calculos": request.calculos,
    }


def _response_from_stored(stored: dict[str, Any], *, cache_hit: bool) -> InsightResponse:
    return InsightResponse(
        cache_hit=cache_hit,
        calculo_hash=stored["calculo_hash"],
        indicador=stored["indicador"],
        insight=InsightGerado.model_validate(stored["insight"]),
        model_requested=stored.get("model_requested"),
        model_returned=stored.get("model_returned"),
        usage=UsoTokens.model_validate(stored.get("usage") or {}),
        criado_em=stored.get("criado_em"),
    )

