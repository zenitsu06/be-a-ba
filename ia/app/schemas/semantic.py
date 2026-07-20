from pydantic import BaseModel


class IndicadorSemanticLayer(BaseModel):
    indicador: str
    definicao_formula: str
    fonte: str
    nivel: str
    uso: str
    status_inicial: str

