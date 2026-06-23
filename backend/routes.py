from __future__ import annotations

from dataclasses import dataclass
from http import HTTPStatus
from pathlib import Path
from typing import Any, Callable
from urllib.parse import unquote

try:
    from .services import (
        answer_chatbot,
        authenticate,
        create_receipt,
        create_shipment,
        delete_profile,
        export_report,
        list_anomaly_report,
        list_inventory,
        list_profiles,
        list_receipts,
        list_sent_reports,
        list_shipments,
        list_stores,
        list_users,
        list_workplace_notifications,
        read_ai_analysis,
        report_rows,
        run_ai_analysis,
        save_profile,
        save_store,
        save_user,
        set_user_status,
        submit_report,
        update_inventory,
        update_shipment,
    )
except ImportError:
    from services import (  # type: ignore
        answer_chatbot,
        authenticate,
        create_receipt,
        create_shipment,
        delete_profile,
        export_report,
        list_anomaly_report,
        list_inventory,
        list_profiles,
        list_receipts,
        list_sent_reports,
        list_shipments,
        list_stores,
        list_users,
        list_workplace_notifications,
        read_ai_analysis,
        report_rows,
        run_ai_analysis,
        save_profile,
        save_store,
        save_user,
        set_user_status,
        submit_report,
        update_inventory,
        update_shipment,
    )


@dataclass(frozen=True)
class JsonRouteResult:
    payload: dict[str, Any]
    status: int = HTTPStatus.OK


@dataclass(frozen=True)
class FileRouteResult:
    path: Path
    content_type: str
    download_name: str
    status: int = HTTPStatus.OK


RouteResult = JsonRouteResult | FileRouteResult
GetHandler = Callable[[dict[str, str]], RouteResult]
PostHandler = Callable[[dict[str, Any]], RouteResult]


def json_result(payload: dict[str, Any], status: int = HTTPStatus.OK) -> JsonRouteResult:
    return JsonRouteResult(payload=payload, status=status)


def csv_result(path: Path) -> FileRouteResult:
    return FileRouteResult(path=path, content_type="text/csv; charset=utf-8", download_name=path.name)


GET_ROUTES: dict[str, GetHandler] = {
    "/api/health": lambda _query: json_result({"ok": True, "sistema": "Oferte e Ganhe"}),
    "/api/usuarios": lambda _query: json_result({"usuarios": list_users()}),
    "/api/perfis": lambda _query: json_result({"perfis": list_profiles()}),
    "/api/lojas": lambda _query: json_result({"lojas": list_stores()}),
    "/api/estoque": lambda _query: json_result({"estoque_lojas": list_inventory()}),
    "/api/envios": lambda _query: json_result({"envios_taloes": list_shipments()}),
    "/api/recebimentos": lambda _query: json_result({"recebimentos_taloes": list_receipts()}),
    "/api/ia/envio-taloes": lambda _query: json_result(read_ai_analysis()),
    "/api/anomalias": lambda _query: json_result({"anomalias": list_anomaly_report()}),
    "/api/notificacoes/workplace": lambda _query: json_result({"notificacoes": list_workplace_notifications()}),
    "/api/relatorios/enviados": lambda _query: json_result({"relatorios": list_sent_reports()}),
}


POST_ROUTES: dict[str, PostHandler] = {
    "/api/login": lambda body: json_result({"usuario": authenticate(body.get("matricula", ""), body.get("senha", ""))}),
    "/api/usuarios": lambda body: json_result({"usuario": save_user(body)}, HTTPStatus.CREATED),
    "/api/perfis": lambda body: json_result({"perfil": save_profile(body)}, HTTPStatus.CREATED),
    "/api/perfis/excluir": lambda body: json_result({"perfil": delete_profile(body.get("cargo", ""))}),
    "/api/usuarios/status": lambda body: json_result(
        {"usuario": set_user_status(body.get("matricula", ""), body.get("status", ""))}
    ),
    "/api/lojas": lambda body: json_result({"loja": save_store(body)}, HTTPStatus.CREATED),
    "/api/envios": lambda body: json_result({"envio": create_shipment(body)}, HTTPStatus.CREATED),
    "/api/envios/editar": lambda body: json_result({"envio": update_shipment(body)}),
    "/api/recebimentos": lambda body: json_result({"recebimento": create_receipt(body)}, HTTPStatus.CREATED),
    "/api/estoque": lambda body: json_result(update_inventory(body)),
    "/api/ia/envio-taloes/recalcular": lambda _body: json_result(run_ai_analysis()),
    "/api/chatbot": lambda body: json_result(answer_chatbot(body.get("pergunta", ""))),
    "/api/relatorios/enviar": lambda body: json_result({"relatorio": submit_report(body)}, HTTPStatus.CREATED),
    "/api/relatorios/exportar": lambda body: json_result(_export_report_payload(body)),
}


def dispatch_get(path: str, query: dict[str, str]) -> RouteResult | None:
    handler = GET_ROUTES.get(path)
    if handler:
        return handler(query)

    if path.startswith("/api/relatorios/") and path.endswith(".csv"):
        report_type = unquote(Path(path).stem)
        return csv_result(export_report(report_type, query))

    if path.startswith("/api/relatorios/"):
        report_type = unquote(Path(path).name)
        return json_result({"tipo": report_type, "linhas": report_rows(report_type, query)})

    return None


def dispatch_post(path: str, body: dict[str, Any]) -> RouteResult | None:
    handler = POST_ROUTES.get(path)
    return handler(body) if handler else None


def _export_report_payload(body: dict[str, Any]) -> dict[str, str]:
    output = export_report(body.get("tipo", ""))
    return {"arquivo": str(output), "nome": output.name}
