from __future__ import annotations

import re
import unicodedata
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, Mapping, Protocol, cast

from app.schemas.analytics import (
    AnalyticsResumo,
    ChatPerguntaRequest,
    ChatPerguntaResponse,
    EstoqueLojaIndicador,
    KpiValue,
    PeriodoAnaliseRequest,
)
from app.schemas.insights import CalculoNodeRequest, InsightResponse


_MONTHS = {
    "janeiro": 1,
    "jan": 1,
    "fevereiro": 2,
    "fev": 2,
    "marco": 3,
    "mar": 3,
    "abril": 4,
    "abr": 4,
    "maio": 5,
    "mai": 5,
    "junho": 6,
    "jun": 6,
    "julho": 7,
    "jul": 7,
    "agosto": 8,
    "ago": 8,
    "setembro": 9,
    "set": 9,
    "outubro": 10,
    "out": 10,
    "novembro": 11,
    "nov": 11,
    "dezembro": 12,
    "dez": 12,
}
_MONTH_LABELS = {
    1: "janeiro",
    2: "fevereiro",
    3: "marco",
    4: "abril",
    5: "maio",
    6: "junho",
    7: "julho",
    8: "agosto",
    9: "setembro",
    10: "outubro",
    11: "novembro",
    12: "dezembro",
}
_STATE_TO_UF = {
    "acre": "AC",
    "alagoas": "AL",
    "amapa": "AP",
    "amazonas": "AM",
    "bahia": "BA",
    "ceara": "CE",
    "distrito federal": "DF",
    "espirito santo": "ES",
    "goias": "GO",
    "maranhao": "MA",
    "mato grosso do sul": "MS",
    "mato grosso": "MT",
    "minas gerais": "MG",
    "paraiba": "PB",
    "parana": "PR",
    "para": "PA",
    "pernambuco": "PE",
    "piaui": "PI",
    "rio de janeiro": "RJ",
    "rio grande do norte": "RN",
    "rio grande do sul": "RS",
    "rondonia": "RO",
    "roraima": "RR",
    "santa catarina": "SC",
    "sao paulo": "SP",
    "sergipe": "SE",
    "tocantins": "TO",
}
_UF_TO_STATE = {uf: state.title() for state, uf in _STATE_TO_UF.items()}
_UF_TO_STATE.update({"SP": "Sao Paulo", "SC": "Santa Catarina", "RS": "Rio Grande do Sul", "PR": "Parana"})


class AnalyticsDataSource(Protocol):
    def fetch_stock_rows(self) -> list[Mapping[str, Any]]:
        ...

    def fetch_store_detail(self, store_identifier: str) -> Mapping[str, Any] | None:
        ...

    def fetch_store_counts_by_uf(self) -> dict[str, int]:
        ...

    def fetch_user_role_counts(self, store_identifier: str | None = None) -> list[Mapping[str, Any]]:
        ...

    def fetch_received_total_by_month(self, year: int, month: int) -> Mapping[str, Any]:
        ...

    def fetch_shipments_on_date(self, day: date) -> Mapping[str, Any]:
        ...

    def fetch_last_shipments_for_store(self, store_identifier: str, limit: int = 7) -> list[Mapping[str, Any]]:
        ...

    def fetch_average_shipments_for_store(
        self,
        store_identifier: str,
        periodo_inicio: date | None = None,
        periodo_fim: date | None = None,
    ) -> Mapping[str, Any] | None:
        ...

    def fetch_summary(self, periodo_inicio: date | None, periodo_fim: date | None) -> dict[str, Any]:
        ...


class InsightAnalyzer(Protocol):
    def analisar_calculos(self, request: CalculoNodeRequest) -> InsightResponse:
        ...


class ConversationResult(Protocol):
    content: str


class ConversationClient(Protocol):
    def chat(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        max_tokens: int,
        temperature: float = 0.2,
    ) -> ConversationResult:
        ...


class AnalyticsService:
    def __init__(
        self,
        *,
        analytics_repository: AnalyticsDataSource,
        insight_service: InsightAnalyzer,
        conversation_client: ConversationClient | None = None,
    ) -> None:
        self.analytics_repository = analytics_repository
        self.insight_service = insight_service
        self.conversation_client = conversation_client

    def estoque_lojas(self) -> list[EstoqueLojaIndicador]:
        return [_stock_from_row(row) for row in self.analytics_repository.fetch_stock_rows()]

    def resumo_operacional(
        self,
        *,
        periodo_inicio: date | None,
        periodo_fim: date | None,
    ) -> AnalyticsResumo:
        summary = self.analytics_repository.fetch_summary(periodo_inicio, periodo_fim)
        estoque = self.estoque_lojas()
        return AnalyticsResumo(
            origem="postgres",
            periodo_inicio=periodo_inicio,
            periodo_fim=periodo_fim,
            kpis=_kpis_from_summary(summary),
            estoque_lojas=estoque,
        )

    def insight_executivo(self, request: PeriodoAnaliseRequest) -> InsightResponse:
        periodo_inicio, periodo_fim = _resolve_period(request)
        resumo = self.resumo_operacional(periodo_inicio=periodo_inicio, periodo_fim=periodo_fim)
        top_alertas: list[dict[str, Any]] = [
            item.model_dump(mode="json")
            for item in resumo.estoque_lojas
            if item.status_estoque in {"CRITICO", "ALERTA", "BAIXO"}
        ][:10]
        kpis_payload: list[dict[str, Any]] = [
            item.model_dump(mode="json") for item in resumo.kpis
        ]
        calculos: dict[str, Any] = {
            "kpis": kpis_payload,
            "top_alertas_estoque": top_alertas,
            "total_lojas_analisadas": len(resumo.estoque_lojas),
        }
        payload = CalculoNodeRequest(
            indicador="Insight executivo",
            periodo_inicio=periodo_inicio,
            periodo_fim=periodo_fim,
            origem="analytics",
            calculos=calculos,
            observacoes=(
                "Gerar insight executivo curto. Usar somente os KPIs calculados pela camada analytics. "
                "Nao recalcular indicadores e nao inventar dados."
            ),
            forcar_nova_analise=request.forcar_nova_analise,
        )
        return self.insight_service.analisar_calculos(payload)

    def responder_chat(self, request: ChatPerguntaRequest) -> ChatPerguntaResponse:
        pergunta = request.pergunta.strip()
        periodo_inicio, periodo_fim = _resolve_chat_period(request)
        intencao = _detect_intent(pergunta)

        if intencao == "conversa_livre":
            return self._responder_conversa_livre(
                pergunta=pergunta,
                periodo_inicio=periodo_inicio,
                periodo_fim=periodo_fim,
            )

        resumo = self.resumo_operacional(periodo_inicio=periodo_inicio, periodo_fim=periodo_fim)
        kpis = {_normalize(item.indicador): item for item in resumo.kpis}

        if intencao == "insight_analitico":
            return self._responder_insight_analitico(
                pergunta=pergunta,
                periodo_inicio=periodo_inicio,
                periodo_fim=periodo_fim,
                resumo=resumo,
            )

        if intencao == "funcionarios_total":
            counts = self.analytics_repository.fetch_user_role_counts()
            total = sum(_to_int(row.get("total")) for row in counts)
            return _chat_response(
                pergunta=intencao,
                periodo_inicio=periodo_inicio,
                periodo_fim=periodo_fim,
                resposta=f"Temos {total} funcionario(s) ativo(s)/cadastrado(s) no sistema: {_format_role_breakdown(counts)}.",
                kpis=["Funcionarios ativos cadastrados"],
            )

        if intencao == "total_lojas":
            total = _kpi_value(kpis, "total de lojas")
            sem_estoque = _kpi_value(kpis, "lojas sem estoque cadastrado")
            return _chat_response(
                pergunta=intencao,
                periodo_inicio=periodo_inicio,
                periodo_fim=periodo_fim,
                resposta=(
                    f"Atualmente temos {_format_number(total)} loja(s) cadastrada(s). "
                    f"Dessas, {_format_number(sem_estoque)} esta(o) sem estoque cadastrado."
                ),
                kpis=["Total de lojas", "Lojas sem estoque cadastrado"],
            )

        if intencao == "estoque_vermelho":
            return _chat_response(
                pergunta=intencao,
                periodo_inicio=periodo_inicio,
                periodo_fim=periodo_fim,
                resposta=_answer_stock_status_group(resumo.estoque_lojas, "vermelho"),
                kpis=["Lojas criticas", "Lojas em alerta"],
            )

        if intencao == "estoque_verde":
            return _chat_response(
                pergunta=intencao,
                periodo_inicio=periodo_inicio,
                periodo_fim=periodo_fim,
                resposta=_answer_stock_status_group(resumo.estoque_lojas, "verde"),
                kpis=["Lojas na media", "Lojas cheias"],
            )

        if intencao == "lojas_por_uf":
            uf = _extract_uf(pergunta)
            if uf is None:
                return _chat_response(
                    pergunta=intencao,
                    periodo_inicio=periodo_inicio,
                    periodo_fim=periodo_fim,
                    resposta="Informe o estado brasileiro para eu consultar. Exemplo: quantas lojas temos no estado de Sao Paulo?",
                    kpis=[],
                )
            counts = self.analytics_repository.fetch_store_counts_by_uf()
            total = counts.get(uf, 0)
            return _chat_response(
                pergunta=intencao,
                periodo_inicio=periodo_inicio,
                periodo_fim=periodo_fim,
                resposta=f"Temos {total} loja(s) cadastrada(s) em {_state_label(uf)}.",
                kpis=["Lojas por UF"],
            )

        if intencao == "taloes_entregues_mes":
            month_year = _extract_month_year(pergunta)
            if month_year is None:
                return _chat_response(
                    pergunta=intencao,
                    periodo_inicio=periodo_inicio,
                    periodo_fim=periodo_fim,
                    resposta="Informe o mes para eu consultar os taloes entregues. Exemplo: total de taloes entregues no mes de julho.",
                    kpis=[],
                )
            month, year = month_year
            dados = self.analytics_repository.fetch_received_total_by_month(year, month)
            total = _to_int(dados.get("total_taloes"))
            registros = _to_int(dados.get("total_recebimentos"))
            return _chat_response(
                pergunta=intencao,
                periodo_inicio=periodo_inicio,
                periodo_fim=periodo_fim,
                resposta=(
                    f"No mes de {_month_label(month)} de {year}, foram entregues/recebidos "
                    f"{total} talao(oes), em {registros} recebimento(s) registrado(s)."
                ),
                kpis=["Total recebido"],
            )

        if intencao == "remessas_data":
            day = _extract_date(pergunta)
            if day is None:
                return _chat_response(
                    pergunta=intencao,
                    periodo_inicio=periodo_inicio,
                    periodo_fim=periodo_fim,
                    resposta="Informe a data da consulta. Exemplo: quantas remessas foram enviadas em 19/07/2026?",
                    kpis=[],
                )
            dados = self.analytics_repository.fetch_shipments_on_date(day)
            total_remessas = _to_int(dados.get("total_remessas"))
            total_taloes = _to_int(dados.get("total_taloes"))
            return _chat_response(
                pergunta=intencao,
                periodo_inicio=periodo_inicio,
                periodo_fim=periodo_fim,
                resposta=(
                    f"Na data {day.isoformat()}, foram enviadas {total_remessas} remessa(s), "
                    f"somando {total_taloes} talao(oes)."
                ),
                kpis=["Remessas por data", "Total enviado"],
            )

        if intencao == "role_total":
            role = _extract_role(pergunta)
            if role is None:
                return _chat_response(
                    pergunta=intencao,
                    periodo_inicio=periodo_inicio,
                    periodo_fim=periodo_fim,
                    resposta="Informe o cargo que deseja consultar: lojistas, gestores ou administradores.",
                    kpis=[],
                )
            counts = self.analytics_repository.fetch_user_role_counts()
            total = _role_count(counts, role)
            return _chat_response(
                pergunta=intencao,
                periodo_inicio=periodo_inicio,
                periodo_fim=periodo_fim,
                resposta=f"Temos {total} {_role_label(role, plural=total != 1)} ativo(s)/cadastrado(s) no sistema.",
                kpis=["Usuarios por cargo"],
            )

        if intencao in {
            "estoque_loja",
            "funcionarios_loja",
            "reposicao_loja",
            "media_envios_loja",
            "media_envios_loja_periodo",
            "role_loja",
            "ultimas_remessas_loja",
        }:
            store_identifier = _extract_store_identifier(pergunta, resumo.estoque_lojas)
            if store_identifier is None:
                return _chat_response(
                    pergunta=intencao,
                    periodo_inicio=periodo_inicio,
                    periodo_fim=periodo_fim,
                    resposta="Informe o nome ou codigo da loja para eu consultar esse indicador. Exemplo: estoque atual da loja L001.",
                    kpis=[],
                )

            detalhe = self.analytics_repository.fetch_store_detail(store_identifier)
            if detalhe is None:
                return _chat_response(
                    pergunta=intencao,
                    periodo_inicio=periodo_inicio,
                    periodo_fim=periodo_fim,
                    resposta=f"Nao encontrei uma loja cadastrada para {store_identifier}.",
                    kpis=[],
                )

            store_key = str(detalhe.get("codigo_loja") or store_identifier)

            if intencao == "estoque_loja":
                return _chat_response(
                    pergunta=intencao,
                    periodo_inicio=periodo_inicio,
                    periodo_fim=periodo_fim,
                    resposta=_answer_current_stock(detalhe),
                    kpis=["Estoque atual", "Estoque minimo", "Quantidade recomendada atual"],
                )

            if intencao == "funcionarios_loja":
                role_counts = self.analytics_repository.fetch_user_role_counts(store_key)
                return _chat_response(
                    pergunta=intencao,
                    periodo_inicio=periodo_inicio,
                    periodo_fim=periodo_fim,
                    resposta=_answer_store_employees(detalhe, role_counts),
                    kpis=["Funcionarios por loja"],
                )

            if intencao == "reposicao_loja":
                return _chat_response(
                    pergunta=intencao,
                    periodo_inicio=periodo_inicio,
                    periodo_fim=periodo_fim,
                    resposta=_answer_replenishment_forecast(detalhe),
                    kpis=["Estoque atual", "Estoque recomendado", "Gap para recomendado"],
                )

            if intencao == "role_loja":
                role = _extract_role(pergunta)
                if role is None:
                    return _chat_response(
                        pergunta=intencao,
                        periodo_inicio=periodo_inicio,
                        periodo_fim=periodo_fim,
                        resposta="Informe o cargo que deseja consultar nessa loja: lojistas, gestores ou administradores.",
                        kpis=[],
                    )
                counts = self.analytics_repository.fetch_user_role_counts(store_key)
                total = _role_count(counts, role)
                return _chat_response(
                    pergunta=intencao,
                    periodo_inicio=periodo_inicio,
                    periodo_fim=periodo_fim,
                    resposta=f"A loja {_store_label(detalhe)} possui {total} {_role_label(role, plural=total != 1)} ativo(s).",
                    kpis=["Usuarios por cargo na loja"],
                )

            if intencao == "ultimas_remessas_loja":
                rows = self.analytics_repository.fetch_last_shipments_for_store(store_key, limit=7)
                return _chat_response(
                    pergunta=intencao,
                    periodo_inicio=periodo_inicio,
                    periodo_fim=periodo_fim,
                    resposta=_answer_last_shipments(detalhe, rows),
                    kpis=["Ultimas remessas"],
                )

            range_inicio, range_fim = _extract_date_range(pergunta)
            if intencao == "media_envios_loja_periodo" and (range_inicio is None or range_fim is None):
                return _chat_response(
                    pergunta=intencao,
                    periodo_inicio=periodo_inicio,
                    periodo_fim=periodo_fim,
                    resposta="Informe as duas datas do periodo. Exemplo: media de taloes enviados para a loja L001 entre 01/07/2026 e 19/07/2026.",
                    kpis=[],
                )

            media_inicio = range_inicio if intencao == "media_envios_loja_periodo" else request.periodo_inicio
            media_fim = range_fim if intencao == "media_envios_loja_periodo" else request.periodo_fim
            dados = self.analytics_repository.fetch_average_shipments_for_store(
                store_key,
                periodo_inicio=media_inicio,
                periodo_fim=media_fim,
            )
            return _chat_response(
                pergunta=intencao,
                periodo_inicio=periodo_inicio,
                periodo_fim=periodo_fim,
                resposta=_answer_average_shipments(detalhe, dados, media_inicio, media_fim),
                kpis=["Media de taloes enviados por loja"],
            )

        if intencao == "estoque_alertas":
            return _chat_response(
                pergunta=intencao,
                periodo_inicio=periodo_inicio,
                periodo_fim=periodo_fim,
                resposta=_answer_stock_alerts(resumo.estoque_lojas),
                kpis=["Lojas criticas", "Lojas em alerta"],
            )

        if intencao == "envios":
            total = _kpi_value(kpis, "total enviado")
            pendente = _kpi_value(kpis, "quantidade pendente")
            return _chat_response(
                pergunta=intencao,
                periodo_inicio=periodo_inicio,
                periodo_fim=periodo_fim,
                resposta=(
                    f"No periodo {_format_period(periodo_inicio, periodo_fim)}, "
                    f"o total enviado foi {_format_number(total)} taloes. "
                    f"A quantidade pendente calculada e {_format_number(pendente)} taloes."
                ),
                kpis=["Total enviado", "Quantidade pendente"],
            )

        if intencao == "recebimentos":
            total = _kpi_value(kpis, "total recebido")
            taxa = _kpi_value(kpis, "taxa de recebimento")
            tempo = _kpi_value(kpis, "tempo medio de recebimento")
            return _chat_response(
                pergunta=intencao,
                periodo_inicio=periodo_inicio,
                periodo_fim=periodo_fim,
                resposta=(
                    f"No periodo {_format_period(periodo_inicio, periodo_fim)}, "
                    f"foram recebidos {_format_number(total)} taloes. "
                    f"A taxa de recebimento esta em {_format_number(taxa)}% "
                    f"e o tempo medio de recebimento e {_format_number(tempo)} dia(s)."
                ),
                kpis=["Total recebido", "Taxa de recebimento", "Tempo medio de recebimento"],
            )

        if intencao == "divergencias":
            taxa = _kpi_value(kpis, "taxa de divergencia")
            anomalias = _kpi_value(kpis, "anomalias abertas")
            manutencao = _kpi_value(kpis, "taxa de manutencao")
            return _chat_response(
                pergunta=intencao,
                periodo_inicio=periodo_inicio,
                periodo_fim=periodo_fim,
                resposta=(
                    f"No periodo {_format_period(periodo_inicio, periodo_fim)}, "
                    f"a taxa de divergencia esta em {_format_number(taxa)}%, "
                    f"com {_format_number(anomalias)} anomalia(s) aberta(s). "
                    f"A taxa de manutencao calculada e {_format_number(manutencao)}%."
                ),
                kpis=["Taxa de divergencia", "Anomalias abertas", "Taxa de manutencao"],
            )

        return _chat_response(
            pergunta=intencao,
            periodo_inicio=periodo_inicio,
            periodo_fim=periodo_fim,
            resposta=_answer_general_summary(resumo, kpis),
            kpis=[
                "Total de lojas",
                "Lojas criticas",
                "Lojas em alerta",
                "Total enviado",
                "Total recebido",
                "Quantidade pendente",
                "Anomalias abertas",
            ],
        )

    def _responder_conversa_livre(
        self,
        *,
        pergunta: str,
        periodo_inicio: date,
        periodo_fim: date,
    ) -> ChatPerguntaResponse:
        if self.conversation_client is None:
            resposta = _conversation_fallback()
        else:
            try:
                result = self.conversation_client.chat(
                    system_prompt=(
                        "Voce e o assistente de IA do projeto be-a-ba/Verdecard. "
                        "Converse em portugues brasileiro, de forma natural e curta. "
                        "Nao invente numeros nem indicadores. Para dados especificos, explique que "
                        "voce consulta o banco quando o usuario perguntar sobre lojas, estoque, "
                        "funcionarios, envios, recebimentos ou remessas."
                    ),
                    user_prompt=pergunta,
                    max_tokens=180,
                    temperature=0.35,
                )
                resposta = result.content.strip() or _conversation_fallback()
            except Exception:
                resposta = _conversation_fallback()

        return _chat_response(
            pergunta="conversa_livre",
            periodo_inicio=periodo_inicio,
            periodo_fim=periodo_fim,
            resposta=resposta,
            kpis=[],
        )

    def _responder_insight_analitico(
        self,
        *,
        pergunta: str,
        periodo_inicio: date,
        periodo_fim: date,
        resumo: AnalyticsResumo,
    ) -> ChatPerguntaResponse:
        top_alertas: list[dict[str, Any]] = [
            _stock_alert_payload(item)
            for item in resumo.estoque_lojas
            if item.status_estoque in {"CRITICO", "ALERTA", "BAIXO"} or item.estoque_atual < item.estoque_minimo
        ][:5]
        kpis_relevantes: list[dict[str, Any]] = [
            item.model_dump(mode="json")
            for item in resumo.kpis
            if item.indicador
            in {
                "Total de lojas",
                "Lojas criticas",
                "Lojas em alerta",
                "Total enviado",
                "Total recebido",
                "Quantidade pendente",
                "Taxa de recebimento",
                "Taxa de divergencia",
                "Anomalias abertas",
            }
        ]
        calculos: dict[str, Any] = {
            "pergunta_usuario": pergunta,
            "kpis": kpis_relevantes,
            "top_alertas_estoque": top_alertas,
            "total_lojas_analisadas": len(resumo.estoque_lojas),
        }
        payload = CalculoNodeRequest(
            indicador="Chat analitico",
            periodo_inicio=periodo_inicio,
            periodo_fim=periodo_fim,
            origem="analytics",
            filtros={"pergunta_normalizada": _normalize(pergunta)},
            calculos=calculos,
            observacoes=(
                "Responder em linguagem natural, de forma objetiva, usando somente estes KPIs ja calculados. "
                "Nao inventar dados, nao recalcular formulas e nao citar que recebeu JSON."
            ),
        )

        try:
            insight = self.insight_service.analisar_calculos(payload)
        except RuntimeError:
            kpis = {_normalize(item.indicador): item for item in resumo.kpis}
            return _chat_response(
                pergunta="resumo",
                periodo_inicio=periodo_inicio,
                periodo_fim=periodo_fim,
                resposta=_answer_general_summary(resumo, kpis),
                kpis=[item.indicador for item in resumo.kpis],
            )

        return _chat_response(
            pergunta="insight_analitico",
            periodo_inicio=periodo_inicio,
            periodo_fim=periodo_fim,
            resposta=_format_insight_for_chat(insight),
            kpis=[str(item.get("indicador") or "") for item in kpis_relevantes],
        )


def _stock_alert_payload(item: EstoqueLojaIndicador) -> dict[str, Any]:
    return {
        "codigo_loja": item.codigo_loja,
        "nome_loja": item.nome_loja,
        "uf": item.uf,
        "estoque_atual": item.estoque_atual,
        "estoque_minimo": item.estoque_minimo,
        "estoque_recomendado": item.estoque_recomendado,
        "gap_para_minimo": item.gap_para_minimo,
        "gap_para_recomendado": item.gap_para_recomendado,
        "status_estoque": item.status_estoque,
    }


def _stock_from_row(row: Mapping[str, Any]) -> EstoqueLojaIndicador:
    atual = _to_int(row.get("quantidade_atual"))
    minimo = _to_int(row.get("quantidade_minima"))
    recomendado = _to_int(row.get("quantidade_recomendada"))
    return EstoqueLojaIndicador(
        codigo_loja=str(row.get("cod_loja") or ""),
        nome_loja=str(row.get("nome_loja") or ""),
        uf=_optional_str(row.get("uf")),
        estoque_atual=atual,
        estoque_minimo=minimo,
        estoque_recomendado=recomendado,
        gap_para_minimo=atual - minimo,
        gap_para_recomendado=atual - recomendado,
        status_estoque=str(row.get("status_estoque") or "INDEFINIDO"),
        prioridade_ordem=_to_int(row.get("prioridade_ordem")),
    )


def _kpis_from_summary(summary: Mapping[str, Any]) -> list[KpiValue]:
    total_enviado = _to_int(summary.get("total_enviado"))
    total_recebido = _to_int(summary.get("total_recebido"))
    total_envios = _to_int(summary.get("total_envios"))
    total_recebimentos = _to_int(summary.get("total_recebimentos"))
    total_manutencoes = _to_int(summary.get("total_manutencoes"))
    recebimentos_divergentes = _to_int(summary.get("recebimentos_divergentes"))
    estoque_status = summary.get("estoque_status")
    status_counts: Mapping[str, object] = (
        cast(Mapping[str, object], estoque_status) if isinstance(estoque_status, Mapping) else {}
    )

    taxa_recebimento = round((total_recebido / total_enviado) * 100, 2) if total_enviado else 0
    taxa_manutencao = round((total_manutencoes / total_envios) * 100, 2) if total_envios else 0
    taxa_divergencia = round((recebimentos_divergentes / total_recebimentos) * 100, 2) if total_recebimentos else 0

    return [
        _kpi("Total de lojas", _to_int(summary.get("total_lojas")), "lojas", "lojas"),
        _kpi("Lojas sem estoque cadastrado", _to_int(summary.get("lojas_sem_estoque")), "lojas", "lojas + estoque_lojas"),
        _kpi("Lojas criticas", _to_int(status_counts.get("CRITICO")), "lojas", "vw_estoque_alertas"),
        _kpi("Lojas em alerta", _to_int(status_counts.get("ALERTA")) + _to_int(status_counts.get("BAIXO")), "lojas", "vw_estoque_alertas"),
        _kpi("Total enviado", total_enviado, "taloes", "envios_taloes"),
        _kpi("Total recebido", total_recebido, "taloes", "recebimentos_taloes"),
        _kpi("Quantidade pendente", _to_int(summary.get("quantidade_pendente")), "taloes", "envios_taloes + recebimentos_taloes"),
        _kpi("Taxa de recebimento", taxa_recebimento, "%", "envios + recebimentos"),
        _kpi("Tempo medio de recebimento", summary.get("tempo_medio_recebimento"), "dias", "envios + recebimentos"),
        _kpi("Taxa de manutencao", taxa_manutencao, "%", "manutencoes + envios"),
        _kpi("Taxa de divergencia", taxa_divergencia, "%", "recebimentos_taloes"),
        _kpi("Anomalias abertas", _to_int(summary.get("anomalias_abertas")), "anomalias", "anomalias_recebimento"),
    ]


def _kpi(indicador: str, valor: float | int | str | None, unidade: str, fonte: str) -> KpiValue:
    return KpiValue(indicador=indicador, valor=valor, unidade=unidade, fonte=fonte)


def _resolve_period(request: PeriodoAnaliseRequest) -> tuple[date, date]:
    end = request.periodo_fim or date.today()
    start = request.periodo_inicio or (end - timedelta(days=30))
    return start, end


def _resolve_chat_period(request: ChatPerguntaRequest) -> tuple[date, date]:
    if request.periodo_inicio or request.periodo_fim:
        end = request.periodo_fim or date.today()
        start = request.periodo_inicio or (end - timedelta(days=30))
        return start, end

    today = date.today()
    text = _normalize(request.pergunta)
    if "hoje" in text:
        return today, today
    if "semana" in text:
        return today - timedelta(days=today.weekday()), today
    if "mes" in text or "mensal" in text:
        return today.replace(day=1), today
    return today - timedelta(days=30), today


def _detect_intent(pergunta: str) -> str:
    text = _normalize(pergunta)
    conversational_intent = _detect_conversational_intent(text)
    if conversational_intent is not None:
        return "conversa_livre"
    if _asks_analytical_insight(text):
        return "insight_analitico"
    if _asks_stock_red_status(text):
        return "estoque_vermelho"
    if _asks_stock_green_status(text):
        return "estoque_verde"
    if _asks_stores_by_uf(text):
        return "lojas_por_uf"
    if _asks_received_month(text):
        return "taloes_entregues_mes"
    if _asks_average_shipments(text):
        return "media_envios_loja_periodo" if _extract_date_range(text) != (None, None) or "entre" in text else "media_envios_loja"
    if _asks_last_shipments(text):
        return "ultimas_remessas_loja"
    if _asks_shipments_on_date(text):
        return "remessas_data"
    role = _extract_role(text)
    if role is not None:
        return "role_loja" if "loja" in text else "role_total"
    if _asks_total_employees(text):
        return "funcionarios_total"
    if _asks_total_stores(text):
        return "total_lojas"
    if "funcionario" in text or "funcionarios" in text or "colaborador" in text or "colaboradores" in text:
        return "funcionarios_loja"
    if "previsao" in text and "reposicao" in text:
        return "reposicao_loja"
    if "reposicao" in text and ("codigo" in text or "cod" in text or _contains_store_like_code(text)):
        return "reposicao_loja"
    if "estoque atual" in text or ("estoque" in text and ("codigo" in text or "cod" in text or _contains_store_like_code(text))):
        return "estoque_loja"
    if "divergencia" in text or "anomalia" in text or "manutencao" in text:
        return "divergencias"
    if "estoque" in text or "minimo" in text or "reposicao" in text or "loja" in text:
        return "estoque_alertas"
    if "enviado" in text or "envio" in text or "taloes enviados" in text:
        return "envios"
    if "recebido" in text or "recebimento" in text or "pendente" in text:
        return "recebimentos"
    if not _has_business_context(text):
        return "conversa_livre"
    return "resumo"


def _detect_conversational_intent(text: str) -> str | None:
    clean = re.sub(r"[^a-z0-9\s]", " ", text)
    words = set(clean.split())
    if not words:
        return None

    if _has_business_context(clean):
        return None

    greetings = [
        "bom dia",
        "boa tarde",
        "boa noite",
        "ola",
        "oi",
        "e ai",
        "tudo bem",
        "como vai",
    ]
    thanks = ["obrigado", "obrigada", "valeu", "agradecido", "agradecida"]
    farewells = ["tchau", "ate mais", "ate logo", "falou", "encerrar"]
    help_terms = ["ajuda", "ajudar", "o que voce faz", "como usar", "o que posso perguntar"]

    if any(term in clean for term in greetings):
        return "saudacao"
    if any(term in clean for term in thanks):
        return "agradecimento"
    if any(term in clean for term in farewells):
        return "despedida"
    if any(term in clean for term in help_terms):
        return "ajuda"
    return None


def _has_business_context(text: str) -> bool:
    return any(
        term in text
        for term in [
            "estoque",
            "loja",
            "lojas",
            "talao",
            "taloes",
            "envio",
            "enviado",
            "remessa",
            "remessas",
            "recebimento",
            "recebido",
            "entregue",
            "reposicao",
            "funcionario",
            "funcionarios",
            "lojista",
            "lojistas",
            "gestor",
            "gestores",
            "administrador",
            "administradores",
            "anomalia",
            "divergencia",
            "relatorio",
            "kpi",
            "indicador",
        ]
    )


def _asks_analytical_insight(text: str) -> bool:
    analytical_terms = [
        "analise",
        "analisar",
        "explique",
        "explica",
        "insight",
        "priorizar",
        "prioridade",
        "recomenda",
        "recomendacao",
        "decisao",
        "situacao geral",
        "resumo executivo",
    ]
    return any(term in text for term in analytical_terms)


def _asks_total_stores(text: str) -> bool:
    return (
        "quantas lojas" in text
        or "total de lojas" in text
        or "lojas temos" in text
        or "lojas cadastradas" in text
        or "numero de lojas" in text
    )


def _asks_stock_red_status(text: str) -> bool:
    return ("vermelho" in text or "negativo" in text) and ("estoque" in text or "estado" in text or "lojas" in text)


def _asks_stock_green_status(text: str) -> bool:
    return ("verde" in text or "positivo" in text) and ("estoque" in text or "estado" in text or "lojas" in text)


def _asks_stores_by_uf(text: str) -> bool:
    if "loja" not in text and "lojas" not in text:
        return False
    if "estado" in text or "uf" in text:
        return _extract_uf(text) is not None
    return False


def _asks_received_month(text: str) -> bool:
    if "mes" not in text and _extract_month_year(text) is None:
        return False
    return "recebido" in text or "recebimento" in text or "entregue" in text


def _asks_average_shipments(text: str) -> bool:
    return (
        "media" in text
        and ("talao" in text or "taloes" in text)
        and ("enviado" in text or "envio" in text)
        and "loja" in text
    )


def _asks_last_shipments(text: str) -> bool:
    return (
        ("ultima" in text or "ultimas" in text or "recentes" in text)
        and ("remessa" in text or "remessas" in text or "envio" in text or "envios" in text)
        and "loja" in text
    )


def _asks_shipments_on_date(text: str) -> bool:
    return (
        ("remessa" in text or "remessas" in text or "envio" in text or "envios" in text)
        and ("data" in text or _extract_date(text) is not None)
    )


def _asks_total_employees(text: str) -> bool:
    if "loja" in text:
        return False
    return (
        "funcionarios cadastrados" in text
        or "funcionarios ativos" in text
        or "total de funcionarios" in text
        or "quantos funcionarios temos" in text
    )


def _contains_store_like_code(text: str) -> bool:
    return bool(re.search(r"\b[a-z]{1,6}[-_]?\d{1,6}\b|\b\d{2,8}\b", text))


def _extract_store_identifier(pergunta: str, estoque: list[EstoqueLojaIndicador]) -> str | None:
    normalized_question = _normalize(pergunta)
    for item in estoque:
        normalized_code = _normalize(item.codigo_loja)
        if normalized_code and re.search(rf"\b{re.escape(normalized_code)}\b", normalized_question):
            return item.codigo_loja

    for item in sorted(estoque, key=lambda row: len(_normalize(row.nome_loja)), reverse=True):
        normalized_name = _normalize(item.nome_loja)
        if normalized_name and normalized_name in normalized_question:
            return item.codigo_loja

    match = re.search(
        r"(?:codigo|cod|loja)\s*(?:da\s+loja|loja|no\.?|numero)?\s*[:#-]?\s*([a-z0-9][a-z0-9_-]{1,20})",
        normalized_question,
    )
    if match:
        candidate = _clean_store_candidate(match.group(1))
        return candidate.upper() if _contains_store_like_code(candidate) else candidate

    loose = re.search(r"\b([a-z]{1,6}[-_]?\d{1,6}|\d{2,8})\b", normalized_question)
    if loose:
        return loose.group(1).upper()

    name_match = re.search(
        r"\bloja\s+(.+?)(?:\s+entre\b|\s+no\s+periodo\b|\s+na\s+data\b|\s+em\s+\d|\?|$)",
        normalized_question,
    )
    if name_match:
        candidate = _clean_store_candidate(name_match.group(1))
        return candidate or None

    return None


def _clean_store_candidate(value: str) -> str:
    candidate = re.sub(r"^(com\s+codigo|codigo|cod|numero|n)\s+", "", value.strip())
    candidate = re.split(
        r"\s+(?:entre|no\s+periodo|na\s+data|em\s+\d{1,2}[/-]|do\s+dia|ate|a\s+\d{1,2}[/-])\b",
        candidate,
        maxsplit=1,
    )[0]
    return candidate.strip(" .,:;#-")


def _answer_current_stock(store: Mapping[str, Any]) -> str:
    codigo = str(store.get("codigo_loja") or "")
    nome = str(store.get("nome_da_loja") or codigo)
    uf = _optional_str(store.get("uf")) or "-"
    atual = _to_int(store.get("quantidade_atual"))
    minimo = _to_int(store.get("quantidade_minima"))
    recomendado = _to_int(store.get("quantidade_recomendada"))
    status = "abaixo do minimo" if atual < minimo else "dentro do minimo"
    return (
        f"A loja {codigo} - {nome} ({uf}) esta com estoque atual de {atual} taloes. "
        f"O minimo cadastrado e {minimo} e o recomendado e {recomendado}; portanto ela esta {status}."
    )


def _answer_store_employees(store: Mapping[str, Any], role_counts: list[Mapping[str, Any]]) -> str:
    codigo = str(store.get("codigo_loja") or "")
    nome = str(store.get("nome_da_loja") or codigo)
    total = _to_int(store.get("total_funcionarios"))
    return (
        f"A loja {codigo} - {nome} possui {total} funcionario(s) ativo(s) vinculado(s) no sistema: "
        f"{_format_role_breakdown(role_counts)}."
    )


def _answer_stock_status_group(estoque: list[EstoqueLojaIndicador], group: str) -> str:
    counts = _stock_status_counts(estoque)
    if group == "vermelho":
        critico = counts.get("CRITICO", 0)
        alerta = counts.get("ALERTA", 0) + counts.get("BAIXO", 0)
        total = critico + alerta
        return (
            f"Temos {total} loja(s) em estoque vermelho/negativo: "
            f"{critico} critica(s) e {alerta} em alerta/baixo."
        )

    na_media = counts.get("NA_MEDIA", 0)
    cheio = counts.get("CHEIO", 0)
    total = na_media + cheio
    return f"Temos {total} loja(s) em estoque verde/positivo: {na_media} na media e {cheio} cheia(s)."


def _answer_average_shipments(
    store: Mapping[str, Any],
    data: Mapping[str, Any] | None,
    periodo_inicio: date | None,
    periodo_fim: date | None,
) -> str:
    if data is None:
        return f"Nao encontrei remessas cadastradas para a loja {_store_label(store)}."
    total_remessas = _to_int(data.get("total_remessas"))
    media = _to_float(data.get("media_taloes")) or 0
    total_taloes = _to_int(data.get("total_taloes"))
    periodo = _format_period(periodo_inicio, periodo_fim) if periodo_inicio or periodo_fim else "historico disponivel"
    if total_remessas == 0:
        return f"A loja {_store_label(store)} nao possui remessas registradas no periodo {periodo}."
    return (
        f"A media de taloes enviados para a loja {_store_label(store)} no periodo {periodo} "
        f"e de {_format_number(media)} talao(oes) por remessa. Foram {total_remessas} remessa(s), "
        f"somando {total_taloes} talao(oes)."
    )


def _answer_last_shipments(store: Mapping[str, Any], rows: list[Mapping[str, Any]]) -> str:
    if not rows:
        return f"Nao encontrei remessas registradas para a loja {_store_label(store)}."
    parts: list[str] = []
    for row in rows[:7]:
        codigo = str(row.get("codigo_envio") or "-")
        quantidade = _to_int(row.get("quantidade_enviada"))
        data_envio = _format_datetime(row.get("data_hora_envio"))
        status = str(row.get("status") or "-")
        parts.append(f"{codigo} em {data_envio}, {quantidade} talao(oes), status {status}")
    return f"As ultimas {len(parts)} remessa(s) da loja {_store_label(store)} foram: " + "; ".join(parts) + "."


def _answer_replenishment_forecast(store: Mapping[str, Any]) -> str:
    codigo = str(store.get("codigo_loja") or "")
    nome = str(store.get("nome_da_loja") or codigo)
    atual = _to_int(store.get("quantidade_atual"))
    minimo = _to_int(store.get("quantidade_minima"))
    recomendado = _to_int(store.get("quantidade_recomendada"))
    reposicao = max(recomendado - atual, 0)
    if reposicao == 0:
        return (
            f"A loja {codigo} - {nome} nao precisa de reposicao agora. "
            f"O estoque atual e {atual}, acima ou igual ao recomendado de {recomendado}."
        )
    prioridade = "alta" if atual < minimo else "preventiva"
    return (
        f"A previsao de reposicao para a loja {codigo} - {nome} e de {reposicao} taloes "
        f"para voltar ao recomendado de {recomendado}. O estoque atual e {atual}, "
        f"o minimo e {minimo}, entao a prioridade e {prioridade}."
    )


def _answer_stock_alerts(estoque: list[EstoqueLojaIndicador]) -> str:
    abaixo = sorted(
        [item for item in estoque if item.estoque_atual < item.estoque_minimo],
        key=lambda item: (item.prioridade_ordem, item.gap_para_minimo),
    )
    if not abaixo:
        return "Nenhuma loja esta abaixo do estoque minimo no momento."

    top = abaixo[:10]
    nomes = ", ".join(
        f"{item.nome_loja} ({item.uf or '-'}) com {item.estoque_atual}/{item.estoque_minimo}"
        for item in top
    )
    complemento = "" if len(abaixo) <= len(top) else f" Outras {len(abaixo) - len(top)} loja(s) tambem exigem acompanhamento."
    return f"{len(abaixo)} loja(s) estao abaixo do estoque minimo: {nomes}.{complemento}"


def _answer_general_summary(resumo: AnalyticsResumo, kpis: Mapping[str, KpiValue]) -> str:
    total_lojas = _kpi_value(kpis, "total de lojas")
    criticas = _kpi_value(kpis, "lojas criticas")
    alertas = _kpi_value(kpis, "lojas em alerta")
    total_enviado = _kpi_value(kpis, "total enviado")
    total_recebido = _kpi_value(kpis, "total recebido")
    pendente = _kpi_value(kpis, "quantidade pendente")
    anomalias = _kpi_value(kpis, "anomalias abertas")
    return (
        f"Resumo do periodo {_format_period(resumo.periodo_inicio, resumo.periodo_fim)}: "
        f"{_format_number(total_lojas)} loja(s) analisada(s), "
        f"{_format_number(criticas)} critica(s) e {_format_number(alertas)} em alerta. "
        f"Foram enviados {_format_number(total_enviado)} taloes, recebidos {_format_number(total_recebido)} "
        f"e ha {_format_number(pendente)} taloes pendentes. "
        f"O sistema aponta {_format_number(anomalias)} anomalia(s) aberta(s)."
    )


def _stock_status_counts(estoque: list[EstoqueLojaIndicador]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for item in estoque:
        status = item.status_estoque.upper()
        counts[status] = counts.get(status, 0) + 1
    return counts


def _role_count(rows: list[Mapping[str, Any]], role: str) -> int:
    normalized_role = _normalize(role)
    return sum(
        _to_int(row.get("total"))
        for row in rows
        if _normalize(str(row.get("cargo") or "")) == normalized_role
    )


def _format_role_breakdown(rows: list[Mapping[str, Any]]) -> str:
    if not rows:
        return "sem funcionarios ativos por cargo"
    ordered_roles = ["gestor", "administrador", "lojista"]
    pieces: list[str] = []
    for role in ordered_roles:
        total = _role_count(rows, role)
        if total:
            pieces.append(f"{total} {_role_label(role, plural=total != 1)}")
    other_total = sum(
        _to_int(row.get("total"))
        for row in rows
        if _normalize(str(row.get("cargo") or "")) not in set(ordered_roles)
    )
    if other_total:
        pieces.append(f"{other_total} outro(s) cargo(s)")
    return ", ".join(pieces) if pieces else "sem funcionarios ativos por cargo"


def _role_label(role: str, *, plural: bool) -> str:
    normalized_role = _normalize(role)
    labels = {
        "lojista": ("lojista", "lojistas"),
        "gestor": ("gestor", "gestores"),
        "administrador": ("administrador", "administradores"),
    }
    singular, plural_label = labels.get(normalized_role, (normalized_role, f"{normalized_role}s"))
    return plural_label if plural else singular


def _store_label(store: Mapping[str, Any]) -> str:
    codigo = str(store.get("codigo_loja") or store.get("cod_loja") or "")
    nome = str(store.get("nome_da_loja") or store.get("nome_loja") or codigo)
    return f"{codigo} - {nome}" if codigo and nome and codigo != nome else nome or codigo


def _conversation_fallback() -> str:
    return (
        "No momento nao consigo responder conversa livre pela IA. "
        "Posso te ajudar com indicadores objetivos de lojas, estoque, funcionarios, envios, recebimentos e remessas."
    )


def _format_insight_for_chat(response: InsightResponse) -> str:
    partes = [
        response.insight.resumo.strip(),
        response.insight.recomendacao.strip(),
    ]
    pontos = [item.strip() for item in response.insight.pontos_atencao[:2] if item.strip()]
    if pontos:
        partes.append("Pontos de atencao: " + "; ".join(pontos) + ".")
    return " ".join(parte for parte in partes if parte)


def _chat_response(
    *,
    pergunta: str,
    periodo_inicio: date,
    periodo_fim: date,
    resposta: str,
    kpis: list[str],
) -> ChatPerguntaResponse:
    return ChatPerguntaResponse(
        resposta=resposta,
        intencao=pergunta,
        periodo_inicio=periodo_inicio,
        periodo_fim=periodo_fim,
        kpis_considerados=kpis,
    )


def _kpi_value(kpis: Mapping[str, KpiValue], indicador: str) -> float | int | str | None:
    kpi = kpis.get(_normalize(indicador))
    return kpi.valor if kpi else 0


def _extract_role(text: str) -> str | None:
    normalized = _normalize(text)
    if "administrador" in normalized or "administradores" in normalized:
        return "administrador"
    if "gestor" in normalized or "gestores" in normalized:
        return "gestor"
    if "lojista" in normalized or "lojistas" in normalized:
        return "lojista"
    return None


def _extract_uf(text: str) -> str | None:
    normalized = _normalize(text)
    for state_name, uf in sorted(_STATE_TO_UF.items(), key=lambda item: len(item[0]), reverse=True):
        if state_name in normalized:
            return uf
    match = re.search(r"\b(?:estado|uf)\s+(?:de|do|da)?\s*([a-z]{2})\b", normalized)
    if match:
        uf = match.group(1).upper()
        if uf in _UF_TO_STATE:
            return uf
    return None


def _extract_month_year(text: str) -> tuple[int, int] | None:
    normalized = _normalize(text)
    numeric = re.search(r"\b(0?[1-9]|1[0-2])[/.-](20\d{2})\b", normalized)
    if numeric:
        return int(numeric.group(1)), int(numeric.group(2))

    year_match = re.search(r"\b(20\d{2})\b", normalized)
    year = int(year_match.group(1)) if year_match else date.today().year
    for month_name, month in _MONTHS.items():
        if re.search(rf"\b{re.escape(month_name)}\b", normalized):
            return month, year
    return None


def _extract_date_range(text: str) -> tuple[date | None, date | None]:
    dates = _extract_all_dates(text)
    if len(dates) >= 2:
        return dates[0], dates[1]
    return None, None


def _extract_date(text: str) -> date | None:
    dates = _extract_all_dates(text)
    return dates[0] if dates else None


def _extract_all_dates(text: str) -> list[date]:
    normalized = _normalize(text)
    parsed: list[date] = []
    for match in re.finditer(r"\b(20\d{2})-(0?[1-9]|1[0-2])-(0?[1-9]|[12]\d|3[01])\b", normalized):
        parsed_date = _safe_date(int(match.group(1)), int(match.group(2)), int(match.group(3)))
        if parsed_date is not None:
            parsed.append(parsed_date)
    for match in re.finditer(r"\b(0?[1-9]|[12]\d|3[01])[/.-](0?[1-9]|1[0-2])(?:[/.-](20\d{2}))?\b", normalized):
        year = int(match.group(3)) if match.group(3) else date.today().year
        parsed_date = _safe_date(year, int(match.group(2)), int(match.group(1)))
        if parsed_date is not None:
            parsed.append(parsed_date)
    unique: list[date] = []
    for item in parsed:
        if item not in unique:
            unique.append(item)
    return unique


def _safe_date(year: int, month: int, day: int) -> date | None:
    try:
        return date(year, month, day)
    except ValueError:
        return None


def _format_period(periodo_inicio: date | None, periodo_fim: date | None) -> str:
    if periodo_inicio and periodo_fim:
        return f"{periodo_inicio.isoformat()} a {periodo_fim.isoformat()}"
    if periodo_inicio:
        return f"a partir de {periodo_inicio.isoformat()}"
    if periodo_fim:
        return f"ate {periodo_fim.isoformat()}"
    return "analisado"


def _format_number(value: object) -> str:
    if isinstance(value, float):
        return f"{value:.2f}".rstrip("0").rstrip(".")
    return str(value if value is not None else 0)


def _format_datetime(value: object) -> str:
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d %H:%M")
    if isinstance(value, date):
        return value.isoformat()
    return str(value or "-")


def _state_label(uf: str) -> str:
    state = _UF_TO_STATE.get(uf.upper())
    return f"{state} ({uf.upper()})" if state else uf.upper()


def _month_label(month: int) -> str:
    return _MONTH_LABELS.get(month, str(month))


def _normalize(value: str) -> str:
    normalized = unicodedata.normalize("NFD", value.strip().lower())
    return "".join(char for char in normalized if unicodedata.category(char) != "Mn")


def _to_int(value: object) -> int:
    if value is None:
        return 0
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    if isinstance(value, (float, Decimal)):
        return int(value)
    try:
        return int(str(value).strip() or "0")
    except (TypeError, ValueError):
        return 0


def _to_float(value: object) -> float | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return float(value)
    if isinstance(value, (int, float, Decimal)):
        return float(value)
    try:
        return float(str(value).strip())
    except (TypeError, ValueError):
        return None


def _optional_str(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None
