from __future__ import annotations

import json
from pathlib import Path
from typing import Any


class SemanticLayerRepository:
    def __init__(self, indicadores_path: Path) -> None:
        self.indicadores_path = indicadores_path
        self._cache_mtime: float | None = None
        self._cache: list[dict[str, Any]] | None = None

    def list_indicadores(self) -> list[dict[str, Any]]:
        mtime = self.indicadores_path.stat().st_mtime
        if self._cache is None or self._cache_mtime != mtime:
            cache: list[dict[str, Any]] = json.loads(self.indicadores_path.read_text(encoding="utf-8"))
            self._cache = cache
            self._cache_mtime = mtime
        else:
            cache = self._cache
        return cache.copy()

    def find_by_name(self, nome: str) -> dict[str, Any] | None:
        normalized = nome.strip().lower()
        for indicador in self.list_indicadores():
            if str(indicador["indicador"]).strip().lower() == normalized:
                return indicador
        return None
