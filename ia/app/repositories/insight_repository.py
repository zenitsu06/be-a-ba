from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Mapping, Protocol, cast

from psycopg.rows import dict_row

from app.core.database import get_ia_pool
from app.schemas.insights import InsightGerado, UsoTokens


class StoredInsight(dict[str, Any]):
    pass


class InsightRepository(Protocol):
    def find_by_hash(self, calculo_hash: str) -> StoredInsight | None:
        ...

    def save(
        self,
        *,
        calculo_hash: str,
        indicador: str,
        periodo_inicio: str,
        periodo_fim: str,
        origem: str,
        filtros: dict[str, Any],
        calculos: dict[str, Any],
        insight: InsightGerado,
        model_requested: str | None,
        model_returned: str | None,
        usage: UsoTokens,
    ) -> StoredInsight:
        ...


class InMemoryInsightRepository:
    def __init__(self) -> None:
        self._items: dict[str, StoredInsight] = {}

    def find_by_hash(self, calculo_hash: str) -> StoredInsight | None:
        item = self._items.get(calculo_hash)
        if item is not None:
            item["acessos"] = int(item.get("acessos", 0)) + 1
            item["ultimo_acesso_em"] = datetime.now(timezone.utc)
        return item

    def save(
        self,
        *,
        calculo_hash: str,
        indicador: str,
        periodo_inicio: str,
        periodo_fim: str,
        origem: str,
        filtros: dict[str, Any],
        calculos: dict[str, Any],
        insight: InsightGerado,
        model_requested: str | None,
        model_returned: str | None,
        usage: UsoTokens,
    ) -> StoredInsight:
        item = StoredInsight(
            calculo_hash=calculo_hash,
            indicador=indicador,
            periodo_inicio=periodo_inicio,
            periodo_fim=periodo_fim,
            origem=origem,
            filtros=filtros,
            calculos=calculos,
            insight=insight.model_dump(),
            model_requested=model_requested,
            model_returned=model_returned,
            usage=usage.model_dump(),
            criado_em=datetime.now(timezone.utc),
            acessos=0,
        )
        self._items[calculo_hash] = item
        return item


class PostgresInsightRepository:
    def find_by_hash(self, calculo_hash: str) -> StoredInsight | None:
        pool = get_ia_pool()
        if pool is None:
            return None
        with pool.connection() as conn:
            with conn.cursor(row_factory=dict_row) as cur:
                cur.execute(
                    """
                    UPDATE ia.insights_historico
                       SET acessos = acessos + 1,
                           ultimo_acesso_em = NOW()
                     WHERE calculo_hash = %s
                     RETURNING calculo_hash, indicador, periodo_inicio, periodo_fim,
                               insight_json AS insight, modelo_solicitado AS model_requested,
                               modelo_retornado AS model_returned,
                               prompt_tokens, completion_tokens, total_tokens, criado_em
                    """,
                    (calculo_hash,),
                )
                row = cur.fetchone()
                if row is None:
                    return None
                return _row_to_stored_insight(cast(Mapping[str, Any], row))

    def save(
        self,
        *,
        calculo_hash: str,
        indicador: str,
        periodo_inicio: str,
        periodo_fim: str,
        origem: str,
        filtros: dict[str, Any],
        calculos: dict[str, Any],
        insight: InsightGerado,
        model_requested: str | None,
        model_returned: str | None,
        usage: UsoTokens,
    ) -> StoredInsight:
        pool = get_ia_pool()
        if pool is None:
            raise RuntimeError("IA_DATABASE_DSN nao foi configurado.")
        with pool.connection() as conn:
            with conn.cursor(row_factory=dict_row) as cur:
                cur.execute(
                    """
                    INSERT INTO ia.calculos_analytics (
                        calculo_hash, indicador, periodo_inicio, periodo_fim,
                        origem, filtros, calculos
                    )
                    VALUES (%s, %s, %s, %s, %s, %s::jsonb, %s::jsonb)
                    ON CONFLICT (calculo_hash) DO NOTHING
                    """,
                    (
                        calculo_hash,
                        indicador,
                        periodo_inicio,
                        periodo_fim,
                        origem,
                        _json(filtros),
                        _json(calculos),
                    ),
                )
                cur.execute(
                    """
                    INSERT INTO ia.insights_historico (
                        calculo_hash, indicador, periodo_inicio, periodo_fim,
                        insight_json, modelo_solicitado, modelo_retornado,
                        prompt_tokens, completion_tokens, total_tokens
                    )
                    VALUES (%s, %s, %s, %s, %s::jsonb, %s, %s, %s, %s, %s)
                    ON CONFLICT (calculo_hash) DO UPDATE SET
                        insight_json = EXCLUDED.insight_json,
                        modelo_solicitado = EXCLUDED.modelo_solicitado,
                        modelo_retornado = EXCLUDED.modelo_retornado,
                        prompt_tokens = EXCLUDED.prompt_tokens,
                        completion_tokens = EXCLUDED.completion_tokens,
                        total_tokens = EXCLUDED.total_tokens,
                        atualizado_em = NOW()
                    RETURNING calculo_hash, indicador, periodo_inicio, periodo_fim,
                              insight_json AS insight, modelo_solicitado AS model_requested,
                              modelo_retornado AS model_returned,
                              prompt_tokens, completion_tokens, total_tokens, criado_em
                    """,
                    (
                        calculo_hash,
                        indicador,
                        periodo_inicio,
                        periodo_fim,
                        insight.model_dump_json(),
                        model_requested,
                        model_returned,
                        usage.prompt_tokens,
                        usage.completion_tokens,
                        usage.total_tokens,
                    ),
                )
                row = cur.fetchone()
                if row is None:
                    raise RuntimeError("Insight salvo, mas nenhuma linha foi retornada pelo PostgreSQL.")
                return _row_to_stored_insight(cast(Mapping[str, Any], row))


_memory_repository = InMemoryInsightRepository()


def get_insight_repository() -> InsightRepository:
    if get_ia_pool() is None:
        return _memory_repository
    return PostgresInsightRepository()


def _row_to_stored_insight(row: Mapping[str, Any]) -> StoredInsight:
    usage = {
        "prompt_tokens": row.get("prompt_tokens"),
        "completion_tokens": row.get("completion_tokens"),
        "total_tokens": row.get("total_tokens"),
    }
    return StoredInsight(
        calculo_hash=row["calculo_hash"],
        indicador=row["indicador"],
        periodo_inicio=str(row["periodo_inicio"]),
        periodo_fim=str(row["periodo_fim"]),
        insight=row["insight"],
        model_requested=row.get("model_requested"),
        model_returned=row.get("model_returned"),
        usage=usage,
        criado_em=row.get("criado_em"),
    )


def _json(value: dict[str, Any]) -> str:
    import json

    return json.dumps(value, ensure_ascii=False, sort_keys=True)
