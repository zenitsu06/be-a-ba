import json
from pathlib import Path


def test_semantic_layer_has_required_fields() -> None:
    path = Path(__file__).resolve().parents[1] / "semantic_layer" / "indicadores.json"
    indicadores = json.loads(path.read_text(encoding="utf-8"))

    assert len(indicadores) == 27
    required_fields = {
        "indicador",
        "definicao_formula",
        "fonte",
        "nivel",
        "uso",
        "status_inicial",
    }

    for indicador in indicadores:
        assert required_fields <= indicador.keys()
        assert all(str(indicador[field]).strip() for field in required_fields)


def test_semantic_layer_contains_consumption_gap() -> None:
    path = Path(__file__).resolve().parents[1] / "semantic_layer" / "indicadores.json"
    indicadores = json.loads(path.read_text(encoding="utf-8"))
    names = {item["indicador"] for item in indicadores}

    assert "Consumo real" in names
    assert "Previsao de demanda" in names
    assert "Pergunta em linguagem natural" in names

