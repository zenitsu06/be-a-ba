from __future__ import annotations

import re
import unicodedata
from datetime import date, timedelta
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


class AnalyticsDataSource(Protocol):
    def fetch_stock_rows(self) -> list[Mapping[str, Any]]:
        ...

    def fetch_store_detail(self, cod_loja: str) -> Mapping[str, Any] | None:
        ...

    def fetch_summary(self, periodo_inicio: date | None, periodo_fim: date | None) -> dict[str, Any]:
        ...


class InsightAnalyzer(Protocol):
    def analisar_calculos(self, request: CalculoNodeRequest) -> InsightResponse:
        ...


class AnalyticsService:
    def __init__(
        self,
        *,
        analytics_repository: AnalyticsDataSource,
        insight_service: InsightAnalyzer,
    ) -> None:
        self.analytics_repository = analytics_repository
        self.insight_service = insight_service

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
        resumo = self.resumo_operacional(periodo_inicio=periodo_inicio, periodo_fim=periodo_fim)
        kpis = {_normalize(item.indicador): item for item in resumo.kpis}
        intencao = _detect_intent(pergunta)

        if intencao == "insight_analitico":
            return self._responder_insight_analitico(
                pergunta=pergunta,
                periodo_inicio=periodo_inicio,
                periodo_fim=periodo_fim,
                resumo=resumo,
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

        if intencao in {"estoque_loja", "funcionarios_loja", "reposicao_loja"}:
            cod_loja = _extract_store_code(pergunta, resumo.estoque_lojas)
            if cod_loja is None:
                return _chat_response(
                    pergunta=intencao,
                    periodo_inicio=periodo_inicio,
                    periodo_fim=periodo_fim,
                    resposta="Informe o codigo da loja para eu consultar esse indicador. Exemplo: estoque atual da loja 1.",
                    kpis=[],
                )

            detalhe = self.analytics_repository.fetch_store_detail(cod_loja)
            if detalhe is None:
                return _chat_response(
                    pergunta=intencao,
                    periodo_inicio=periodo_inicio,
                    periodo_fim=periodo_fim,
                    resposta=f"Nao encontrei uma loja cadastrada com o codigo {cod_loja}.",
                    kpis=[],
                )

            if intencao == "estoque_loja":
                return _chat_response(
                    pergunta=intencao,
                    periodo_inicio=periodo_inicio,
                    periodo_fim=periodo_fim,
                    resposta=_answer_current_stock(detalhe),
                    kpis=["Estoque atual", "Estoque minimo", "Quantidade recomendada atual"],
                )

            if intencao == "funcionarios_loja":
                return _chat_response(
                    pergunta=intencao,
                    periodo_inicio=periodo_inicio,
                    periodo_fim=periodo_fim,
                    resposta=_answer_store_employees(detalhe),
                    kpis=["Funcionarios por loja"],
                )

            return _chat_response(
                pergunta=intencao,
                periodo_inicio=periodo_inicio,
                periodo_fim=periodo_fim,
                resposta=_answer_replenishment_forecast(detalhe),
                kpis=["Estoque atual", "Estoque recomendado", "Gap para recomendado"],
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
    if _asks_analytical_insight(text):
        return "insight_analitico"
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
    return "resumo"


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


def _contains_store_like_code(text: str) -> bool:
    return bool(re.search(r"\b[a-z]{1,6}[-_]?\d{1,6}\b|\b\d{2,8}\b", text))


def _extract_store_code(pergunta: str, estoque: list[EstoqueLojaIndicador]) -> str | None:
    normalized_question = _normalize(pergunta)
    for item in estoque:
        normalized_code = _normalize(item.codigo_loja)
        if normalized_code and re.search(rf"\b{re.escape(normalized_code)}\b", normalized_question):
            return item.codigo_loja

    match = re.search(
        r"(?:codigo|cod|loja)\s*(?:da\s+loja|loja|no\.?|numero)?\s*[:#-]?\s*([a-z0-9][a-z0-9_-]{1,20})",
        normalized_question,
    )
    if match:
        return match.group(1).upper()

    loose = re.search(r"\b([a-z]{1,6}[-_]?\d{1,6}|\d{2,8})\b", normalized_question)
    return loose.group(1).upper() if loose else None


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


def _answer_store_employees(store: Mapping[str, Any]) -> str:
    codigo = str(store.get("codigo_loja") or "")
    nome = str(store.get("nome_da_loja") or codigo)
    total = _to_int(store.get("total_funcionarios"))
    return f"A loja {codigo} - {nome} possui {total} funcionario(s) ativo(s) vinculado(s) no sistema."


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


def _optional_str(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None
