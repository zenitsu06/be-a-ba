from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

import requests

from app.core.config import get_settings
from app.schemas.insights import InsightGerado, UsoTokens


OPENROUTER_CHAT_COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions"


@dataclass(frozen=True)
class LlmResult:
    model_requested: str
    model_returned: str | None
    content: str
    usage: UsoTokens


class OpenRouterError(RuntimeError):
    def __init__(self, status_code: int, message: str) -> None:
        self.status_code = status_code
        self.message = message
        super().__init__(f"OpenRouter retornou HTTP {status_code}: {message}")


class OpenRouterClient:
    def __init__(
        self,
        api_key: str,
        model: str = "openrouter/auto",
        site_url: str = "http://localhost",
        app_title: str = "be-a-ba-camada-ia",
        timeout_seconds: int = 60,
    ) -> None:
        self.api_key = api_key.strip()
        self.model = model.strip() or "openrouter/auto"
        self.site_url = site_url
        self.app_title = app_title
        self.timeout_seconds = timeout_seconds

    @classmethod
    def from_settings(cls) -> "OpenRouterClient":
        settings = get_settings()
        return cls(
            api_key=settings.openrouter_api_key,
            model=settings.openrouter_model,
            site_url=settings.openrouter_site_url,
            app_title=settings.openrouter_app_title,
        )

    def test_prompt(self, prompt: str) -> LlmResult:
        return self.chat(
            system_prompt=(
                "Voce e uma IA de teste da camada analitica be-a-ba. "
                "Responda de forma curta e objetiva."
            ),
            user_prompt=prompt,
            max_tokens=120,
        )

    def gerar_insight(self, prompt: str) -> tuple[InsightGerado, LlmResult]:
        settings = get_settings()
        result = self.chat(
            system_prompt=(
                "Voce e a camada de IA do be-a-ba. Analise apenas calculos ja recebidos "
                "do Node.js ou da camada analytics. Retorne JSON valido e conciso."
            ),
            user_prompt=prompt,
            max_tokens=settings.llm_max_tokens,
            temperature=settings.llm_temperature,
        )
        return _parse_insight(result.content), result

    def chat(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        max_tokens: int,
        temperature: float = 0.2,
    ) -> LlmResult:
        if not self.api_key:
            raise ValueError("OPENROUTER_API_KEY nao foi definida.")

        payload: dict[str, Any] = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": self.site_url,
            "X-OpenRouter-Title": self.app_title,
        }

        response = requests.post(
            OPENROUTER_CHAT_COMPLETIONS_URL,
            json=payload,
            headers=headers,
            timeout=self.timeout_seconds,
        )
        if not response.ok:
            raise OpenRouterError(response.status_code, _extract_error_message(response))

        data = response.json()
        usage = data.get("usage") or {}
        choices = data.get("choices") or []
        first_choice = choices[0] if choices else {}
        message = first_choice.get("message") or {}

        return LlmResult(
            model_requested=self.model,
            model_returned=data.get("model"),
            content=str(message.get("content") or ""),
            usage=UsoTokens(
                prompt_tokens=usage.get("prompt_tokens"),
                completion_tokens=usage.get("completion_tokens"),
                total_tokens=usage.get("total_tokens"),
            ),
        )


def _parse_insight(content: str) -> InsightGerado:
    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        data = {
            "titulo": "Insight gerado",
            "resumo": content.strip(),
            "recomendacao": "Validar a recomendacao com os indicadores oficiais antes de agir.",
            "dados_origem": [],
            "periodo_analisado": "Periodo informado na requisicao",
            "nivel_confianca": "medio",
            "pontos_atencao": ["A resposta da LLM nao retornou JSON valido."],
        }
    return InsightGerado.model_validate(data)


def _extract_error_message(response: requests.Response) -> str:
    try:
        data = response.json()
    except ValueError:
        return response.text[:500] or "Resposta sem corpo."

    error = data.get("error")
    if isinstance(error, dict):
        return str(error.get("message") or error)
    if isinstance(error, str):
        return error
    return str(data)[:500]

