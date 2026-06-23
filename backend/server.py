from __future__ import annotations

import json
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

try:
    from .config import CONFIG
    from .routes import FileRouteResult, JsonRouteResult, dispatch_get, dispatch_post
    from .services import BackendError
    from .storage import BASE_DIR, ensure_data_files
except ImportError:
    from config import CONFIG  # type: ignore
    from routes import FileRouteResult, JsonRouteResult, dispatch_get, dispatch_post  # type: ignore
    from services import BackendError  # type: ignore
    from storage import BASE_DIR, ensure_data_files  # type: ignore


class Handler(SimpleHTTPRequestHandler):
    server_version = "OferteGanheBackend/1.1"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BASE_DIR), **kwargs)

    def end_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", CONFIG.allow_origin)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self) -> None:
        self.send_response(HTTPStatus.NO_CONTENT)
        self.end_headers()

    def do_GET(self) -> None:
        parsed_url = urlparse(self.path)
        path = parsed_url.path
        if not path.startswith("/api/"):
            return super().do_GET()

        query = {key: values[0] for key, values in parse_qs(parsed_url.query).items()}
        self.handle_api_result(lambda: dispatch_get(path, query))

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        if not path.startswith("/api/"):
            self.json_response({"erro": "Rota nao encontrada."}, HTTPStatus.NOT_FOUND)
            return

        self.handle_api_result(lambda: dispatch_post(path, self.read_body()))

    def handle_api_result(self, producer) -> None:
        try:
            result = producer()
            if result is None:
                self.json_response({"erro": "Rota nao encontrada."}, HTTPStatus.NOT_FOUND)
                return
            self.route_response(result)
        except BackendError as error:
            self.json_response({"erro": str(error)}, error.status)
        except Exception as error:
            self.json_response({"erro": str(error)}, HTTPStatus.INTERNAL_SERVER_ERROR)

    def read_body(self) -> dict:
        length = int(self.headers.get("Content-Length", 0))
        if length <= 0:
            return {}
        if length > CONFIG.max_body_bytes:
            raise BackendError("Corpo da requisicao muito grande.", HTTPStatus.REQUEST_ENTITY_TOO_LARGE)

        raw = self.rfile.read(length).decode("utf-8")
        try:
            payload = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            raise BackendError("JSON invalido.", HTTPStatus.BAD_REQUEST)

        if not isinstance(payload, dict):
            raise BackendError("O corpo da requisicao deve ser um objeto JSON.", HTTPStatus.BAD_REQUEST)
        return payload

    def route_response(self, result: JsonRouteResult | FileRouteResult) -> None:
        if isinstance(result, JsonRouteResult):
            self.json_response(result.payload, result.status)
            return
        self.file_response(result)

    def json_response(self, payload: dict, status: int = HTTPStatus.OK) -> None:
        data = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def file_response(self, result: FileRouteResult) -> None:
        data = result.path.read_bytes()
        self.send_response(result.status)
        self.send_header("Content-Type", result.content_type)
        self.send_header("Content-Disposition", f'attachment; filename="{result.download_name}"')
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def main() -> None:
    ensure_data_files()
    server = ThreadingHTTPServer((CONFIG.host, CONFIG.port), Handler)
    print(f"Backend rodando em http://{CONFIG.host}:{CONFIG.port}")
    print(f"Frontend: http://{CONFIG.host}:{CONFIG.port}/login/login.html")
    print("Pressione Ctrl+C para encerrar.")
    server.serve_forever()


if __name__ == "__main__":
    main()
