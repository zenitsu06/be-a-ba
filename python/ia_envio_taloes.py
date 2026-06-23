"""
============================================================
  SISTEMA "OFERTE E GANHE" — IA Simulada de Estoque
============================================================
  RF11     : Alerta automático de estoque baixo
  RF11-IA  : Previsão preditiva de estoque por loja
  RF12-IA  : Ranqueamento inteligente de prioridade de envio

  Como usar:
    1. Coloque este arquivo na pasta  /python/
    2. Execute:  python ia_envio_taloes.py
    3. O arquivo  ../dados/ia_envio_taloes.json  será gerado
    4. O frontend (envio.js) lê esse JSON automaticamente
============================================================
"""

import json
import os
import sys
from datetime import datetime, timedelta
import random

# ── CAMINHOS ────────────────────────────────────────────────
BASE_DIR    = os.path.dirname(os.path.abspath(__file__))
LOJAS_PATH  = os.path.join(BASE_DIR, '..', 'dados', 'lojas.json')
TALOES_PATH = os.path.join(BASE_DIR, '..', 'dados', 'taloes.json')
SAIDA_PATH  = os.path.join(BASE_DIR, '..', 'dados', 'ia_envio_taloes.json')


# ── CARREGAR DADOS ───────────────────────────────────────────
def carregar_json(caminho):
    with open(caminho, 'r', encoding='utf-8') as f:
        return json.load(f)


def valor_deterministico(codigo, minimo, maximo):
    base = sum(ord(char) for char in str(codigo))
    return minimo + (base % (maximo - minimo + 1))


def simular_taxa_conversao(loja, envios, recebimentos):
    """
    Simula a taxa historica de conversao em cartoes para o prototipo.
    A taxa usa o codigo da loja como semente para manter resultados estaveis.
    """
    cod = loja['codigo_loja']
    envios_loja = [e for e in envios if e.get('cod_loja') == cod]
    recebimentos_loja = [r for r in recebimentos if r.get('cod_loja') == cod]
    taloes_recebidos = sum(int(r.get('quantidade_recebida', 0) or 0) for r in recebimentos_loja)
    taloes_enviados = sum(int(e.get('quantidade_enviada', 0) or 0) for e in envios_loja)
    base = valor_deterministico(cod, 7, 24)
    ajuste = min(len(envios_loja) * 1.3, 6) - min(len(recebimentos_loja) * 0.4, 2)
    taxa = round(max(3, min(32, base + ajuste)), 1)
    cartoes_estimados = int((taloes_recebidos or taloes_enviados or loja['quantidade_recomendada']) * taxa / 100)

    return {
        'taxa_percentual': taxa,
        'cartoes_estimados_30d': cartoes_estimados,
        'base_calculo': 'simulada',
        'mensagem': (
            f"Taxa de conversao historica simulada: {taxa}% "
            f"(~{cartoes_estimados} cartoes estimados)."
        )
    }


def gerar_notificacoes_workplace(alertas):
    notificacoes = []
    agora = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    for alerta in alertas:
        notificacoes.append({
            'canal': 'Workplace',
            'destino': 'Grupo Gestao de Estoque',
            'codigo_loja': alerta['codigo_loja'],
            'loja': alerta['nome_loja'],
            'uf': alerta['uf'],
            'nivel': alerta['nivel'],
            'mensagem': alerta['mensagem'],
            'status': 'simulado',
            'enviado_em': agora
        })
    return notificacoes


def detectar_anomalias_recebimento(lojas, envios, recebimentos, analises):
    anomalias = []
    recebidos_por_loja = {}
    envios_por_id = {envio.get('id_envio'): envio for envio in envios}

    for recebimento in recebimentos:
        cod = recebimento.get('cod_loja') or envios_por_id.get(recebimento.get('id_envio'), {}).get('cod_loja')
        if not cod:
            continue
        recebidos_por_loja[cod] = recebidos_por_loja.get(cod, 0) + int(recebimento.get('quantidade_recebida', 0) or 0)

        divergencia = int(recebimento.get('quantidade_divergencia', 0) or 0)
        enviado = int(envios_por_id.get(recebimento.get('id_envio'), {}).get('quantidade_enviada', 0) or 0)
        if enviado and divergencia / max(enviado, 1) >= 0.1:
            anomalias.append({
                'tipo': 'divergencia_recebimento',
                'codigo_loja': cod,
                'loja': _nome_loja(cod, lojas),
                'severidade': 'media',
                'descricao': (
                    f"Remessa {recebimento.get('id_envio')} teve divergencia de "
                    f"{divergencia} taloes ({round(divergencia / enviado * 100, 1)}%)."
                ),
                'recomendacao': 'Conferir nota de envio e registrar justificativa operacional.'
            })

    volumes = list(recebidos_por_loja.values())
    media_recebida = sum(volumes) / len(volumes) if volumes else 0
    analises_por_loja = {a['codigo_loja']: a for a in analises}

    for cod, total in recebidos_por_loja.items():
        analise = analises_por_loja.get(cod, {})
        taxa = float(analise.get('taxa_conversao_historica', 0) or 0)
        if media_recebida and total > media_recebida * 1.4 and taxa < 10:
            anomalias.append({
                'tipo': 'volume_alto_baixa_conversao',
                'codigo_loja': cod,
                'loja': _nome_loja(cod, lojas),
                'severidade': 'alta',
                'descricao': (
                    f"Loja recebeu {total} taloes, acima da media simulada "
                    f"({round(media_recebida, 1)}), mas converte apenas {taxa}%."
                ),
                'recomendacao': 'Revisar prioridade de reposicao e orientar a loja antes de novo envio.'
            })

    return anomalias


def _nome_loja(codigo, lojas):
    loja = next((item for item in lojas if item.get('codigo_loja') == codigo), None)
    return loja.get('nome_da_loja') if loja else codigo


# ============================================================
#  RF11 — ALERTA AUTOMÁTICO DE ESTOQUE BAIXO
# ============================================================
def gerar_alertas(lojas, estoque_lojas):
    """
    Verifica cada loja e emite alerta quando o estoque atual
    está abaixo da quantidade mínima configurada.
    """
    alertas = []

    for loja in lojas:
        cod = loja['codigo_loja']
        estoque_info = next(
            (e for e in estoque_lojas if e['codigo_loja'] == cod), None
        )
        if not estoque_info:
            continue

        atual  = estoque_info['quantidade_atual']
        minimo = loja['quantidade_minima']
        recomendado = loja['quantidade_recomendada']

        if atual <= minimo:
            nivel = 'CRITICO' if atual < minimo * 0.5 else 'BAIXO'
            alertas.append({
                'codigo_loja': cod,
                'nome_loja':   loja['nome_da_loja'],
                'uf':          loja['uf'],
                'estoque_atual': atual,
                'quantidade_minima': minimo,
                'nivel':       nivel,
                'mensagem':    (
                    f"⚠ ALERTA {nivel}: {loja['nome_da_loja']} ({loja['uf']}) — "
                    f"Estoque atual: {atual} | Mínimo: {minimo} | "
                    f"Reposição urgente: {recomendado - atual} talões"
                )
            })

    return alertas


# ============================================================
#  RF11-IA — PREVISÃO PREDITIVA DE ESTOQUE
# ============================================================
def prever_estoque(loja, estoque_lojas, envios):
    """
    Simula um modelo de regressão linear que analisa o histórico
    de envios para projetar a necessidade futura de reposição.

    Lógica:
    - Calcula a média de consumo mensal com base nos envios recebidos
    - Projeta para os próximos 30 dias
    - Sugere a quantidade ideal a ser enviada
    """
    cod = loja['codigo_loja']

    # Filtrar envios desta loja
    envios_loja = [e for e in envios if e['cod_loja'] == cod]

    # Estoque atual
    estoque_info = next(
        (e for e in estoque_lojas if e['codigo_loja'] == cod), None
    )
    atual = estoque_info['quantidade_atual'] if estoque_info else 0

    if not envios_loja:
        # Sem histórico: sugerir quantidade recomendada como baseline
        quantidade_sugerida = loja['quantidade_recomendada']
        tendencia = 'estável'
        confianca = 60
    else:
        # Média de talões por envio (simulando consumo histórico)
        medias = [e['quantidade_enviada'] for e in envios_loja]
        media_consumo = sum(medias) / len(medias)

        # Simular variação de tendência baseada em quantidade de envios
        num_envios = len(envios_loja)
        if num_envios >= 3:
            ultimo = envios_loja[-1]['quantidade_enviada']
            penultimo = envios_loja[-2]['quantidade_enviada'] if len(envios_loja) >= 2 else ultimo
            variacao = (ultimo - penultimo) / max(penultimo, 1)
            if variacao > 0.1:
                tendencia = 'crescente'
                fator = 1.15
            elif variacao < -0.1:
                tendencia = 'decrescente'
                fator = 0.90
            else:
                tendencia = 'estável'
                fator = 1.0
        else:
            tendencia = 'estável'
            fator = 1.0

        quantidade_sugerida = max(
            int(media_consumo * fator),
            loja['quantidade_minima']
        )
        confianca = min(60 + num_envios * 8, 95)

    # Projeção para 30 dias
    dias_ate_minimo = None
    if atual > loja['quantidade_minima']:
        consumo_diario = quantidade_sugerida / 30
        if consumo_diario > 0:
            dias_ate_minimo = int((atual - loja['quantidade_minima']) / consumo_diario)

    return {
        'codigo_loja':        cod,
        'nome_loja':          loja['nome_da_loja'],
        'uf':                 loja['uf'],
        'estoque_atual':      atual,
        'quantidade_sugerida': quantidade_sugerida,
        'quantidade_minima':  loja['quantidade_minima'],
        'tendencia_consumo':  tendencia,
        'confianca_modelo':   confianca,
        'dias_ate_minimo':    dias_ate_minimo,
        'mensagem_previsao': (
            f"Modelo preditivo: consumo com tendência {tendencia}. "
            f"Sugestão de envio: {quantidade_sugerida} talões "
            f"(confiança {confianca}%). "
            + (f"Estoque mínimo atingido em ~{dias_ate_minimo} dias."
               if dias_ate_minimo else "Reposição imediata recomendada.")
        )
    }


# ============================================================
#  RF12-IA — RANQUEAMENTO INTELIGENTE DE PRIORIDADE
# ============================================================
def calcular_prioridade(loja, estoque_lojas, previsao, taxa_conversao=0):
    """
    Combina múltiplos fatores para gerar um score de prioridade:
    - Nível crítico do estoque atual
    - Taxa de consumo (giro)
    - Tendência de demanda
    - Tempo estimado até atingir o mínimo
    Retorna: Prioridade (Alta / Média / Baixa) + score numérico
    """
    cod = loja['codigo_loja']
    estoque_info = next(
        (e for e in estoque_lojas if e['codigo_loja'] == cod), None
    )
    atual = estoque_info['quantidade_atual'] if estoque_info else 0
    minimo = loja['quantidade_minima']
    recomendado = loja['quantidade_recomendada']

    score = 0

    # Fator 1: nível de estoque atual (peso 40%)
    pct_estoque = atual / max(recomendado, 1)
    if pct_estoque < 0.3:
        score += 40
    elif pct_estoque < 0.6:
        score += 25
    elif pct_estoque < 0.9:
        score += 10
    else:
        score += 0

    # Fator 2: estoque abaixo do mínimo (peso 30%)
    if atual <= minimo:
        score += 30
    elif atual <= minimo * 1.3:
        score += 15

    # Fator 3: tendência de consumo (peso 20%)
    if previsao['tendencia_consumo'] == 'crescente':
        score += 20
    elif previsao['tendencia_consumo'] == 'estável':
        score += 10

    # Fator 4: urgência de tempo (peso 10%)
    dias = previsao.get('dias_ate_minimo')
    if dias is not None and dias <= 7:
        score += 10
    elif dias is not None and dias <= 15:
        score += 5

    if taxa_conversao >= 18:
        score += 15
    elif taxa_conversao >= 12:
        score += 8
    elif taxa_conversao < 5:
        score -= 5

    score = max(0, min(score, 100))

    # Classificar
    if score >= 60:
        prioridade = 'Prioridade'
        classe     = 'alta'
    elif score >= 30:
        prioridade = 'média'
        classe     = 'media'
    else:
        prioridade = 'baixa'
        classe     = 'baixa'

    return {
        'prioridade': prioridade,
        'classe_css': classe,
        'score':      score
    }


# ============================================================
#  GERADOR DO JSON DE SAÍDA
# ============================================================
def gerar_json_ia(lojas, estoque_lojas, envios, recebimentos):
    analises  = []
    alertas   = gerar_alertas(lojas, estoque_lojas)

    for loja in lojas:
        previsao    = prever_estoque(loja, estoque_lojas, envios)
        conversao   = simular_taxa_conversao(loja, envios, recebimentos)
        rank        = calcular_prioridade(loja, estoque_lojas, previsao, conversao['taxa_percentual'])
        alerta_loja = next(
            (a for a in alertas if a['codigo_loja'] == loja['codigo_loja']), None
        )

        analises.append({
            'codigo_loja':       loja['codigo_loja'],
            'nome_loja':         loja['nome_da_loja'],
            'uf':                loja['uf'],
            'estoque_atual':     previsao['estoque_atual'],
            'quantidade_sugerida': previsao['quantidade_sugerida'],
            'quantidade_minima': previsao['quantidade_minima'],
            'tendencia':         previsao['tendencia_consumo'],
            'confianca':         previsao['confianca_modelo'],
            'dias_ate_minimo':   previsao['dias_ate_minimo'],
            'prioridade':        rank['prioridade'],
            'classe_css':        rank['classe_css'],
            'score_prioridade':  rank['score'],
            'taxa_conversao_historica': conversao['taxa_percentual'],
            'cartoes_estimados_30d': conversao['cartoes_estimados_30d'],
            'conversao_base_calculo': conversao['base_calculo'],
            'alerta_nivel':      alerta_loja['nivel'] if alerta_loja else None,
            'mensagem': (
                f"{previsao['mensagem_previsao']} | "
                f"{conversao['mensagem']} | "
                f"Prioridade de envio: {rank['prioridade']} (score: {rank['score']}/100)."
                + (f" | {alerta_loja['mensagem']}" if alerta_loja else '')
            )
        })

    # Ordenar por score (maior prioridade primeiro)
    analises.sort(key=lambda x: x['score_prioridade'], reverse=True)
    anomalias = detectar_anomalias_recebimento(lojas, envios, recebimentos, analises)
    notificacoes_workplace = gerar_notificacoes_workplace(alertas)

    # Lojas em alerta
    lojas_criticas = [a for a in analises if a['alerta_nivel'] == 'CRITICO']
    lojas_baixas   = [a for a in analises if a['alerta_nivel'] == 'BAIXO']
    lojas_ok       = [a for a in analises if a['alerta_nivel'] is None]

    resumo_msg = (
        f"Análise concluída em {datetime.now().strftime('%d/%m/%Y %H:%M')}. "
        f"{len(lojas_criticas)} loja(s) em estado CRÍTICO, "
        f"{len(lojas_baixas)} em estoque BAIXO, "
        f"{len(lojas_ok)} dentro do parâmetro. "
        f"Prioridade máxima: {analises[0]['nome_loja']} ({analises[0]['uf']}) "
        f"com score {analises[0]['score_prioridade']}/100."
        if analises else "Nenhuma loja analisada."
    )

    saida = {
        'gerado_em':  datetime.now().isoformat(),
        'total_lojas': len(lojas),
        'resumo': {
            'mensagem':        resumo_msg,
            'lojas_criticas':  len(lojas_criticas),
            'lojas_baixas':    len(lojas_baixas),
            'lojas_ok':        len(lojas_ok),
            'anomalias':       len(anomalias),
            'notificacoes_workplace': len(notificacoes_workplace)
        },
        'alertas': alertas,
        'anomalias_recebimento': anomalias,
        'notificacoes_workplace': notificacoes_workplace,
        'analises': analises
    }

    return saida


# ── MAIN ─────────────────────────────────────────────────────
if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')

    print("=== IA Envio Talões — Iniciando análise ===\n")

    dados_lojas  = carregar_json(LOJAS_PATH)
    dados_taloes = carregar_json(TALOES_PATH)

    lojas         = dados_lojas.get('lojas', [])
    estoque_lojas = dados_lojas.get('estoque_lojas', [])
    envios        = dados_taloes.get('envios_taloes', [])
    recebimentos  = dados_taloes.get('recebimentos_taloes', [])

    print(f"Lojas carregadas:  {len(lojas)}")
    print(f"Envios carregados: {len(envios)}")
    print(f"Recebimentos carregados: {len(recebimentos)}")
    print(f"Registros de estoque: {len(estoque_lojas)}\n")

    resultado = gerar_json_ia(lojas, estoque_lojas, envios, recebimentos)

    with open(SAIDA_PATH, 'w', encoding='utf-8') as f:
        json.dump(resultado, f, ensure_ascii=False, indent=2)

    print(f"Arquivo gerado: {SAIDA_PATH}\n")
    print("=== RESUMO ===")
    print(resultado['resumo']['mensagem'])
    print("\n=== ALERTAS RF11 ===")
    for a in resultado['alertas']:
        print(f"  {a['mensagem']}")
    print("\n=== NOTIFICACOES WORKPLACE SIMULADAS ===")
    for n in resultado['notificacoes_workplace']:
        print(f"  [{n['status']}] {n['destino']} - {n['mensagem']}")
    print("\n=== ANOMALIAS DE RECEBIMENTO ===")
    for a in resultado['anomalias_recebimento']:
        print(f"  [{a['severidade']}] {a['loja']} - {a['descricao']}")
    print("\n=== RANKING RF12-IA ===")
    for i, analise in enumerate(resultado['analises'], 1):
        print(f"  {i}. [{analise['prioridade'].upper()}] {analise['nome_loja']} ({analise['uf']}) "
              f"— Score: {analise['score_prioridade']}/100 "
              f"— Sugestão: {analise['quantidade_sugerida']} talões")
    print("\n✅ Análise concluída com sucesso!")
