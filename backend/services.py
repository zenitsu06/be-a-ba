from __future__ import annotations

import csv
import subprocess
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

try:
    from .storage import (
        BASE_DIR,
        IA_ENVIO_PATH,
        LOJAS_PATH,
        RELATORIOS_DIR,
        RELATORIOS_ENVIADOS_PATH,
        TALOES_PATH,
        USUARIOS_PATH,
        read_json,
        write_json,
    )
except ImportError:
    from storage import (  # type: ignore
        BASE_DIR,
        IA_ENVIO_PATH,
        LOJAS_PATH,
        RELATORIOS_DIR,
        RELATORIOS_ENVIADOS_PATH,
        TALOES_PATH,
        USUARIOS_PATH,
        read_json,
        write_json,
    )


class BackendError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


def _usuarios_data() -> dict[str, Any]:
    data = read_json(USUARIOS_PATH, {"usuarios": [], "perfis": []})
    data.setdefault("usuarios", [])
    data.setdefault("perfis", [])
    return data


def _lojas_data() -> dict[str, Any]:
    data = read_json(LOJAS_PATH, {"lojas": [], "estoque_lojas": []})
    data.setdefault("lojas", [])
    data.setdefault("estoque_lojas", [])
    return data


def _taloes_data() -> dict[str, Any]:
    data = read_json(TALOES_PATH, {"envios_taloes": [], "recebimentos_taloes": []})
    data.setdefault("envios_taloes", [])
    data.setdefault("recebimentos_taloes", [])
    return data


def list_users() -> list[dict[str, Any]]:
    return _usuarios_data()["usuarios"]


def list_profiles() -> list[dict[str, Any]]:
    return _usuarios_data()["perfis"]


def save_profile(payload: dict[str, Any]) -> dict[str, Any]:
    nome = str(payload.get("nome_perfil") or payload.get("nome") or "").strip()
    cargo = _normalize_profile_slug(payload.get("cargo") or nome)
    atribacoes = payload.get("atribacoes") or payload.get("atribuicoes") or ["dashboard"]

    if not nome or not cargo:
        raise BackendError("Nome e cargo do perfil sao obrigatorios.")
    if not isinstance(atribacoes, list):
        raise BackendError("Atribuicoes do perfil devem ser uma lista.")

    data = _usuarios_data()
    perfis = data["perfis"]
    next_id = max((int(perfil.get("id_perfil", 0) or 0) for perfil in perfis), default=0) + 1
    profile = {
        "id_perfil": int(payload.get("id_perfil") or next_id),
        "nome_perfil": nome,
        "cargo": cargo,
        "descricao": payload.get("descricao", f"Perfil {nome}"),
        "atribacoes": _normalize_permissions(atribacoes),
    }

    for index, current in enumerate(perfis):
        current_cargo = _normalize_profile_slug(current.get("cargo") or current.get("nome_perfil"))
        if current_cargo == cargo:
            profile["id_perfil"] = current.get("id_perfil", profile["id_perfil"])
            perfis[index] = profile
            write_json(USUARIOS_PATH, data)
            return profile

    perfis.append(profile)
    write_json(USUARIOS_PATH, data)
    return profile


def _normalize_profile_slug(value: Any) -> str:
    import re
    import unicodedata

    text = unicodedata.normalize("NFD", str(value or "").strip().lower())
    text = "".join(char for char in text if unicodedata.category(char) != "Mn")
    return re.sub(r"(^-+|-+$)", "", re.sub(r"[^a-z0-9]+", "-", text))


def _normalize_permissions(values: list[Any]) -> list[str]:
    permissions = ["dashboard"]
    for value in values:
        item = str(value or "").strip()
        if item and item not in permissions:
            permissions.append(item)
    return permissions


def authenticate(matricula: str, senha: str) -> dict[str, Any]:
    matricula = matricula.strip().upper()

    for user in list_users():
        if str(user.get("matricula", "")).strip().upper() != matricula:
            continue
        if user.get("senha") != senha:
            break
        if user.get("status", "Ativo") == "Inativo":
            raise BackendError("Usuario inativo. Acesso bloqueado.", 403)
        return {
            "nome": user.get("nome"),
            "matricula": user.get("matricula"),
            "cargo": user.get("cargo"),
            "email": user.get("email"),
            "loja": user.get("loja"),
            "lojaNome": user.get("lojaNome"),
            "lojaUf": user.get("lojaUf"),
            "status": user.get("status", "Ativo"),
        }

    raise BackendError("Matricula ou senha incorretas.", 401)


def save_user(payload: dict[str, Any]) -> dict[str, Any]:
    required = ["nome", "matricula", "email", "senha", "cargo"]
    missing = [field for field in required if not payload.get(field)]
    if missing:
        raise BackendError(f"Campos obrigatorios ausentes: {', '.join(missing)}")

    data = _usuarios_data()
    usuarios = data["usuarios"]
    matricula = str(payload["matricula"]).strip().upper()

    user = {
        "nome": payload["nome"].strip(),
        "matricula": matricula,
        "email": payload["email"].strip(),
        "senha": payload["senha"],
        "cargo": payload["cargo"],
        "loja": payload.get("loja", ""),
        "lojaNome": payload.get("lojaNome", ""),
        "lojaUf": payload.get("lojaUf", ""),
        "status": payload.get("status", "Ativo"),
        "atribacoes": payload.get("atribacoes", ["dashboard"]),
    }

    for index, current in enumerate(usuarios):
        if str(current.get("matricula", "")).upper() == matricula:
            user["status"] = payload.get("status", current.get("status", "Ativo"))
            usuarios[index] = user
            write_json(USUARIOS_PATH, data)
            return user

    usuarios.append(user)
    write_json(USUARIOS_PATH, data)
    return user


def set_user_status(matricula: str, status: str) -> dict[str, Any]:
    if status not in {"Ativo", "Inativo"}:
        raise BackendError("Status invalido. Use Ativo ou Inativo.")

    data = _usuarios_data()
    for user in data["usuarios"]:
        if str(user.get("matricula", "")).upper() == matricula.strip().upper():
            user["status"] = status
            write_json(USUARIOS_PATH, data)
            return user

    raise BackendError("Usuario nao encontrado.", 404)


def list_stores() -> list[dict[str, Any]]:
    lojas = _lojas_data()["lojas"]
    usuarios = _usuarios_data()["usuarios"]

    for loja in lojas:
        if loja.get("funcionario_matricula"):
            continue

        codigo = str(loja.get("codigo_loja", "")).upper()
        vinculado = next(
            (
                user
                for user in usuarios
                if _usuario_vinculado_a_loja(user, codigo, loja.get("nome_da_loja"), loja.get("uf"))
            ),
            None,
        )
        if vinculado:
            _aplicar_funcionario_na_loja(loja, vinculado)

    return lojas


def _usuario_vinculado_a_loja(user: dict[str, Any], codigo: str, nome_loja: str | None, uf: str | None) -> bool:
    loja_usuario = str(user.get("loja", ""))
    if codigo and f"COD: {codigo}" in loja_usuario.upper():
        return True
    return bool(
        nome_loja
        and uf is not None
        and user.get("lojaNome") == nome_loja
        and str(user.get("lojaUf", "")).upper() == str(uf).upper()
    )


def _aplicar_funcionario_na_loja(loja: dict[str, Any], user: dict[str, Any]) -> None:
    loja["funcionario_matricula"] = user.get("matricula", "")
    loja["funcionario_nome"] = user.get("nome", "")
    loja["funcionario_email"] = user.get("email", "")
    loja["funcionario_cargo"] = user.get("cargo", "")


def save_store(payload: dict[str, Any]) -> dict[str, Any]:
    required = ["codigo_loja", "nome_da_loja", "uf"]
    missing = [field for field in required if not str(payload.get(field, "")).strip()]
    if missing:
        raise BackendError(f"Campos obrigatorios ausentes: {', '.join(missing)}")

    codigo = str(payload["codigo_loja"]).strip().upper()
    uf = str(payload["uf"]).strip().upper()
    if len(uf) != 2:
        raise BackendError("UF deve conter 2 letras.")

    data = _lojas_data()
    lojas = data["lojas"]
    estoque_lojas = data["estoque_lojas"]
    usuarios_data = _usuarios_data()
    funcionario_matricula = str(payload.get("funcionario_matricula", "")).strip().upper()
    funcionario = None

    if funcionario_matricula:
        funcionario = next(
            (
                user
                for user in usuarios_data["usuarios"]
                if str(user.get("matricula", "")).strip().upper() == funcionario_matricula
            ),
            None,
        )
        if not funcionario:
            raise BackendError("Funcionario informado nao foi encontrado.", 404)

    quantidade_minima = int(payload.get("quantidade_minima") or 30)
    quantidade_recomendada = int(payload.get("quantidade_recomendada") or max(quantidade_minima * 3, 90))
    quantidade_atual = int(payload.get("quantidade_atual") or 0)

    loja = {
        "codigo_loja": codigo,
        "nome_da_loja": str(payload["nome_da_loja"]).strip(),
        "uf": uf,
        "data_cadastro": payload.get("data_cadastro") or datetime.now().date().isoformat(),
        "quantidade_minima": quantidade_minima,
        "quantidade_recomendada": quantidade_recomendada,
        "Quantidade atual": quantidade_atual,
        "funcionario_matricula": "",
        "funcionario_nome": "",
        "funcionario_email": "",
        "funcionario_cargo": "",
    }

    if funcionario:
        _aplicar_funcionario_na_loja(loja, funcionario)

    for current in lojas:
        if str(current.get("codigo_loja", "")).upper() == codigo:
            raise BackendError("Ja existe uma loja cadastrada com esse codigo.", 409)

    lojas.append(loja)

    if not any(str(item.get("codigo_loja", "")).upper() == codigo for item in estoque_lojas):
        estoque_lojas.append({
            "codigo_loja": codigo,
            "quantidade_atual": quantidade_atual,
            "atualizado_em": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        })

    write_json(LOJAS_PATH, data)

    if funcionario:
        funcionario["loja"] = f"{loja['nome_da_loja']} - {uf} (Cod: {codigo})"
        funcionario["lojaNome"] = loja["nome_da_loja"]
        funcionario["lojaUf"] = uf
        write_json(USUARIOS_PATH, usuarios_data)

    return loja


def list_inventory() -> list[dict[str, Any]]:
    return _lojas_data()["estoque_lojas"]


def _set_inventory_quantity(lojas_data: dict[str, Any], cod_loja: str, quantidade_atual: int) -> dict[str, Any]:
    cod_loja = cod_loja.strip().upper()
    agora = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    loja = next(
        (item for item in lojas_data["lojas"] if str(item.get("codigo_loja", "")).upper() == cod_loja),
        None,
    )
    if not loja:
        raise BackendError("Loja nao encontrada.", 404)

    loja["Quantidade atual"] = quantidade_atual
    loja["quantidade_atual"] = quantidade_atual

    estoque = next(
        (item for item in lojas_data["estoque_lojas"] if str(item.get("codigo_loja", "")).upper() == cod_loja),
        None,
    )
    if estoque:
        estoque["quantidade_atual"] = quantidade_atual
        estoque["atualizado_em"] = agora
    else:
        estoque = {
            "codigo_loja": cod_loja,
            "quantidade_atual": quantidade_atual,
            "atualizado_em": agora,
        }
        lojas_data["estoque_lojas"].append(estoque)

    return estoque


def update_inventory(payload: dict[str, Any]) -> dict[str, Any]:
    cod_loja = str(payload.get("cod_loja", "")).strip().upper()
    if not cod_loja:
        raise BackendError("Codigo da loja e obrigatorio.")

    try:
        quantidade_atual = int(payload.get("quantidade_atual"))
    except (TypeError, ValueError):
        raise BackendError("Quantidade atual invalida.")

    if quantidade_atual < 0:
        raise BackendError("Quantidade atual nao pode ser negativa.")

    data = _lojas_data()
    estoque = _set_inventory_quantity(data, cod_loja, quantidade_atual)
    write_json(LOJAS_PATH, data)

    ia_atualizada = False
    try:
        run_ai_analysis()
        ia_atualizada = True
    except BackendError:
        ia_atualizada = False

    return {"estoque": estoque, "ia_atualizada": ia_atualizada}


def list_shipments() -> list[dict[str, Any]]:
    lojas = {loja["codigo_loja"]: loja for loja in list_stores()}
    ia_por_loja = {item["codigo_loja"]: item for item in read_ai_analysis().get("analises", [])}

    enriched = []
    for envio in _taloes_data()["envios_taloes"]:
        loja = lojas.get(envio.get("cod_loja"), {})
        ia = ia_por_loja.get(envio.get("cod_loja"), {})
        enriched.append(
            {
                **envio,
                "loja_nome": envio.get("loja_nome") or loja.get("nome_da_loja"),
                "loja_uf": envio.get("loja_uf") or loja.get("uf"),
                "quantidade_recomendada": envio.get("quantidade_recomendada") or ia.get("quantidade_sugerida"),
                "quantidade_minima": envio.get("quantidade_minima") or ia.get("quantidade_minima"),
                "prioridade_ia": envio.get("prioridade_ia") or ia.get("prioridade"),
                "insight_ia": envio.get("insight_ia") or ia.get("mensagem"),
            }
        )
    return enriched


def list_receipts() -> list[dict[str, Any]]:
    return _taloes_data()["recebimentos_taloes"]


def generate_shipment_code() -> str:
    year = datetime.now().year
    max_seq = 0
    for envio in _taloes_data()["envios_taloes"]:
        code = str(envio.get("id_envio", ""))
        prefix = f"ENV-{year}-"
        if code.startswith(prefix):
            try:
                max_seq = max(max_seq, int(code[-3:]))
            except ValueError:
                pass
    return f"ENV-{year}-{max_seq + 1:03d}"


def create_shipment(payload: dict[str, Any]) -> dict[str, Any]:
    cod_loja = payload.get("cod_loja")
    quantidade = int(payload.get("quantidade_enviada", 0))
    matricula = payload.get("matricula_usuario")

    if not cod_loja or quantidade <= 0:
        raise BackendError("Loja e quantidade enviada sao obrigatorias.")
    if not matricula:
        raise BackendError("Matricula do usuario responsavel e obrigatoria.")

    lojas = {loja["codigo_loja"]: loja for loja in list_stores()}
    loja = lojas.get(cod_loja)
    if not loja:
        raise BackendError("Loja nao encontrada.", 404)

    ia = {item["codigo_loja"]: item for item in read_ai_analysis().get("analises", [])}.get(cod_loja, {})
    data = _taloes_data()
    envio = {
        "id_envio": payload.get("id_envio") or generate_shipment_code(),
        "cod_loja": cod_loja,
        "loja_nome": loja.get("nome_da_loja"),
        "loja_uf": loja.get("uf"),
        "matricula_usuario": matricula,
        "data_hora_envio": payload.get("data_hora_envio") or datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "data_entrega_prevista": payload.get("data_entrega_prevista") or (datetime.now() + timedelta(days=3)).date().isoformat(),
        "quantidade_enviada": quantidade,
        "quantidade_recomendada": ia.get("quantidade_sugerida") or loja.get("quantidade_recomendada"),
        "quantidade_minima": ia.get("quantidade_minima") or loja.get("quantidade_minima"),
        "prioridade_ia": ia.get("prioridade", "pendente"),
        "status": payload.get("status", "Pendente"),
        "insight_ia": ia.get("mensagem", "Analise Python nao encontrada para esta loja."),
    }

    data["envios_taloes"].insert(0, envio)
    write_json(TALOES_PATH, data)
    return envio


def update_shipment(payload: dict[str, Any]) -> dict[str, Any]:
    id_envio = str(payload.get("id_envio", "")).strip()
    cod_loja = payload.get("cod_loja")
    quantidade = int(payload.get("quantidade_enviada", 0))

    if not id_envio:
        raise BackendError("Codigo do envio e obrigatorio.")
    if not cod_loja or quantidade <= 0:
        raise BackendError("Loja e quantidade enviada sao obrigatorias.")

    lojas = {loja["codigo_loja"]: loja for loja in list_stores()}
    loja = lojas.get(cod_loja)
    if not loja:
        raise BackendError("Loja nao encontrada.", 404)

    data = _taloes_data()
    envio = next((item for item in data["envios_taloes"] if item.get("id_envio") == id_envio), None)
    if not envio:
        raise BackendError("Envio nao encontrado.", 404)

    ia = {item["codigo_loja"]: item for item in read_ai_analysis().get("analises", [])}.get(cod_loja, {})
    envio.update({
        "cod_loja": cod_loja,
        "loja_nome": loja.get("nome_da_loja"),
        "loja_uf": loja.get("uf"),
        "data_hora_envio": payload.get("data_hora_envio") or envio.get("data_hora_envio"),
        "data_entrega_prevista": payload.get("data_entrega_prevista") or envio.get("data_entrega_prevista"),
        "quantidade_enviada": quantidade,
        "quantidade_recomendada": ia.get("quantidade_sugerida") or loja.get("quantidade_recomendada"),
        "quantidade_minima": ia.get("quantidade_minima") or loja.get("quantidade_minima"),
        "prioridade_ia": ia.get("prioridade", "pendente"),
        "status": payload.get("status") or envio.get("status", "Pendente"),
        "insight_ia": ia.get("mensagem", "Analise Python nao encontrada para esta loja."),
        "atualizado_em": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    })

    write_json(TALOES_PATH, data)
    return envio


def create_receipt(payload: dict[str, Any]) -> dict[str, Any]:
    id_envio = payload.get("id_envio")
    quantidade_recebida = int(payload.get("quantidade_recebida", 0))
    matricula = payload.get("matricula_usuario")

    if not id_envio or quantidade_recebida < 0 or not matricula:
        raise BackendError("Envio, quantidade recebida e matricula sao obrigatorios.")

    data = _taloes_data()
    envio = next((item for item in data["envios_taloes"] if item.get("id_envio") == id_envio), None)
    if not envio:
        raise BackendError("Envio nao encontrado.", 404)

    quantidade_divergencia = abs(int(envio.get("quantidade_enviada", 0)) - quantidade_recebida)
    receipt = next((item for item in data["recebimentos_taloes"] if item.get("id_envio") == id_envio), None)
    quantidade_anterior = int(receipt.get("quantidade_recebida", 0) or 0) if receipt else 0

    receipt_payload = {
        "cod_loja": envio.get("cod_loja"),
        "id_envio": id_envio,
        "matricula_usuario": matricula,
        "data_hora_recebimento": payload.get("data_hora_recebimento") or datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "quantidade_recebida": quantidade_recebida,
        "quantidade_divergencia": quantidade_divergencia,
        "observacao": payload.get("observacao", ""),
    }

    if receipt:
        receipt.update(receipt_payload)
    else:
        receipt = {
            "id_recebimento": generate_receipt_code(),
            **receipt_payload,
        }
        data["recebimentos_taloes"].insert(0, receipt)

    envio["status"] = "Recebido"
    write_json(TALOES_PATH, data)

    lojas_data = _lojas_data()
    cod_loja = str(envio.get("cod_loja", "")).upper()
    estoque_atual = next(
        (
            int(item.get("quantidade_atual", 0) or 0)
            for item in lojas_data["estoque_lojas"]
            if str(item.get("codigo_loja", "")).upper() == cod_loja
        ),
        next(
            (
                int(item.get("Quantidade atual", item.get("quantidade_atual", 0)) or 0)
                for item in lojas_data["lojas"]
                if str(item.get("codigo_loja", "")).upper() == cod_loja
            ),
            0,
        ),
    )
    _set_inventory_quantity(lojas_data, cod_loja, max(estoque_atual + quantidade_recebida - quantidade_anterior, 0))
    write_json(LOJAS_PATH, lojas_data)

    try:
        run_ai_analysis()
    except BackendError:
        pass

    return receipt


def generate_receipt_code() -> str:
    year = datetime.now().year
    max_seq = 0
    for receipt in _taloes_data()["recebimentos_taloes"]:
        code = str(receipt.get("id_recebimento", ""))
        prefix = f"REC-{year}-"
        if code.startswith(prefix):
            try:
                max_seq = max(max_seq, int(code[-3:]))
            except ValueError:
                pass
    return f"REC-{year}-{max_seq + 1:03d}"


def run_ai_analysis() -> dict[str, Any]:
    script = BASE_DIR / "python" / "ia_envio_taloes.py"
    if not script.exists():
        raise BackendError("Script de IA nao encontrado.", 500)

    result = subprocess.run(
        [sys.executable, str(script)],
        cwd=str(script.parent),
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise BackendError(f"Falha ao executar IA Python: {result.stderr or result.stdout}", 500)
    return read_ai_analysis()


def read_ai_analysis() -> dict[str, Any]:
    return read_json(IA_ENVIO_PATH, {"resumo": {}, "alertas": [], "analises": []})


def answer_chatbot(question: str) -> dict[str, Any]:
    text = question.strip().lower()

    if "abaixo do estoque" in text or "estoque mínimo" in text or "estoque minimo" in text:
        ia = read_ai_analysis()
        alertas = ia.get("alertas", [])
        if alertas:
            nomes = ", ".join(f"{item.get('nome_loja')} ({item.get('uf')})" for item in alertas)
            return {"resposta": f"{len(alertas)} loja(s) estão abaixo do estoque mínimo: {nomes}."}

        lojas = list_stores()
        estoque = {item["codigo_loja"]: item["quantidade_atual"] for item in list_inventory()}
        abaixo = [
            loja for loja in lojas
            if int(estoque.get(loja["codigo_loja"], loja.get("Quantidade atual", 0))) < int(loja.get("quantidade_minima", 0))
        ]
        if not abaixo:
            return {"resposta": "Nenhuma loja está abaixo do estoque mínimo no momento."}
        nomes = ", ".join(f"{loja['nome_da_loja']} ({loja['uf']})" for loja in abaixo)
        return {"resposta": f"{len(abaixo)} loja(s) estão abaixo do estoque mínimo: {nomes}."}

    if "talões enviados" in text or "taloes enviados" in text or "total de talões" in text or "total de taloes" in text:
        today = datetime.now()
        start = today - timedelta(days=today.weekday())
        start = start.replace(hour=0, minute=0, second=0, microsecond=0)
        end = start + timedelta(days=7)
        total = 0
        for envio in _taloes_data()["envios_taloes"]:
            try:
                sent_at = datetime.fromisoformat(str(envio.get("data_hora_envio", "")).replace(" ", "T"))
            except ValueError:
                continue
            if start <= sent_at < end:
                total += int(envio.get("quantidade_enviada", 0) or 0)
        return {"resposta": f"O total de talões enviados nesta semana é {total}."}

    return {"resposta": "Ainda não tenho uma resposta simulada para essa pergunta."}


def list_sent_reports() -> list[dict[str, Any]]:
    data = read_json(RELATORIOS_ENVIADOS_PATH, {"relatorios": []})
    return data.get("relatorios", [])


def submit_report(payload: dict[str, Any]) -> dict[str, Any]:
    sender = payload.get("nome_usuario") or payload.get("nome") or "Usuário"
    rows = payload.get("linhas") or []
    if not isinstance(rows, list):
        raise BackendError("Linhas do relatório inválidas.")

    data = read_json(RELATORIOS_ENVIADOS_PATH, {"relatorios": []})
    data.setdefault("relatorios", [])
    created = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    saved = []
    for row in rows:
        saved.append({
            "nome": sender,
            "enviado_em": created,
            **row,
        })
    data["relatorios"] = saved + data["relatorios"]
    write_json(RELATORIOS_ENVIADOS_PATH, data)
    return {"total": len(saved), "enviado_em": created}


def list_manager_report() -> list[dict[str, Any]]:
    lojas = {loja["codigo_loja"]: loja for loja in list_stores()}
    ia_por_loja = {item["codigo_loja"]: item for item in read_ai_analysis().get("analises", [])}
    recebimentos = {item.get("id_envio"): item for item in list_receipts()}
    rows = []

    for envio in _taloes_data()["envios_taloes"]:
        loja = lojas.get(envio.get("cod_loja"), {})
        ia = ia_por_loja.get(envio.get("cod_loja"), {})
        recebimento = recebimentos.get(envio.get("id_envio"))
        quantidade_enviada = int(envio.get("quantidade_enviada", 0) or 0)
        quantidade_recebida = int(recebimento.get("quantidade_recebida", 0) or 0) if recebimento else None
        divergencia = abs(quantidade_enviada - quantidade_recebida) if quantidade_recebida is not None else ""

        rows.append({
            "data_hora": envio.get("data_hora_envio", ""),
            "remessa": envio.get("id_envio", ""),
            "loja": envio.get("loja_nome") or loja.get("nome_da_loja", envio.get("cod_loja", "")),
            "quantidade_enviada": quantidade_enviada,
            "recomendada": envio.get("quantidade_recomendada") or ia.get("quantidade_sugerida") or loja.get("quantidade_recomendada", ""),
            "minima": envio.get("quantidade_minima") or ia.get("quantidade_minima") or loja.get("quantidade_minima", ""),
            "prioridade": envio.get("prioridade_ia") or ia.get("prioridade", ""),
            "divergencia": divergencia,
        })

    return rows


def export_report(report_type: str, filters: dict[str, str] | None = None) -> Path:
    reports = {
        "usuarios": list_users,
        "lojas": list_stores,
        "envios": list_shipments,
        "recebimentos": list_receipts,
        "estoque": list_inventory,
        "gestor": list_manager_report,
        "relatorios_enviados": list_sent_reports,
    }
    if report_type not in reports:
        raise BackendError("Relatorio invalido.", 404)

    rows = reports[report_type]()
    if report_type == "gestor":
        rows = filter_manager_report(rows, filters or {})
    RELATORIOS_DIR.mkdir(parents=True, exist_ok=True)
    output = RELATORIOS_DIR / f"{report_type}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"

    fieldnames = sorted({key for row in rows for key in row.keys()}) if rows else ["mensagem"]
    with output.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=fieldnames, extrasaction="ignore", delimiter=";")
        writer.writeheader()
        if rows:
            writer.writerows(rows)
        else:
            writer.writerow({"mensagem": "Sem dados para exportar"})

    return output


def filter_manager_report(rows: list[dict[str, Any]], filters: dict[str, str]) -> list[dict[str, Any]]:
    search = filters.get("busca", "").strip().lower()
    start = filters.get("data_inicial", "").strip()
    end = filters.get("data_final", "").strip()

    filtered = []
    for row in rows:
        text = f"{row.get('data_hora', '')} {row.get('remessa', '')} {row.get('loja', '')}".lower()
        date = str(row.get("data_hora", "")).split(" ")[0]
        if search and search not in text:
            continue
        if start and date < start:
            continue
        if end and date > end:
            continue
        filtered.append(row)

    return filtered
