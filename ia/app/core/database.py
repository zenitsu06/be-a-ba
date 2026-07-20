from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

from psycopg_pool import ConnectionPool

from app.core.config import get_settings


_ia_pool: ConnectionPool | None = None


def get_ia_pool() -> ConnectionPool | None:
    global _ia_pool
    settings = get_settings()
    if not settings.ia_database_dsn:
        return None
    if _ia_pool is None:
        _ia_pool = ConnectionPool(conninfo=settings.ia_database_dsn, open=False)
        _ia_pool.open()
    return _ia_pool


@contextmanager
def ia_connection() -> Iterator[object]:
    pool = get_ia_pool()
    if pool is None:
        raise RuntimeError("IA_DATABASE_DSN nao foi configurado.")
    with pool.connection() as conn:
        yield conn

