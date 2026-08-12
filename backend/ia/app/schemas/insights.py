from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class CalculoNodeRequest(BaseModel):
    indicador: str = Field(min_length=2, max_length=120)
    periodo_inicio: date
    periodo_fim: date
    origem: Literal["node", "analytics", "manual"] = "node"
    usuario_solicitante: str | None = Field(default=None, max_length=120)
    filtros: dict[str, Any] = Field(default_factory=dict)
    calculos: dict[str, Any] = Field(default_factory=dict)
    observacoes: str | None = Field(default=None, max_length=1000)
    forcar_nova_analise: bool = False


class InsightGerado(BaseModel):
    titulo: str
    resumo: str
    recomendacao: str
    dados_origem: list[str] = Field(default_factory=list)
    periodo_analisado: str
    nivel_confianca: Literal["baixo", "medio", "alto"]
    pontos_atencao: list[str] = Field(default_factory=list)


class UsoTokens(BaseModel):
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    total_tokens: int | None = None


class InsightResponse(BaseModel):
    cache_hit: bool
    calculo_hash: str
    indicador: str
    insight: InsightGerado
    model_requested: str | None = None
    model_returned: str | None = None
    usage: UsoTokens = Field(default_factory=UsoTokens)
    criado_em: datetime | None = None

