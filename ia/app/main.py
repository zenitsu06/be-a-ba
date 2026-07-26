from fastapi import FastAPI

from app.api.analytics import router as analytics_router
from app.api.chat import router as chat_router
from app.api.health import router as health_router
from app.api.insights import router as insights_router
from app.api.llm import router as llm_router
from app.api.semantic_layer import router as semantic_layer_router
from app.core.config import get_settings
from app.core.database import close_pools


settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description=(
        "Camada analitica separada para Semantic Layer, cache de insights, "
        "LLM e predicoes futuras."
    ),
)

app.include_router(health_router)
app.include_router(semantic_layer_router)
app.include_router(llm_router)
app.include_router(insights_router)
app.include_router(analytics_router)
app.include_router(chat_router)


@app.on_event("shutdown")
def shutdown() -> None:
    close_pools()
