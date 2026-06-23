from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any


BASE_DIR = Path(__file__).resolve().parents[1]
DADOS_DIR = BASE_DIR / "dados"
RELATORIOS_DIR = BASE_DIR / "relatorios"

USUARIOS_PATH = DADOS_DIR / "usuarios.json"
LOJAS_PATH = DADOS_DIR / "lojas.json"
TALOES_PATH = DADOS_DIR / "taloes.json"
IA_ENVIO_PATH = DADOS_DIR / "ia_envio_taloes.json"
RELATORIOS_ENVIADOS_PATH = DADOS_DIR / "relatorios_enviados.json"

DEFAULT_DATA_FILES: dict[Path, Any] = {
    USUARIOS_PATH: {"usuarios": [], "perfis": []},
    LOJAS_PATH: {"lojas": [], "estoque_lojas": []},
    TALOES_PATH: {"envios_taloes": [], "recebimentos_taloes": []},
    IA_ENVIO_PATH: {"resumo": {}, "alertas": [], "analises": []},
    RELATORIOS_ENVIADOS_PATH: {"relatorios": []},
}


def read_json(path: Path, default: Any | None = None) -> Any:
    if not path.exists():
        return default if default is not None else {}

    with path.open("r", encoding="utf-8") as file:
        return json.load(file)


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(
        prefix=f".{path.name}.",
        suffix=".tmp",
        dir=str(path.parent),
        text=True,
    )

    try:
        with os.fdopen(fd, "w", encoding="utf-8") as file:
            json.dump(data, file, ensure_ascii=False, indent=2)
            file.write("\n")
        os.replace(temp_name, path)
    finally:
        if os.path.exists(temp_name):
            os.remove(temp_name)


def ensure_data_files() -> None:
    DADOS_DIR.mkdir(parents=True, exist_ok=True)
    RELATORIOS_DIR.mkdir(parents=True, exist_ok=True)

    for path, default in DEFAULT_DATA_FILES.items():
        if not path.exists():
            write_json(path, default)
