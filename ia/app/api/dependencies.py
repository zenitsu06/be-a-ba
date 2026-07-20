from pathlib import Path

from app.llm.openrouter_client import OpenRouterClient
from app.repositories.insight_repository import get_insight_repository
from app.repositories.semantic_repository import SemanticLayerRepository
from app.services.insight_service import InsightService


BASE_DIR = Path(__file__).resolve().parents[2]
INDICADORES_PATH = BASE_DIR / "semantic_layer" / "indicadores.json"


def get_semantic_repository() -> SemanticLayerRepository:
    return SemanticLayerRepository(INDICADORES_PATH)


def get_insight_service() -> InsightService:
    return InsightService(
        insight_repository=get_insight_repository(),
        semantic_repository=get_semantic_repository(),
        llm_client=OpenRouterClient.from_settings(),
    )

