from fastapi import APIRouter, Depends

from app.api.dependencies import get_semantic_repository
from app.repositories.semantic_repository import SemanticLayerRepository


router = APIRouter(prefix="/semantic-layer", tags=["semantic-layer"])


@router.get("/indicadores")
def listar_indicadores(
    repository: SemanticLayerRepository = Depends(get_semantic_repository),
) -> list[dict[str, object]]:
    return repository.list_indicadores()

