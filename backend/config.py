from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class ServerConfig:
    host: str = os.getenv("OFERTE_BACKEND_HOST", "localhost")
    port: int = int(os.getenv("OFERTE_BACKEND_PORT", "8000"))
    max_body_bytes: int = int(os.getenv("OFERTE_BACKEND_MAX_BODY_BYTES", "1048576"))
    allow_origin: str = os.getenv("OFERTE_BACKEND_ALLOW_ORIGIN", "*")


CONFIG = ServerConfig()
