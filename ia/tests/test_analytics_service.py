from __future__ import annotations

from datetime import date
from typing import Any, Mapping

from app.schemas.analytics import ChatPerguntaRequest, PeriodoAnaliseRequest
from app.schemas.insights import InsightGerado, InsightResponse, UsoTokens
from app.services.analytics_service import AnalyticsService


class FakeAnalyticsRepository:
    def fetch_stock_rows(self) -> list[Mapping[str, Any]]:
        return [
            {
                "cod_loja": "L001",
                "nome_loja": "Loja Centro",
                "uf": "SP",
                "quantidade_atual": 10,
                "quantidade_minima": 20,
                "quantidade_recomendada": 60,
                "status_estoque": "CRITICO",
                "prioridade_ordem": 1,
            }
        ]

    def fetch_store_detail(self, cod_loja: str) -> Mapping[str, Any] | None:
        if cod_loja.upper() != "L001":
            return None
        return {
            "codigo_loja": "L001",
            "nome_da_loja": "Loja Centro",
            "uf": "SP",
            "quantidade_atual": 10,
            "quantidade_minima": 20,
            "quantidade_recomendada": 60,
            "total_funcionarios": 3,
        }

    def fetch_summary(self, periodo_inicio: date | None, periodo_fim: date | None) -> dict[str, Any]:
        return {
            "total_lojas": 1,
            "lojas_sem_estoque": 0,
            "estoque_status": {"CRITICO": 1},
            "total_enviado": 100,
            "total_envios": 2,
            "total_recebido": 80,
            "total_recebimentos": 1,
            "quantidade_pendente": 20,
            "tempo_medio_recebimento": 2.5,
            "total_manutencoes": 0,
            "recebimentos_divergentes": 1,
            "anomalias_abertas": 1,
        }


class FakeInsightService:
    def __init__(self) -> None:
        self.calls = 0
        self.last_request: Any = None

    def analisar_calculos(self, request: Any) -> InsightResponse:
        self.calls += 1
        self.last_request = request
        return InsightResponse(
            cache_hit=False,
            calculo_hash="abc",
            indicador=request.indicador,
            insight=InsightGerado(
                titulo="Resumo executivo",
                resumo="Ha uma loja critica e pendencia de recebimento.",
                recomendacao="Priorizar reposicao e confirmar recebimentos pendentes.",
                dados_origem=["analytics"],
                periodo_analisado="2026-07-01 a 2026-07-24",
                nivel_confianca="alto",
                pontos_atencao=[],
            ),
            usage=UsoTokens(),
        )


def test_analytics_service_builds_summary_kpis() -> None:
    service = AnalyticsService(
        analytics_repository=FakeAnalyticsRepository(),
        insight_service=FakeInsightService(),
    )

    resumo = service.resumo_operacional(
        periodo_inicio=date(2026, 7, 1),
        periodo_fim=date(2026, 7, 24),
    )

    assert len(resumo.estoque_lojas) == 1
    assert resumo.estoque_lojas[0].gap_para_minimo == -10
    assert any(kpi.indicador == "Taxa de recebimento" and kpi.valor == 80 for kpi in resumo.kpis)


def test_analytics_service_generates_executive_insight() -> None:
    service = AnalyticsService(
        analytics_repository=FakeAnalyticsRepository(),
        insight_service=FakeInsightService(),
    )

    response = service.insight_executivo(
        PeriodoAnaliseRequest(periodo_inicio=date(2026, 7, 1), periodo_fim=date(2026, 7, 24))
    )

    assert response.indicador == "Insight executivo"
    assert response.insight.nivel_confianca == "alto"


def test_analytics_service_answers_chat_stock_question() -> None:
    service = AnalyticsService(
        analytics_repository=FakeAnalyticsRepository(),
        insight_service=FakeInsightService(),
    )

    response = service.responder_chat(
        ChatPerguntaRequest(
            pergunta="Quais lojas estao abaixo do estoque minimo?",
            periodo_inicio=date(2026, 7, 1),
            periodo_fim=date(2026, 7, 24),
        )
    )

    assert response.intencao == "estoque_alertas"
    assert "Loja Centro" in response.resposta
    assert response.kpis_considerados == ["Lojas criticas", "Lojas em alerta"]


def test_analytics_service_answers_total_stores_question() -> None:
    insight_service = FakeInsightService()
    service = AnalyticsService(
        analytics_repository=FakeAnalyticsRepository(),
        insight_service=insight_service,
    )

    response = service.responder_chat(
        ChatPerguntaRequest(
            pergunta="Quantas lojas temos atualmente?",
            periodo_inicio=date(2026, 7, 1),
            periodo_fim=date(2026, 7, 24),
        )
    )

    assert response.intencao == "total_lojas"
    assert "1 loja" in response.resposta
    assert insight_service.calls == 0


def test_analytics_service_answers_store_current_stock_question() -> None:
    service = AnalyticsService(
        analytics_repository=FakeAnalyticsRepository(),
        insight_service=FakeInsightService(),
    )

    response = service.responder_chat(
        ChatPerguntaRequest(
            pergunta="Qual o estoque atual da loja com codigo L001?",
            periodo_inicio=date(2026, 7, 1),
            periodo_fim=date(2026, 7, 24),
        )
    )

    assert response.intencao == "estoque_loja"
    assert "estoque atual de 10" in response.resposta


def test_analytics_service_answers_store_employees_question() -> None:
    service = AnalyticsService(
        analytics_repository=FakeAnalyticsRepository(),
        insight_service=FakeInsightService(),
    )

    response = service.responder_chat(
        ChatPerguntaRequest(
            pergunta="Quantos funcionarios temos na loja L001?",
            periodo_inicio=date(2026, 7, 1),
            periodo_fim=date(2026, 7, 24),
        )
    )

    assert response.intencao == "funcionarios_loja"
    assert "3 funcionario" in response.resposta


def test_analytics_service_answers_store_replenishment_question() -> None:
    service = AnalyticsService(
        analytics_repository=FakeAnalyticsRepository(),
        insight_service=FakeInsightService(),
    )

    response = service.responder_chat(
        ChatPerguntaRequest(
            pergunta="Qual a previsao de reposicao para a loja L001?",
            periodo_inicio=date(2026, 7, 1),
            periodo_fim=date(2026, 7, 24),
        )
    )

    assert response.intencao == "reposicao_loja"
    assert "50 taloes" in response.resposta


def test_analytics_service_uses_llm_only_for_analytical_chat() -> None:
    insight_service = FakeInsightService()
    service = AnalyticsService(
        analytics_repository=FakeAnalyticsRepository(),
        insight_service=insight_service,
    )

    response = service.responder_chat(
        ChatPerguntaRequest(
            pergunta="Me explique a situacao geral e o que devo priorizar",
            periodo_inicio=date(2026, 7, 1),
            periodo_fim=date(2026, 7, 24),
        )
    )

    assert response.intencao == "insight_analitico"
    assert "Priorizar reposicao" in response.resposta
    assert insight_service.calls == 1
    assert insight_service.last_request.indicador == "Chat analitico"
    assert "kpis" in insight_service.last_request.calculos
    assert len(insight_service.last_request.calculos["top_alertas_estoque"]) == 1
