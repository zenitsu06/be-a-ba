from __future__ import annotations

import json
import os
from pathlib import Path

from dotenv import load_dotenv

from app.llm.openrouter_client import OpenRouterClient, OpenRouterError


def main() -> None:
    load_dotenv(Path(__file__).with_name(".env"), encoding="utf-8-sig")

    client = OpenRouterClient(
        api_key=os.getenv("OPENROUTER_API_KEY", ""),
        model=os.getenv("OPENROUTER_MODEL", "openrouter/auto"),
        site_url=os.getenv("OPENROUTER_SITE_URL", "http://localhost"),
        app_title=os.getenv("OPENROUTER_APP_TITLE", "be-a-ba-camada-ia"),
    )
    try:
        result = client.test_prompt(
            "Teste a comunicacao. Responda em uma frase curta dizendo se a camada de IA esta operacional."
        )
    except OpenRouterError as exc:
        print(
            json.dumps(
                {
                    "ok": False,
                    "provider": "openrouter",
                    "status_code": exc.status_code,
                    "message": exc.message,
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        raise SystemExit(1) from exc

    print(
        json.dumps(
            {
                "ok": True,
                "model_requested": result.model_requested,
                "model_returned": result.model_returned,
                "content": result.content,
                "usage": {
                    "prompt_tokens": result.usage.prompt_tokens,
                    "completion_tokens": result.usage.completion_tokens,
                    "total_tokens": result.usage.total_tokens,
                },
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
