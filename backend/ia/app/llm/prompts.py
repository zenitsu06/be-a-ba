from __future__ import annotations

import json
from typing import Any


def build_insight_prompt(
    *,
    indicador: dict[str, Any] | None,
    periodo_inicio: str,
    periodo_fim: str,
    filtros: dict[str, Any],
    calculos: dict[str, Any],
    observacoes: str | None,
) -> str:
    payload: dict[str, Any] = {
        "indicador_semantic_layer": indicador,
        "periodo_inicio": periodo_inicio,
        "periodo_fim": periodo_fim,
        "filtros": filtros,
        "calculos_node": calculos,
        "observacoes": observacoes,
    }
    compact_payload = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return (
        "Analise somente os calculos oficiais enviados. Nao refaca calculos, nao invente dados "
        "e nao use informacoes fora do JSON. Gere uma resposta curta em JSON valido com as chaves: "
        "titulo, resumo, recomendacao, dados_origem, periodo_analisado, nivel_confianca, pontos_atencao. "
        "nivel_confianca deve ser baixo, medio ou alto. JSON de entrada: "
        f"{compact_payload}"
    )
