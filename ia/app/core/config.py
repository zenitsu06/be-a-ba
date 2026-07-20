from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


BASE_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    app_name: str = "be-a-ba - Camada de IA"
    app_version: str = "0.2.0"
    app_environment: str = "local"

    ia_database_dsn: str = ""
    postgres_readonly_dsn: str = ""

    openrouter_api_key: str = ""
    openrouter_model: str = "openrouter/auto"
    openrouter_site_url: str = "http://localhost"
    openrouter_app_title: str = "be-a-ba-camada-ia"

    insight_cache_enabled: bool = True
    llm_max_tokens: int = 450
    llm_temperature: float = 0.2

    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
