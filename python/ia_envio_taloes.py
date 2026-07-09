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

# ── CAMINHOS ────────────────────────────────────────────────
BASE_DIR    = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.abspath(os.path.join(BASE_DIR, '..'))
LOJAS_PATH  = os.path.join(BASE_DIR, '..', 'dados', 'lojas.json')
TALOES_PATH = os.path.join(BASE_DIR, '..', 'dados', 'taloes.json')
SAIDA_PATH  = os.path.join(BASE_DIR, '..', 'dados', 'ia_envio_taloes.json')
NODE_ENV_PATH = os.path.join(PROJECT_DIR, 'backend-node', '.env')


# ── CARREGAR DADOS ───────────────────────────────────────────
def carregar_json(caminho):
    with open(caminho, 'r', encoding='utf-8') as f:
        return json.load(f)


def carregar_env_node():
    if not os.path.exists(NODE_ENV_PATH):
        return
    with open(NODE_ENV_PATH, 'r', encoding='utf-8') as arquivo:
        for linha in arquivo:
            texto = linha.strip()
            if not texto or texto.startswith('#') or '=' not in texto:
                continue
            chave, valor = texto.split('=', 1)
            os.environ.setdefault(chave.strip(), valor.strip().strip('"').strip("'"))


def conectar_postgres():
    carregar_env_node()
    try:
        import psycopg
        from psycopg.rows import dict_row
    except ImportError:
        return None

    dsn = os.getenv('DATABASE_URL') or os.getenv('OFERTE_DATABASE_URL')
    if dsn:
        return psycopg.connect(dsn, row_factory=dict_row)

    senha = os.getenv('DB_PASSWORD') or os.getenv('OFERTE_DB_PASSWORD') or ''
    senha_vazia_liberada = os.getenv('DB_ALLOW_EMPTY_PASSWORD') == '1'
    if not senha and not senha_vazia_liberada:
        return None

    return psycopg.connect(
        host=os.getenv('DB_HOST') or os.getenv('OFERTE_DB_HOST') or 'localhost',
        port=int(os.getenv('DB_PORT') or os.getenv('OFERTE_DB_PORT') or 5432),
        dbname=os.getenv('DB_NAME') or os.getenv('OFERTE_DB_NAME') or 'Oferte_e_ganhe',
        user=os.getenv('DB_USER') or os.getenv('OFERTE_DB_USER') or 'postgres',
        password=senha,
        row_factory=dict_row,
    )


def carregar_dados_banco():
    conexao = conectar_postgres()
    if not conexao:
        return None

    with conexao:
        with conexao.cursor() as cursor:
            cursor.execute("""
                SELECT codigo_loja, nome_da_loja, uf, quantidade_minima,
                       quantidade_recomendada, quantidade_atual
                FROM public.vw_lojas_api
                ORDER BY codigo_loja
            """)
            lojas_api = cursor.fetchall()

            cursor.execute("""
                SELECT id_envio, cod_loja, data_hora_envio, quantidade_enviada
                FROM public.vw_envios_api
                ORDER BY data_hora_envio
            """)
            envios = cursor.fetchall()

            cursor.execute("""
                SELECT id_recebimento, id_envio, cod_loja, data_hora_recebimento,
                       quantidade_recebida, quantidade_divergencia
                FROM public.vw_recebimentos_api
                ORDER BY data_hora_recebimento
            """)
            recebimentos = cursor.fetchall()

    lojas = []
    estoque_lojas = []
    for row in lojas_api:
        lojas.append({
            'codigo_loja': row['codigo_loja'],
            'nome_da_loja': row['nome_da_loja'],
            'uf': row.get('uf'),
            'quantidade_minima': int(row.get('quantidade_minima') or 0),
            'quantidade_recomendada': int(row.get('quantidade_recomendada') or 0),
        })
        estoque_lojas.append({
            'codigo_loja': row['codigo_loja'],
            'quantidade_atual': int(row.get('quantidade_atual') or 0),
        })

    return {
        'origem': 'postgres',
        'lojas': lojas,
        'estoque_lojas': estoque_lojas,
        'envios': [dict(row) for row in envios],
        'recebimentos': [dict(row) for row in recebimentos],
    }


def carregar_dados_json():
    dados_lojas = carregar_json(LOJAS_PATH)
    dados_taloes = carregar_json(TALOES_PATH)
    return {
        'origem': 'json',
        'lojas': dados_lojas.get('lojas', []),
        'estoque_lojas': dados_lojas.get('estoque_lojas', []),
        'envios': dados_taloes.get('envios_taloes', []),
        'recebimentos': dados_taloes.get('recebimentos_taloes', []),
    }


def carregar_dados():
    try:
        return carregar_dados_banco() or carregar_dados_json()
    except Exception as erro:
        print(f"Aviso: falha ao carregar dados do banco ({erro}). Usando JSON local.")
        return carregar_dados_json()


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


def parse_data_hora(valor):
    if not valor:
        return None
    texto = str(valor).replace('T', ' ')
    for formato, tamanho in (
        ('%Y-%m-%d %H:%M:%S', 19),
        ('%Y-%m-%d %H:%M', 16),
        ('%Y-%m-%d', 10),
    ):
        try:
            return datetime.strptime(texto[:tamanho], formato)
        except ValueError:
            continue
    return None


def dentro_das_ultimas_duas_semanas(valor):
    data = parse_data_hora(valor)
    return bool(data and data >= datetime.now() - timedelta(days=14))


def numero_ou_zero(valor):
    try:
        return float(valor or 0)
    except (TypeError, ValueError):
        return 0


def calcular_consumo_14d(loja, envios, recebimentos, atual, recomendado, taxa_conversao):
    cod = loja['codigo_loja']
    envios_14d = [
        e for e in envios
        if e.get('cod_loja') == cod and dentro_das_ultimas_duas_semanas(e.get('data_hora_envio'))
    ]
    recebimentos_14d = [
        r for r in recebimentos
        if r.get('cod_loja') == cod and dentro_das_ultimas_duas_semanas(r.get('data_hora_recebimento'))
    ]

    recebido_14d = sum(int(r.get('quantidade_recebida', 0) or 0) for r in recebimentos_14d)
    enviado_14d = sum(int(e.get('quantidade_enviada', 0) or 0) for e in envios_14d)
    queda_estoque = max(recomendado - atual, 0)
    conversao_estimativa = int((recebido_14d or enviado_14d or recomendado) * max(float(taxa_conversao or 0), 1) / 100)
    consumo_estimado = max(queda_estoque, conversao_estimativa)

    return {
        'consumo_14d_estimado': consumo_estimado,
        'recebido_14d': recebido_14d,
        'enviado_14d': enviado_14d
    }


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
def prever_estoque(loja, estoque_lojas, envios, recebimentos, taxa_conversao=0):
    """
    Simula um modelo de regressão linear que analisa o histórico
    de envios para projetar a necessidade futura de reposição.

    Lógica:
    - Calcula a média de consumo mensal com base nos envios recebidos
    - Projeta para os próximos 30 dias
    - Sugere a quantidade ideal a ser enviada
    """
    cod = loja['codigo_loja']

    envios_loja = [e for e in envios if e['cod_loja'] == cod]
    estoque_info = next(
        (e for e in estoque_lojas if e['codigo_loja'] == cod), None
    )
    atual = estoque_info['quantidade_atual'] if estoque_info else 0
    recomendado = loja['quantidade_recomendada']
    minimo = loja['quantidade_minima']
    consumo = calcular_consumo_14d(loja, envios, recebimentos, atual, recomendado, taxa_conversao)
    consumo_14d = consumo['consumo_14d_estimado']

    if not envios_loja:
        tendencia = 'estável'
        confianca = 60
    else:
        medias = [e['quantidade_enviada'] for e in envios_loja]
        media_consumo = sum(medias) / len(medias)
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

        confianca = min(60 + num_envios * 8, 95)
        consumo_14d = max(consumo_14d, int(media_consumo * fator * 0.45))

    deficit_recomendado = max(recomendado - atual, 0)
    reposicao_necessaria = deficit_recomendado + int(consumo_14d * 1.2)
    if atual <= minimo:
        quantidade_sugerida = max(reposicao_necessaria, recomendado - atual + minimo)
    elif atual < recomendado:
        quantidade_sugerida = max(reposicao_necessaria, int((recomendado - atual) * 1.1))
    elif atual <= recomendado * 1.15:
        quantidade_sugerida = max(int(consumo_14d * 0.8), int(recomendado * 0.15))
    else:
        quantidade_sugerida = max(0, int(consumo_14d * 0.35))

    limite_sugestao = max(recomendado * 2, minimo)
    quantidade_sugerida = min(quantidade_sugerida, limite_sugestao)

    dias_ate_minimo = None
    if atual > minimo:
        consumo_diario = max(consumo_14d / 14, quantidade_sugerida / 30, 1)
        if consumo_diario > 0:
            dias_ate_minimo = int((atual - minimo) / consumo_diario)

    return {
        'codigo_loja':        cod,
        'nome_loja':          loja['nome_da_loja'],
        'uf':                 loja['uf'],
        'estoque_atual':      atual,
        'quantidade_sugerida': quantidade_sugerida,
        'quantidade_minima':  minimo,
        'tendencia_consumo':  tendencia,
        'confianca_modelo':   confianca,
        'dias_ate_minimo':    dias_ate_minimo,
        'consumo_14d_estimado': consumo_14d,
        'recebido_14d': consumo['recebido_14d'],
        'enviado_14d': consumo['enviado_14d'],
        'reposicao_necessaria': reposicao_necessaria,
        'mensagem_previsao': (
            f"Modelo preditivo: consumo com tendência {tendencia}. "
            f"Sugestão de envio: {quantidade_sugerida} talões "
            f"(confiança {confianca}%). "
            f"Consumo estimado em 14 dias: {consumo_14d} talões. "
            + (f"Estoque mínimo atingido em ~{dias_ate_minimo} dias."
               if dias_ate_minimo else "Reposição imediata recomendada.")
        )
    }


# ============================================================
#  RF12-IA — RANQUEAMENTO INTELIGENTE DE PRIORIDADE
# ============================================================
def calcular_prioridade(loja, estoque_lojas, previsao, taxa_conversao=0):
    """
    Classifica a loja nos quatro níveis operacionais:
    Crítico, Alerta, Na média e Cheio.
    """
    cod = loja['codigo_loja']
    estoque_info = next(
        (e for e in estoque_lojas if e['codigo_loja'] == cod), None
    )
    atual = estoque_info['quantidade_atual'] if estoque_info else 0
    minimo = loja['quantidade_minima']
    recomendado = loja['quantidade_recomendada']
    consumo_14d = numero_ou_zero(previsao.get('consumo_14d_estimado'))
    dias = previsao.get('dias_ate_minimo')
    pct_recomendado = atual / max(recomendado, 1)

    if atual <= minimo:
        prioridade = 'Crítico'
        classe = 'critico'
        score = 100 - int(min(pct_recomendado, 1) * 12)
    elif atual < recomendado or (dias is not None and dias <= 14):
        prioridade = 'Alerta'
        classe = 'alerta'
        score = 76 + int(max(0, 1 - pct_recomendado) * 18)
        if consumo_14d >= max(recomendado - minimo, 1) * 0.6:
            score += 4
    elif atual <= recomendado * 1.15:
        prioridade = 'Na média'
        classe = 'media'
        score = 45 + int(max(0, 1.15 - pct_recomendado) * 10)
    else:
        prioridade = 'Cheio'
        classe = 'cheio'
        score = max(5, 30 - int(min(pct_recomendado - 1.15, 1) * 15))

    if taxa_conversao >= 18 and prioridade in ('Alerta', 'Na média'):
        score += 4

    score = max(0, min(score, 100))

    return {
        'prioridade': prioridade,
        'classe_css': classe,
        'estado_estoque': prioridade,
        'score':      score
    }


# ============================================================
#  GERADOR DO JSON DE SAÍDA
# ============================================================
def gerar_json_ia(lojas, estoque_lojas, envios, recebimentos):
    analises  = []
    alertas   = gerar_alertas(lojas, estoque_lojas)

    for loja in lojas:
        conversao   = simular_taxa_conversao(loja, envios, recebimentos)
        previsao    = prever_estoque(loja, estoque_lojas, envios, recebimentos, conversao['taxa_percentual'])
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
            'estado_estoque':    rank['estado_estoque'],
            'score_prioridade':  rank['score'],
            'consumo_14d_estimado': previsao['consumo_14d_estimado'],
            'recebido_14d':      previsao['recebido_14d'],
            'enviado_14d':       previsao['enviado_14d'],
            'reposicao_necessaria': previsao['reposicao_necessaria'],
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

    lojas_criticas = [a for a in analises if a['prioridade'] == 'Crítico']
    lojas_alerta   = [a for a in analises if a['prioridade'] == 'Alerta']
    lojas_media    = [a for a in analises if a['prioridade'] == 'Na média']
    lojas_cheias   = [a for a in analises if a['prioridade'] == 'Cheio']
    prioridade_maxima = ', '.join(f"{a['nome_loja']} ({a['uf']})" for a in lojas_criticas) or (
        f"{analises[0]['nome_loja']} ({analises[0]['uf']})" if analises else '-'
    )

    resumo_msg = (
        f"Análise concluída em {datetime.now().strftime('%d/%m/%Y %H:%M')}\n"
        f"Quantidade de lojas em estado crítico: {len(lojas_criticas)}\n"
        f"Prioridade máxima: {prioridade_maxima}"
        if analises else "Nenhuma loja analisada."
    )

    saida = {
        'gerado_em':  datetime.now().isoformat(),
        'total_lojas': len(lojas),
        'resumo': {
            'mensagem':        resumo_msg,
            'lojas_criticas':  len(lojas_criticas),
            'lojas_alerta':    len(lojas_alerta),
            'lojas_media':     len(lojas_media),
            'lojas_cheias':    len(lojas_cheias),
            'lojas_baixas':    len(lojas_alerta),
            'lojas_ok':        len(lojas_media) + len(lojas_cheias),
            'prioridade_maxima': prioridade_maxima,
            'anomalias':       len(anomalias),
            'notificacoes_workplace': len(notificacoes_workplace)
        },
        'alertas': alertas,
        'anomalias_recebimento': anomalias,
        'notificacoes_workplace': notificacoes_workplace,
        'analises': analises
    }

    return saida


def nivel_banco(prioridade):
    mapa = {
        'Crítico': 'CRITICO',
        'Alerta': 'ALERTA',
        'Na média': 'NA_MEDIA',
        'Cheio': 'CHEIO',
    }
    return mapa.get(prioridade, prioridade)


def salvar_resultado_banco(resultado):
    conexao = conectar_postgres()
    if not conexao:
        return False

    with conexao:
        with conexao.cursor() as cursor:
            cursor.execute("DELETE FROM public.analises_ia_envios WHERE tipo_analise = 'ENVIO_TALOES'")
            for analise in resultado.get('analises', []):
                cursor.execute("""
                    INSERT INTO public.analises_ia_envios (
                        cod_loja, tipo_analise, nivel, prioridade,
                        score_prioridade, mensagem, dados
                    )
                    VALUES (%s, 'ENVIO_TALOES', %s, %s, %s, %s, %s::jsonb)
                """, (
                    analise.get('codigo_loja'),
                    nivel_banco(analise.get('prioridade')),
                    analise.get('prioridade'),
                    int(analise.get('score_prioridade') or 0),
                    analise.get('mensagem'),
                    json.dumps(analise, ensure_ascii=False),
                ))

            cursor.execute("""
                DELETE FROM public.anomalias_recebimento
                WHERE tipo IN ('divergencia_recebimento', 'volume_alto_baixa_conversao')
            """)
            for anomalia in resultado.get('anomalias_recebimento', []):
                cursor.execute("""
                    INSERT INTO public.anomalias_recebimento (
                        cod_loja, tipo, severidade, descricao, recomendacao, status
                    )
                    VALUES (%s, %s, %s, %s, %s, 'aberta')
                """, (
                    anomalia.get('codigo_loja'),
                    anomalia.get('tipo'),
                    anomalia.get('severidade', 'media'),
                    anomalia.get('descricao'),
                    anomalia.get('recomendacao'),
                ))

            cursor.execute("DELETE FROM public.notificacoes_workplace WHERE status = 'simulado'")
            for notificacao in resultado.get('notificacoes_workplace', []):
                cursor.execute("""
                    INSERT INTO public.notificacoes_workplace (
                        canal, destino, cod_loja, mensagem, nivel, status, enviado_em
                    )
                    VALUES (%s, %s, %s, %s, %s, 'simulado', %s)
                """, (
                    notificacao.get('canal', 'Workplace'),
                    notificacao.get('destino'),
                    notificacao.get('codigo_loja'),
                    notificacao.get('mensagem'),
                    notificacao.get('nivel'),
                    notificacao.get('enviado_em'),
                ))

    return True


# ── MAIN ─────────────────────────────────────────────────────
if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')

    print("=== IA Envio Talões — Iniciando análise ===\n")

    dados = carregar_dados()
    lojas = dados['lojas']
    estoque_lojas = dados['estoque_lojas']
    envios = dados['envios']
    recebimentos = dados['recebimentos']

    print(f"Origem dos dados:   {dados['origem']}")
    print(f"Lojas carregadas:  {len(lojas)}")
    print(f"Envios carregados: {len(envios)}")
    print(f"Recebimentos carregados: {len(recebimentos)}")
    print(f"Registros de estoque: {len(estoque_lojas)}\n")

    resultado = gerar_json_ia(lojas, estoque_lojas, envios, recebimentos)

    with open(SAIDA_PATH, 'w', encoding='utf-8') as f:
        json.dump(resultado, f, ensure_ascii=False, indent=2)

    print(f"Arquivo gerado: {SAIDA_PATH}\n")
    try:
        if salvar_resultado_banco(resultado):
            print("Resultado salvo no banco de dados.\n")
    except Exception as erro:
        print(f"Aviso: JSON gerado, mas nao foi possivel salvar a IA no banco ({erro}).\n")
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
