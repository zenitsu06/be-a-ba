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
def calcular_prioridade(loja, estoque_lojas, previsao):
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
def gerar_json_ia(lojas, estoque_lojas, envios):
    analises  = []
    alertas   = gerar_alertas(lojas, estoque_lojas)

    for loja in lojas:
        previsao    = prever_estoque(loja, estoque_lojas, envios)
        rank        = calcular_prioridade(loja, estoque_lojas, previsao)
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
            'alerta_nivel':      alerta_loja['nivel'] if alerta_loja else None,
            'mensagem': (
                f"{previsao['mensagem_previsao']} | "
                f"Prioridade de envio: {rank['prioridade']} (score: {rank['score']}/100)."
                + (f" | {alerta_loja['mensagem']}" if alerta_loja else '')
            )
        })

    # Ordenar por score (maior prioridade primeiro)
    analises.sort(key=lambda x: x['score_prioridade'], reverse=True)

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
            'lojas_ok':        len(lojas_ok)
        },
        'alertas': alertas,
        'analises': analises
    }

    return saida


# ── MAIN ─────────────────────────────────────────────────────
if __name__ == '__main__':
    print("=== IA Envio Talões — Iniciando análise ===\n")

    dados_lojas  = carregar_json(LOJAS_PATH)
    dados_taloes = carregar_json(TALOES_PATH)

    lojas         = dados_lojas.get('lojas', [])
    estoque_lojas = dados_lojas.get('estoque_lojas', [])
    envios        = dados_taloes.get('envios_taloes', [])

    print(f"Lojas carregadas:  {len(lojas)}")
    print(f"Envios carregados: {len(envios)}")
    print(f"Registros de estoque: {len(estoque_lojas)}\n")

    resultado = gerar_json_ia(lojas, estoque_lojas, envios)

    with open(SAIDA_PATH, 'w', encoding='utf-8') as f:
        json.dump(resultado, f, ensure_ascii=False, indent=2)

    print(f"Arquivo gerado: {SAIDA_PATH}\n")
    print("=== RESUMO ===")
    print(resultado['resumo']['mensagem'])
    print("\n=== ALERTAS RF11 ===")
    for a in resultado['alertas']:
        print(f"  {a['mensagem']}")
    print("\n=== RANKING RF12-IA ===")
    for i, analise in enumerate(resultado['analises'], 1):
        print(f"  {i}. [{analise['prioridade'].upper()}] {analise['nome_loja']} ({analise['uf']}) "
              f"— Score: {analise['score_prioridade']}/100 "
              f"— Sugestão: {analise['quantidade_sugerida']} talões")
    print("\n✅ Análise concluída com sucesso!")
