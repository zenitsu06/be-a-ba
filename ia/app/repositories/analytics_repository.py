from __future__ import annotations

from datetime import date
from typing import Any, Mapping, Sequence, cast

from psycopg.rows import dict_row

from app.core.database import get_analytics_pool


class AnalyticsRepository:
    def database_available(self) -> bool:
        return get_analytics_pool() is not None

    def fetch_stock_rows(self) -> list[Mapping[str, Any]]:
        pool = get_analytics_pool()
        if pool is None:
            raise RuntimeError("POSTGRES_READONLY_DSN nao foi configurado.")

        with pool.connection() as conn:
            with conn.cursor(row_factory=dict_row) as cur:
                cur.execute(
                    """
                    SELECT cod_loja, nome_loja, uf, quantidade_atual,
                           quantidade_recomendada, quantidade_minima,
                           status_estoque, prioridade_ordem
                    FROM public.vw_estoque_alertas
                    ORDER BY prioridade_ordem, cod_loja
                    """
                )
                return _rows(cur.fetchall())

    def fetch_store_detail(self, cod_loja: str) -> Mapping[str, Any] | None:
        pool = get_analytics_pool()
        if pool is None:
            raise RuntimeError("POSTGRES_READONLY_DSN nao foi configurado.")

        with pool.connection() as conn:
            with conn.cursor(row_factory=dict_row) as cur:
                cur.execute(
                    """
                    SELECT l.codigo_loja,
                           l.nome_da_loja,
                           l.uf,
                           COALESCE(l.quantidade_atual, l."Quantidade atual", 0) AS quantidade_atual,
                           COALESCE(l.quantidade_minima, 0) AS quantidade_minima,
                           COALESCE(l.quantidade_recomendada, 0) AS quantidade_recomendada,
                           COALESCE(f.total_funcionarios, 0)::INT AS total_funcionarios
                    FROM public.vw_lojas_api l
                    LEFT JOIN (
                        SELECT cod_loja, COUNT(*) AS total_funcionarios
                        FROM public.usuarios
                        WHERE cod_loja IS NOT NULL
                          AND COALESCE(status, 'Ativo') <> 'Inativo'
                        GROUP BY cod_loja
                    ) f ON f.cod_loja = l.codigo_loja
                    WHERE UPPER(l.codigo_loja) = UPPER(%s)
                    """,
                    [cod_loja],
                )
                row = cur.fetchone()
                return cast(Mapping[str, Any], row) if isinstance(row, Mapping) else None

    def fetch_summary(self, periodo_inicio: date | None, periodo_fim: date | None) -> dict[str, Any]:
        pool = get_analytics_pool()
        if pool is None:
            raise RuntimeError("POSTGRES_READONLY_DSN nao foi configurado.")

        with pool.connection() as conn:
            with conn.cursor(row_factory=dict_row) as cur:
                total_lojas = _scalar_int(cur, "SELECT COUNT(*) FROM public.lojas")
                lojas_sem_estoque = _scalar_int(
                    cur,
                    """
                    SELECT COUNT(*)
                    FROM public.lojas l
                    LEFT JOIN public.estoque_lojas e ON e.cod_loja = l.cod_loja
                    WHERE e.cod_loja IS NULL
                    """,
                )
                estoque_status = _fetch_stock_status(cur)

                envios_where, envios_params = _period_where("data_hora_envio", periodo_inicio, periodo_fim)
                total_enviado = _scalar_int(
                    cur,
                    f"SELECT COALESCE(SUM(quantidade_enviada), 0) FROM public.envios_taloes {envios_where}",
                    envios_params,
                )
                total_envios = _scalar_int(
                    cur,
                    f"SELECT COUNT(*) FROM public.envios_taloes {envios_where}",
                    envios_params,
                )

                receb_where, receb_params = _period_where("data_hora_recebimento", periodo_inicio, periodo_fim)
                total_recebido = _scalar_int(
                    cur,
                    f"SELECT COALESCE(SUM(quantidade_recebida), 0) FROM public.recebimentos_taloes {receb_where}",
                    receb_params,
                )
                total_recebimentos = _scalar_int(
                    cur,
                    f"SELECT COUNT(*) FROM public.recebimentos_taloes {receb_where}",
                    receb_params,
                )
                recebimentos_divergentes = _scalar_int(
                    cur,
                    f"""
                    SELECT COUNT(*)
                    FROM public.recebimentos_taloes
                    {receb_where}
                    {"AND" if receb_where else "WHERE"} quantidade_divergencia > 0
                    """,
                    receb_params,
                )

                quantidade_pendente = _scalar_int(
                    cur,
                    f"""
                    SELECT GREATEST(
                        COALESCE(SUM(e.quantidade_enviada), 0) - COALESCE(SUM(r.total_recebido), 0),
                        0
                    )
                    FROM public.envios_taloes e
                    LEFT JOIN (
                        SELECT id_envio, SUM(quantidade_recebida) AS total_recebido
                        FROM public.recebimentos_taloes
                        GROUP BY id_envio
                    ) r ON r.id_envio = e.id_envio
                    {envios_where.replace("data_hora_envio", "e.data_hora_envio")}
                    """,
                    envios_params,
                )

                tempo_medio_recebimento = _scalar_float(
                    cur,
                    f"""
                    SELECT AVG(EXTRACT(EPOCH FROM (r.data_hora_recebimento - e.data_hora_envio)) / 86400.0)
                    FROM public.recebimentos_taloes r
                    JOIN public.envios_taloes e ON e.id_envio = r.id_envio
                    {receb_where.replace("data_hora_recebimento", "r.data_hora_recebimento")}
                    """,
                    receb_params,
                )

                manut_where, manut_params = _period_where("data_hora_manutencao", periodo_inicio, periodo_fim)
                total_manutencoes = _scalar_int(
                    cur,
                    f"SELECT COUNT(*) FROM public.manutencoes_taloes {manut_where}",
                    manut_params,
                )
                anomalias_abertas = _scalar_int(
                    cur,
                    "SELECT COUNT(*) FROM public.anomalias_recebimento WHERE status = 'aberta'",
                )

        return {
            "total_lojas": total_lojas,
            "lojas_sem_estoque": lojas_sem_estoque,
            "estoque_status": estoque_status,
            "total_enviado": total_enviado,
            "total_envios": total_envios,
            "total_recebido": total_recebido,
            "total_recebimentos": total_recebimentos,
            "quantidade_pendente": quantidade_pendente,
            "tempo_medio_recebimento": tempo_medio_recebimento,
            "total_manutencoes": total_manutencoes,
            "recebimentos_divergentes": recebimentos_divergentes,
            "anomalias_abertas": anomalias_abertas,
        }


def _period_where(column: str, start: date | None, end: date | None) -> tuple[str, list[object]]:
    clauses: list[str] = []
    params: list[object] = []
    if start is not None:
        clauses.append(f"{column} >= %s")
        params.append(start)
    if end is not None:
        clauses.append(f"{column} < (%s::date + INTERVAL '1 day')")
        params.append(end)
    if not clauses:
        return "", params
    return f"WHERE {' AND '.join(clauses)}", params


def _fetch_stock_status(cur: Any) -> dict[str, int]:
    cur.execute(
        """
        SELECT status_estoque, COUNT(*)::INT AS total
        FROM public.vw_estoque_alertas
        GROUP BY status_estoque
        """
    )
    rows = _rows(cur.fetchall())
    return {str(row.get("status_estoque") or "INDEFINIDO"): _to_int(row.get("total")) for row in rows}


def _scalar_int(cur: Any, sql: str, params: Sequence[object] | None = None) -> int:
    cur.execute(sql, list(params or []))
    return _to_int(_first_value(cur.fetchone()))


def _scalar_float(cur: Any, sql: str, params: Sequence[object] | None = None) -> float | None:
    cur.execute(sql, list(params or []))
    value = _first_value(cur.fetchone())
    if value is None:
        return None
    return round(float(value), 2)


def _first_value(row: object) -> object:
    if isinstance(row, Mapping):
        return next(iter(row.values()), None)
    if isinstance(row, Sequence) and not isinstance(row, str):
        return row[0] if row else None
    return None


def _rows(rows: object) -> list[Mapping[str, Any]]:
    if not isinstance(rows, Sequence):
        return []
    return [cast(Mapping[str, Any], row) for row in rows if isinstance(row, Mapping)]


def _to_int(value: object) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0
