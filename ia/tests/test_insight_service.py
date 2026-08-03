from __future__ import annotations

from datetime import date
from pathlib import Path

from app.llm.openrouter_client import LlmResult, parse_insight
from app.repositories.insight_repository import InMemoryInsightRepository
from app.repositories.semantic_repository import SemanticLayerRepository
from app.schemas.insights import CalculoNodeRequest, InsightGerado, UsoTokens
from app.services.insight_service import InsightService


class FakeLlmClient:
    calls = 0

    def gerar_insight(self, prompt: str) -> tuple[InsightGerado, LlmResult]:
        self.calls += 1
        insight = InsightGerado(
            titulo="Estoque abaixo do minimo",
            resumo="A loja apresenta gap negativo para o minimo informado.",
            recomendacao="Priorizar reposicao conforme regra operacional.",
            dados_origem=["calculos_node.gap_para_minimo"],
            periodo_analisado="2026-07-01 a 2026-07-19",
            nivel_confianca="alto",
            pontos_atencao=["Validar se o estoque atual esta atualizado."],
        )
        return insight, LlmResult(
            model_requested="fake",
            model_returned="fake",
            content=insight.model_dump_json(),
            usage=UsoTokens(prompt_tokens=10, completion_tokens=20, total_tokens=30),
        )


def test_insight_service_reuses_cached_analysis() -> None:
    base_dir = Path(__file__).resolve().parents[1]
    repository = InMemoryInsightRepository()
    llm = FakeLlmClient()
    service = InsightService(
        insight_repository=repository,
        semantic_repository=SemanticLayerRepository(base_dir / "semantic_layer" / "indicadores.json"),
        llm_client=llm,
    )
    request = CalculoNodeRequest(
        indicador="Gap para minimo",
        periodo_inicio=date(2026, 7, 1),
        periodo_fim=date(2026, 7, 19),
        calculos={"loja_id": 1, "quantidade_atual": 10, "quantidade_minima": 20, "gap": -10},
    )

    first = service.analisar_calculos(request)
    second = service.analisar_calculos(request)

    assert first.cache_hit is False
    assert second.cache_hit is True
    assert first.calculo_hash == second.calculo_hash
    assert llm.calls == 1


def test_openrouter_parser_accepts_fenced_json_with_extra_text() -> None:
    content = """
    ```json
    {
      "titulo": "Analise de Lojas e Estoque",
      "resumo": "A analise das lojas revela alertas de estoque.",
      "recomendacao": "Priorizar reposicao nas lojas criticas.",
      "dados_origem": ["analytics"],
      "periodo_analisado": "2026-07-01 a 2026-07-31",
      "nivel_confianca": "medio",
      "pontos_atencao": ["Validar estoque atual."]
    }
    ```
    Texto extra que a LLM nao deveria ter enviado.
    """

    insight = parse_insight(content)

    assert insight.titulo == "Analise de Lojas e Estoque"
    assert insight.resumo == "A analise das lojas revela alertas de estoque."
    assert insight.recomendacao == "Priorizar reposicao nas lojas criticas."
