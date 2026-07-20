from __future__ import annotations

import json
from pathlib import Path
from typing import Any


class SemanticLayerRepository:
    def __init__(self, indicadores_path: Path) -> None:
        self.indicadores_path = indicadores_path

    def list_indicadores(self) -> list[dict[str, Any]]:
        return json.loads(self.indicadores_path.read_text(encoding="utf-8"))

    def find_by_name(self, nome: str) -> dict[str, Any] | None:
        normalized = nome.strip().lower()
        for indicador in self.list_indicadores():
            if str(indicador["indicador"]).strip().lower() == normalized:
                return indicador
        return None

