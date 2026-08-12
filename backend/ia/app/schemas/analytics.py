from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field


class PeriodoAnaliseRequest(BaseModel):
    periodo_inicio: date | None = None
    periodo_fim: date | None = None
    forcar_nova_analise: bool = False


class ChatPerguntaRequest(BaseModel):
    pergunta: str = Field(min_length=2, max_length=500)
    periodo_inicio: date | None = None
    periodo_fim: date | None = None


class KpiValue(BaseModel):
    indicador: str
    valor: float | int | str | None
    unidade: str
    fonte: str
    nivel: str = "1"


class EstoqueLojaIndicador(BaseModel):
    codigo_loja: str
    nome_loja: str
    uf: str | None = None
    estoque_atual: int
    estoque_minimo: int
    estoque_recomendado: int
    gap_para_minimo: int
    gap_para_recomendado: int
    status_estoque: str
    prioridade_ordem: int


class AnalyticsResumo(BaseModel):
    origem: Literal["postgres"]
    periodo_inicio: date | None = None
    periodo_fim: date | None = None
    gerado_em: datetime = Field(default_factory=datetime.now)
    kpis: list[KpiValue]
    estoque_lojas: list[EstoqueLojaIndicador]


class ChatPerguntaResponse(BaseModel):
    resposta: str
    fonte: Literal["camada_ia"] = "camada_ia"
    intencao: str
    periodo_inicio: date | None = None
    periodo_fim: date | None = None
    kpis_considerados: list[str] = Field(default_factory=list)
