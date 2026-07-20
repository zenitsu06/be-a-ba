from __future__ import annotations

import json
from typing import Any, Mapping, Sequence, cast

import requests

from app.core.config import get_settings
from app.schemas.insights import InsightGerado, UsoTokens


OPENROUTER_CHAT_COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions"


class LlmResult:
    def __init__(
        self,
        *,
        model_requested: str,
        model_returned: str | None,
        content: str,
        usage: UsoTokens,
    ) -> None:
        self.model_requested = model_requested
        self.model_returned = model_returned
        self.content = content
        self.usage = usage


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

        data = _response_json(response)
        usage = _get_mapping(data, "usage")
        choices = _get_sequence(data, "choices")
        first_choice = _as_mapping(choices[0]) if choices else _empty_mapping()
        message = _get_mapping(first_choice, "message")

        return LlmResult(
            model_requested=self.model,
            model_returned=_as_optional_str(data.get("model")),
            content=_as_optional_str(message.get("content")) or "",
            usage=UsoTokens(
                prompt_tokens=_as_optional_int(usage.get("prompt_tokens")),
                completion_tokens=_as_optional_int(usage.get("completion_tokens")),
                total_tokens=_as_optional_int(usage.get("total_tokens")),
            ),
        )


def _parse_insight(content: str) -> InsightGerado:
    try:
        data = cast(dict[str, Any], json.loads(content))
    except json.JSONDecodeError:
        data: dict[str, Any] = {
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
        data = _response_json(response)
    except ValueError:
        return response.text[:500] or "Resposta sem corpo."

    error: object = data.get("error")
    if isinstance(error, Mapping):
        error_data = cast(Mapping[str, Any], error)
        return _as_optional_str(error_data.get("message")) or str(error_data)
    if isinstance(error, str):
        return error
    return str(data)[:500]


def _response_json(response: requests.Response) -> Mapping[str, Any]:
    raw: object = response.json()
    return _as_mapping(raw)


def _as_mapping(value: object) -> Mapping[str, Any]:
    if isinstance(value, Mapping):
        return cast(Mapping[str, Any], value)
    return _empty_mapping()


def _get_mapping(data: Mapping[str, Any], key: str) -> Mapping[str, Any]:
    raw: object = data.get(key)
    return _as_mapping(raw)


def _get_sequence(data: Mapping[str, Any], key: str) -> Sequence[Any]:
    raw: object = data.get(key)
    if isinstance(raw, Sequence) and not isinstance(raw, str):
        return cast(Sequence[Any], raw)
    return ()


def _empty_mapping() -> Mapping[str, Any]:
    return {}


def _as_optional_int(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _as_optional_str(value: Any) -> str | None:
    if value is None:
        return None
    return str(value)
