from __future__ import annotations

import json

from dotenv import load_dotenv

from app.llm.openrouter_client import OpenRouterClient, OpenRouterError


def main() -> None:
    load_dotenv()
    client = OpenRouterClient.from_settings()
    try:
        result = client.test_prompt("Responda apenas: ok")
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
                "usage": result.usage.model_dump(),
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

