from __future__ import annotations

from datetime import date
from decimal import Decimal
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

    def fetch_store_detail(self, store_identifier: str) -> Mapping[str, Any] | None:
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
                       OR LOWER(l.nome_da_loja) = LOWER(%s)
                       OR LOWER(l.nome_da_loja) LIKE LOWER(%s)
                    ORDER BY CASE
                        WHEN UPPER(l.codigo_loja) = UPPER(%s) THEN 0
                        WHEN LOWER(l.nome_da_loja) = LOWER(%s) THEN 1
                        ELSE 2
                    END,
                    l.codigo_loja
                    LIMIT 1
                    """,
                    [
                        store_identifier,
                        store_identifier,
                        f"%{store_identifier}%",
                        store_identifier,
                        store_identifier,
                    ],
                )
                row = cur.fetchone()
                return cast(Mapping[str, Any], row) if isinstance(row, Mapping) else None

    def fetch_store_counts_by_uf(self) -> dict[str, int]:
        pool = get_analytics_pool()
        if pool is None:
            raise RuntimeError("POSTGRES_READONLY_DSN nao foi configurado.")

        with pool.connection() as conn:
            with conn.cursor(row_factory=dict_row) as cur:
                cur.execute(
                    """
                    SELECT UPPER(COALESCE(uf, '')) AS uf, COUNT(*)::INT AS total
                    FROM public.lojas
                    GROUP BY UPPER(COALESCE(uf, ''))
                    """
                )
                rows = _rows(cur.fetchall())
                return {str(row.get("uf") or ""): _to_int(row.get("total")) for row in rows}

    def fetch_user_role_counts(self, store_identifier: str | None = None) -> list[Mapping[str, Any]]:
        pool = get_analytics_pool()
        if pool is None:
            raise RuntimeError("POSTGRES_READONLY_DSN nao foi configurado.")

        sql = """
            SELECT LOWER(COALESCE(u.cargo, 'sem_cargo')) AS cargo,
                   COUNT(*)::INT AS total
            FROM public.usuarios u
            LEFT JOIN public.lojas l ON l.cod_loja = u.cod_loja
            WHERE COALESCE(u.status, 'Ativo') <> 'Inativo'
        """
        params: list[object] = []
        if store_identifier:
            sql += """
              AND (
                  UPPER(u.cod_loja) = UPPER(%s)
                  OR LOWER(l.nome_loja) = LOWER(%s)
                  OR LOWER(l.nome_loja) LIKE LOWER(%s)
              )
            """
            params.extend([store_identifier, store_identifier, f"%{store_identifier}%"])
        sql += " GROUP BY LOWER(COALESCE(u.cargo, 'sem_cargo')) ORDER BY cargo"

        with pool.connection() as conn:
            with conn.cursor(row_factory=dict_row) as cur:
                cur.execute(sql, params)
                return _rows(cur.fetchall())

    def fetch_user_summary(self) -> Mapping[str, Any]:
        pool = get_analytics_pool()
        if pool is None:
            raise RuntimeError("POSTGRES_READONLY_DSN nao foi configurado.")

        with pool.connection() as conn:
            with conn.cursor(row_factory=dict_row) as cur:
                cur.execute(
                    """
                    SELECT COUNT(*)::INT AS total_cadastrados,
                           COUNT(*) FILTER (
                               WHERE COALESCE(status, 'Ativo') <> 'Inativo'
                           )::INT AS total_ativos,
                           COUNT(*) FILTER (
                               WHERE COALESCE(status, 'Ativo') = 'Inativo'
                           )::INT AS total_inativos
                    FROM public.usuarios
                    """
                )
                row = cur.fetchone()
                return cast(Mapping[str, Any], row) if isinstance(row, Mapping) else {}

    def fetch_received_total_by_month(self, year: int, month: int) -> Mapping[str, Any]:
        pool = get_analytics_pool()
        if pool is None:
            raise RuntimeError("POSTGRES_READONLY_DSN nao foi configurado.")

        with pool.connection() as conn:
            with conn.cursor(row_factory=dict_row) as cur:
                cur.execute(
                    """
                    SELECT COALESCE(SUM(quantidade_recebida), 0)::INT AS total_taloes,
                           COUNT(*)::INT AS total_recebimentos
                    FROM public.recebimentos_taloes
                    WHERE data_hora_recebimento >= make_date(%s, %s, 1)
                      AND data_hora_recebimento < make_date(%s, %s, 1) + INTERVAL '1 month'
                    """,
                    [year, month, year, month],
                )
                row = cur.fetchone()
                return cast(Mapping[str, Any], row) if isinstance(row, Mapping) else {}

    def fetch_shipments_on_date(self, day: date) -> Mapping[str, Any]:
        pool = get_analytics_pool()
        if pool is None:
            raise RuntimeError("POSTGRES_READONLY_DSN nao foi configurado.")

        with pool.connection() as conn:
            with conn.cursor(row_factory=dict_row) as cur:
                cur.execute(
                    """
                    SELECT COUNT(*)::INT AS total_remessas,
                           COALESCE(SUM(quantidade_enviada), 0)::INT AS total_taloes
                    FROM public.envios_taloes
                    WHERE data_hora_envio >= %s
                      AND data_hora_envio < (%s::date + INTERVAL '1 day')
                    """,
                    [day, day],
                )
                row = cur.fetchone()
                return cast(Mapping[str, Any], row) if isinstance(row, Mapping) else {}

    def fetch_last_shipments_for_store(
        self,
        store_identifier: str,
        limit: int = 7,
    ) -> list[Mapping[str, Any]]:
        pool = get_analytics_pool()
        if pool is None:
            raise RuntimeError("POSTGRES_READONLY_DSN nao foi configurado.")

        with pool.connection() as conn:
            with conn.cursor(row_factory=dict_row) as cur:
                cur.execute(
                    """
                    SELECT e.codigo_envio,
                           e.cod_loja,
                           l.nome_loja,
                           l.uf,
                           e.data_hora_envio,
                           e.quantidade_enviada,
                           e.status
                    FROM public.envios_taloes e
                    JOIN public.lojas l ON l.cod_loja = e.cod_loja
                    WHERE UPPER(e.cod_loja) = UPPER(%s)
                       OR LOWER(l.nome_loja) = LOWER(%s)
                       OR LOWER(l.nome_loja) LIKE LOWER(%s)
                    ORDER BY e.data_hora_envio DESC, e.id_envio DESC
                    LIMIT %s
                    """,
                    [store_identifier, store_identifier, f"%{store_identifier}%", limit],
                )
                return _rows(cur.fetchall())

    def fetch_average_shipments_for_store(
        self,
        store_identifier: str,
        periodo_inicio: date | None = None,
        periodo_fim: date | None = None,
    ) -> Mapping[str, Any] | None:
        pool = get_analytics_pool()
        if pool is None:
            raise RuntimeError("POSTGRES_READONLY_DSN nao foi configurado.")

        with pool.connection() as conn:
            with conn.cursor(row_factory=dict_row) as cur:
                cur.execute(
                    """
                    SELECT l.cod_loja,
                           l.nome_loja,
                           l.uf,
                           COALESCE(AVG(e.quantidade_enviada), 0)::NUMERIC(12, 2) AS media_taloes,
                           COUNT(e.id_envio)::INT AS total_remessas,
                           COALESCE(SUM(e.quantidade_enviada), 0)::INT AS total_taloes
                    FROM public.lojas l
                    LEFT JOIN public.envios_taloes e
                      ON e.cod_loja = l.cod_loja
                     AND (%s::date IS NULL OR e.data_hora_envio >= %s)
                     AND (%s::date IS NULL OR e.data_hora_envio < (%s::date + INTERVAL '1 day'))
                    WHERE UPPER(l.cod_loja) = UPPER(%s)
                       OR LOWER(l.nome_loja) = LOWER(%s)
                       OR LOWER(l.nome_loja) LIKE LOWER(%s)
                    GROUP BY l.cod_loja, l.nome_loja, l.uf
                    ORDER BY CASE
                        WHEN UPPER(l.cod_loja) = UPPER(%s) THEN 0
                        WHEN LOWER(l.nome_loja) = LOWER(%s) THEN 1
                        ELSE 2
                    END,
                    l.cod_loja
                    LIMIT 1
                    """,
                    [
                        periodo_inicio,
                        periodo_inicio,
                        periodo_fim,
                        periodo_fim,
                        store_identifier,
                        store_identifier,
                        f"%{store_identifier}%",
                        store_identifier,
                        store_identifier,
                    ],
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
    converted = _to_float(value)
    return round(converted, 2) if converted is not None else None


def _first_value(row: object) -> object | None:
    if isinstance(row, Mapping):
        typed_row = cast(Mapping[str, object], row)
        return next(iter(typed_row.values()), None)
    if isinstance(row, Sequence) and not isinstance(row, str):
        typed_row = cast(Sequence[object], row)
        return typed_row[0] if typed_row else None
    return None


def _rows(rows: object) -> list[Mapping[str, Any]]:
    if not isinstance(rows, Sequence):
        return []
    typed_rows = cast(Sequence[object], rows)
    return [cast(Mapping[str, Any], row) for row in typed_rows if isinstance(row, Mapping)]


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
