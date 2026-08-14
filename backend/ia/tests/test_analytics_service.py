from __future__ import annotations

from datetime import date, datetime
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
            },
            {
                "cod_loja": "L002",
                "nome_loja": "Loja Norte",
                "uf": "SP",
                "quantidade_atual": 70,
                "quantidade_minima": 20,
                "quantidade_recomendada": 60,
                "status_estoque": "CHEIO",
                "prioridade_ordem": 4,
            },
        ]

    def fetch_store_detail(self, store_identifier: str) -> Mapping[str, Any] | None:
        if store_identifier.upper() not in {"L001", "LOJA CENTRO"}:
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

    def fetch_store_counts_by_uf(self) -> dict[str, int]:
        return {"SP": 2, "RJ": 1}

    def fetch_user_role_counts(self, store_identifier: str | None = None) -> list[Mapping[str, Any]]:
        if store_identifier is None:
            return [
                {"cargo": "administrador", "total": 1},
                {"cargo": "gestor", "total": 2},
                {"cargo": "lojista", "total": 5},
            ]
        return [
            {"cargo": "gestor", "total": 1},
            {"cargo": "administrador", "total": 1},
            {"cargo": "lojista", "total": 1},
        ]

    def fetch_user_summary(self) -> Mapping[str, Any]:
        return {"total_cadastrados": 9, "total_ativos": 8, "total_inativos": 1}

    def fetch_received_total_by_month(self, year: int, month: int) -> Mapping[str, Any]:
        return {"total_taloes": 80, "total_recebimentos": 2}

    def fetch_shipments_on_date(self, day: date) -> Mapping[str, Any]:
        return {"total_remessas": 2, "total_taloes": 100}

    def fetch_last_shipments_for_store(self, store_identifier: str, limit: int = 7) -> list[Mapping[str, Any]]:
        return [
            {
                "codigo_envio": "ENV001",
                "cod_loja": "L001",
                "nome_loja": "Loja Centro",
                "uf": "SP",
                "data_hora_envio": datetime(2026, 7, 19, 10, 30),
                "quantidade_enviada": 60,
                "status": "Enviado",
            }
        ]

    def fetch_average_shipments_for_store(
        self,
        store_identifier: str,
        periodo_inicio: date | None = None,
        periodo_fim: date | None = None,
    ) -> Mapping[str, Any] | None:
        return {
            "cod_loja": "L001",
            "nome_loja": "Loja Centro",
            "uf": "SP",
            "media_taloes": 50,
            "total_remessas": 2,
            "total_taloes": 100,
        }

    def fetch_summary(self, periodo_inicio: date | None, periodo_fim: date | None) -> dict[str, Any]:
        return {
            "total_lojas": 2,
            "lojas_sem_estoque": 0,
            "estoque_status": {"CRITICO": 1, "CHEIO": 1},
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


class FakeConversationResult:
    content = "Bom dia! Posso conversar e tambem consultar indicadores do sistema quando voce pedir."


class FakeConversationClient:
    def __init__(self) -> None:
        self.calls = 0

    def chat(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        max_tokens: int,
        temperature: float = 0.2,
    ) -> FakeConversationResult:
        self.calls += 1
        return FakeConversationResult()


def test_analytics_service_builds_summary_kpis() -> None:
    service = AnalyticsService(
        analytics_repository=FakeAnalyticsRepository(),
        insight_service=FakeInsightService(),
    )

    resumo = service.resumo_operacional(
        periodo_inicio=date(2026, 7, 1),
        periodo_fim=date(2026, 7, 24),
    )

    assert len(resumo.estoque_lojas) == 2
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


def test_analytics_service_answers_greeting_with_conversation_client() -> None:
    insight_service = FakeInsightService()
    conversation_client = FakeConversationClient()
    service = AnalyticsService(
        analytics_repository=FakeAnalyticsRepository(),
        insight_service=insight_service,
        conversation_client=conversation_client,
    )

    response = service.responder_chat(ChatPerguntaRequest(pergunta="bom dia"))

    assert response.intencao == "conversa_livre"
    assert response.resposta.startswith("Bom dia!")
    assert conversation_client.calls == 1
    assert insight_service.calls == 0


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
    assert "2 loja" in response.resposta
    assert insight_service.calls == 0


def test_analytics_service_answers_total_users_question() -> None:
    insight_service = FakeInsightService()
    conversation_client = FakeConversationClient()
    service = AnalyticsService(
        analytics_repository=FakeAnalyticsRepository(),
        insight_service=insight_service,
        conversation_client=conversation_client,
    )

    response = service.responder_chat(
        ChatPerguntaRequest(
            pergunta="Quantos usuarios nos temos cadastrados no nosso sistema?",
            periodo_inicio=date(2026, 7, 1),
            periodo_fim=date(2026, 7, 24),
        )
    )

    assert response.intencao == "total_usuarios"
    assert "9 usuario" in response.resposta
    assert "8 ativo" in response.resposta
    assert "1 inativo" in response.resposta
    assert insight_service.calls == 0
    assert conversation_client.calls == 0


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
    assert insight_service.last_request.calculos["origem_dados"] == "postgres_readonly_via_backend"
    contexto_banco = insight_service.last_request.calculos["contexto_banco"]
    assert contexto_banco["lojas_por_uf"][0]["uf"] == "SP"
    assert contexto_banco["usuarios"]["total_cadastrados"] == 9
    assert contexto_banco["usuarios_ativos_por_cargo"][0]["cargo"] == "administrador"


def test_analytics_service_routes_database_questions_to_llm_context() -> None:
    insight_service = FakeInsightService()
    service = AnalyticsService(
        analytics_repository=FakeAnalyticsRepository(),
        insight_service=insight_service,
    )

    response = service.responder_chat(
        ChatPerguntaRequest(
            pergunta="O que voce consegue analisar nos dados do banco?",
            periodo_inicio=date(2026, 7, 1),
            periodo_fim=date(2026, 7, 24),
        )
    )

    assert response.intencao == "insight_analitico"
    assert insight_service.calls == 1
    assert "contexto_banco" in insight_service.last_request.calculos
    assert insight_service.last_request.calculos["contexto_banco"]["total_lojas_analisadas"] == 2


def test_analytics_service_answers_stock_status_groups() -> None:
    service = AnalyticsService(
        analytics_repository=FakeAnalyticsRepository(),
        insight_service=FakeInsightService(),
    )

    red = service.responder_chat(ChatPerguntaRequest(pergunta="Quantas lojas temos em estado vermelho?"))
    green = service.responder_chat(ChatPerguntaRequest(pergunta="Quantas lojas temos em estado verde?"))

    assert red.intencao == "estoque_vermelho"
    assert "1 loja" in red.resposta
    assert green.intencao == "estoque_verde"
    assert "1 loja" in green.resposta


def test_analytics_service_answers_stores_by_state() -> None:
    service = AnalyticsService(
        analytics_repository=FakeAnalyticsRepository(),
        insight_service=FakeInsightService(),
    )

    response = service.responder_chat(ChatPerguntaRequest(pergunta="Quantas lojas temos no estado de Sao Paulo?"))

    assert response.intencao == "lojas_por_uf"
    assert "2 loja" in response.resposta
    assert "SP" in response.resposta


def test_analytics_service_answers_role_totals_and_store_roles() -> None:
    service = AnalyticsService(
        analytics_repository=FakeAnalyticsRepository(),
        insight_service=FakeInsightService(),
    )

    total = service.responder_chat(ChatPerguntaRequest(pergunta="Quantos gestores temos cadastrados?"))
    store = service.responder_chat(ChatPerguntaRequest(pergunta="Quantos lojistas temos na loja L001?"))

    assert total.intencao == "role_total"
    assert "2 gestores" in total.resposta
    assert store.intencao == "role_loja"
    assert "1 lojista" in store.resposta


def test_analytics_service_answers_month_receipts_and_shipments_by_date() -> None:
    service = AnalyticsService(
        analytics_repository=FakeAnalyticsRepository(),
        insight_service=FakeInsightService(),
    )

    receipts = service.responder_chat(ChatPerguntaRequest(pergunta="Qual o total de taloes entregues no mes de julho?"))
    shipments = service.responder_chat(ChatPerguntaRequest(pergunta="Quantas foram as remessas enviadas na data 19/07/2026?"))

    assert receipts.intencao == "taloes_entregues_mes"
    assert "80" in receipts.resposta
    assert shipments.intencao == "remessas_data"
    assert "2 remessa" in shipments.resposta


def test_analytics_service_answers_store_shipment_history_and_average() -> None:
    service = AnalyticsService(
        analytics_repository=FakeAnalyticsRepository(),
        insight_service=FakeInsightService(),
    )

    last = service.responder_chat(ChatPerguntaRequest(pergunta="Quais foram as ultimas remessas feitas para a loja L001?"))
    average = service.responder_chat(
        ChatPerguntaRequest(
            pergunta="Qual a media de taloes enviados para a loja L001 entre os dias 01/07/2026 a 19/07/2026?"
        )
    )

    assert last.intencao == "ultimas_remessas_loja"
    assert "ENV001" in last.resposta
    assert average.intencao == "media_envios_loja_periodo"
    assert "50" in average.resposta
