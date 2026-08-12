CREATE SCHEMA IF NOT EXISTS ia;

-- Catalogo oficial da camada semantica. Nao guarda dados operacionais,
-- apenas a definicao dos indicadores que a IA pode usar.
CREATE TABLE IF NOT EXISTS ia.indicadores (
    id BIGSERIAL PRIMARY KEY,
    nome TEXT NOT NULL UNIQUE,
    definicao_formula TEXT NOT NULL,
    fonte TEXT NOT NULL,
    nivel TEXT NOT NULL,
    uso TEXT NOT NULL,
    status_inicial TEXT NOT NULL,
    granularidade TEXT,
    periodo TEXT,
    regra_qualidade TEXT,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Historico opcional dos valores oficiais calculados pela camada analytics.
-- O dado real continua no banco operacional; aqui fica apenas o resultado
-- analitico consolidado para auditoria e comparacao temporal.
CREATE TABLE IF NOT EXISTS ia.resultados_indicadores (
    id BIGSERIAL PRIMARY KEY,
    indicador_id BIGINT NOT NULL REFERENCES ia.indicadores(id),
    loja_codigo TEXT,
    periodo_inicio DATE NOT NULL,
    periodo_fim DATE NOT NULL,
    valor_numerico NUMERIC,
    valor_json JSONB,
    fonte_dados TEXT NOT NULL,
    calculado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Payloads oficiais enviados pelo Node/analytics para a IA.
-- O hash identifica exatamente o conjunto de calculos usado em um insight.
CREATE TABLE IF NOT EXISTS ia.calculos_analytics (
    id BIGSERIAL PRIMARY KEY,
    calculo_hash TEXT NOT NULL UNIQUE,
    indicador TEXT NOT NULL,
    periodo_inicio DATE NOT NULL,
    periodo_fim DATE NOT NULL,
    origem TEXT NOT NULL DEFAULT 'node',
    filtros JSONB NOT NULL DEFAULT '{}'::jsonb,
    calculos JSONB NOT NULL,
    pergunta_usuario TEXT,
    metadados JSONB NOT NULL DEFAULT '{}'::jsonb,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ia.modelos_llm (
    id BIGSERIAL PRIMARY KEY,
    provedor TEXT NOT NULL DEFAULT 'openrouter',
    modelo TEXT NOT NULL,
    finalidade TEXT,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (provedor, modelo)
);

CREATE TABLE IF NOT EXISTS ia.prompts (
    id BIGSERIAL PRIMARY KEY,
    nome TEXT NOT NULL,
    versao INTEGER NOT NULL,
    template TEXT NOT NULL,
    finalidade TEXT NOT NULL,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (nome, versao)
);

-- Intencoes conhecidas pelo classificador do chat.
-- Exemplos: total_lojas, estoque_loja, lojas_por_status, conversa_livre.
CREATE TABLE IF NOT EXISTS ia.intencoes_chat (
    id BIGSERIAL PRIMARY KEY,
    chave TEXT NOT NULL UNIQUE,
    descricao TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('dado_oficial', 'interpretativa', 'conversa_livre', 'fallback')),
    usa_llm BOOLEAN NOT NULL DEFAULT FALSE,
    exige_consulta_oficial BOOLEAN NOT NULL DEFAULT FALSE,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Consultas SQL oficiais que podem responder perguntas objetivas.
-- Devem ser consultas seguras, versionadas e preferencialmente somente SELECT.
CREATE TABLE IF NOT EXISTS ia.consultas_sql_oficiais (
    id BIGSERIAL PRIMARY KEY,
    nome TEXT NOT NULL,
    versao INTEGER NOT NULL DEFAULT 1,
    intencao_id BIGINT REFERENCES ia.intencoes_chat(id),
    indicador_id BIGINT REFERENCES ia.indicadores(id),
    descricao TEXT NOT NULL,
    sql_template TEXT NOT NULL,
    parametros_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    fonte_dados TEXT NOT NULL DEFAULT 'postgres_operacional',
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (nome, versao)
);

-- Sessoes de chat para permitir experiencia conversacional com historico.
CREATE TABLE IF NOT EXISTS ia.chat_sessoes (
    id BIGSERIAL PRIMARY KEY,
    session_id TEXT NOT NULL UNIQUE,
    usuario TEXT,
    origem TEXT NOT NULL DEFAULT 'frontend',
    metadados JSONB NOT NULL DEFAULT '{}'::jsonb,
    iniciado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    encerrado_em TIMESTAMPTZ
);

-- Cada pergunta/resposta do chat, incluindo a intencao detectada.
CREATE TABLE IF NOT EXISTS ia.chat_mensagens (
    id BIGSERIAL PRIMARY KEY,
    sessao_id BIGINT REFERENCES ia.chat_sessoes(id),
    papel TEXT NOT NULL CHECK (papel IN ('user', 'assistant', 'system', 'tool')),
    conteudo TEXT NOT NULL,
    intencao_id BIGINT REFERENCES ia.intencoes_chat(id),
    dados_contexto JSONB,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Registro de uma consulta feita a IA, seja respondida por SQL oficial,
-- por LLM, por cache ou por fallback.
CREATE TABLE IF NOT EXISTS ia.consultas_ia (
    id BIGSERIAL PRIMARY KEY,
    usuario_solicitante TEXT,
    sessao_id BIGINT REFERENCES ia.chat_sessoes(id),
    mensagem_usuario_id BIGINT REFERENCES ia.chat_mensagens(id),
    intencao_id BIGINT REFERENCES ia.intencoes_chat(id),
    consulta_sql_id BIGINT REFERENCES ia.consultas_sql_oficiais(id),
    indicador_id BIGINT REFERENCES ia.indicadores(id),
    periodo_inicio DATE,
    periodo_fim DATE,
    prompt_id BIGINT REFERENCES ia.prompts(id),
    pergunta TEXT NOT NULL,
    dados_origem JSONB,
    resposta TEXT,
    fonte_resposta TEXT NOT NULL DEFAULT 'nao_definida'
        CHECK (fonte_resposta IN ('sql_oficial', 'llm', 'cache', 'fallback', 'nao_definida')),
    nivel_confianca NUMERIC(5, 2),
    status TEXT NOT NULL DEFAULT 'criada'
        CHECK (status IN ('criada', 'respondida', 'erro', 'cache_hit')),
    erro TEXT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Execucoes reais de LLM, com tokens, custo, latencia e erro.
CREATE TABLE IF NOT EXISTS ia.execucoes_llm (
    id BIGSERIAL PRIMARY KEY,
    consulta_id BIGINT REFERENCES ia.consultas_ia(id),
    modelo_id BIGINT REFERENCES ia.modelos_llm(id),
    provedor TEXT NOT NULL DEFAULT 'openrouter',
    modelo_solicitado TEXT,
    modelo_retornado TEXT,
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    total_tokens INTEGER,
    custo_estimado NUMERIC(12, 6),
    tempo_ms INTEGER,
    status TEXT NOT NULL,
    erro TEXT,
    executado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Agregados diarios de uso para acompanhamento de custo e volume.
CREATE TABLE IF NOT EXISTS ia.metricas_uso_llm (
    id BIGSERIAL PRIMARY KEY,
    data_referencia DATE NOT NULL,
    provedor TEXT NOT NULL DEFAULT 'openrouter',
    modelo TEXT,
    usuario TEXT,
    total_consultas INTEGER NOT NULL DEFAULT 0,
    total_cache_hits INTEGER NOT NULL DEFAULT 0,
    total_erros INTEGER NOT NULL DEFAULT 0,
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    custo_estimado NUMERIC(12, 6) NOT NULL DEFAULT 0,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (data_referencia, provedor, modelo, usuario)
);

CREATE TABLE IF NOT EXISTS ia.insights (
    id BIGSERIAL PRIMARY KEY,
    consulta_id BIGINT REFERENCES ia.consultas_ia(id),
    titulo TEXT,
    conteudo TEXT NOT NULL,
    recomendacao TEXT,
    dados_origem JSONB,
    periodo_inicio DATE,
    periodo_fim DATE,
    nivel_confianca NUMERIC(5, 2),
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cache por hash dos calculos. E a tabela mais importante para reduzir
-- chamadas repetidas ao OpenRouter.
CREATE TABLE IF NOT EXISTS ia.insights_historico (
    id BIGSERIAL PRIMARY KEY,
    calculo_hash TEXT NOT NULL UNIQUE REFERENCES ia.calculos_analytics(calculo_hash),
    consulta_id BIGINT REFERENCES ia.consultas_ia(id),
    indicador TEXT NOT NULL,
    periodo_inicio DATE NOT NULL,
    periodo_fim DATE NOT NULL,
    insight_json JSONB NOT NULL,
    modelo_solicitado TEXT,
    modelo_retornado TEXT,
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    total_tokens INTEGER,
    acessos INTEGER NOT NULL DEFAULT 0,
    ultimo_acesso_em TIMESTAMPTZ,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ia.feedback_respostas (
    id BIGSERIAL PRIMARY KEY,
    consulta_id BIGINT REFERENCES ia.consultas_ia(id),
    mensagem_assistente_id BIGINT REFERENCES ia.chat_mensagens(id),
    usuario TEXT,
    avaliacao INTEGER CHECK (avaliacao BETWEEN 1 AND 5),
    comentario TEXT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ia.logs_ia (
    id BIGSERIAL PRIMARY KEY,
    consulta_id BIGINT REFERENCES ia.consultas_ia(id),
    sessao_id BIGINT REFERENCES ia.chat_sessoes(id),
    evento TEXT NOT NULL,
    detalhes JSONB,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_resultados_indicador_periodo
    ON ia.resultados_indicadores (indicador_id, periodo_inicio, periodo_fim);

CREATE INDEX IF NOT EXISTS idx_resultados_loja_periodo
    ON ia.resultados_indicadores (loja_codigo, periodo_inicio, periodo_fim);

CREATE INDEX IF NOT EXISTS idx_calculos_analytics_hash
    ON ia.calculos_analytics (calculo_hash);

CREATE INDEX IF NOT EXISTS idx_calculos_analytics_indicador_periodo
    ON ia.calculos_analytics (indicador, periodo_inicio, periodo_fim);

CREATE INDEX IF NOT EXISTS idx_consultas_ia_criado_em
    ON ia.consultas_ia (criado_em);

CREATE INDEX IF NOT EXISTS idx_consultas_ia_intencao
    ON ia.consultas_ia (intencao_id, criado_em);

CREATE INDEX IF NOT EXISTS idx_chat_sessoes_usuario
    ON ia.chat_sessoes (usuario, iniciado_em);

CREATE INDEX IF NOT EXISTS idx_chat_mensagens_sessao
    ON ia.chat_mensagens (sessao_id, criado_em);

CREATE INDEX IF NOT EXISTS idx_execucoes_llm_consulta
    ON ia.execucoes_llm (consulta_id);

CREATE INDEX IF NOT EXISTS idx_execucoes_llm_modelo
    ON ia.execucoes_llm (provedor, modelo_retornado, executado_em);

CREATE INDEX IF NOT EXISTS idx_insights_historico_hash
    ON ia.insights_historico (calculo_hash);

CREATE INDEX IF NOT EXISTS idx_insights_historico_indicador_periodo
    ON ia.insights_historico (indicador, periodo_inicio, periodo_fim);

CREATE INDEX IF NOT EXISTS idx_logs_ia_evento
    ON ia.logs_ia (evento, criado_em);

INSERT INTO ia.intencoes_chat (
    chave,
    descricao,
    tipo,
    usa_llm,
    exige_consulta_oficial
) VALUES
    ('total_lojas', 'Perguntas sobre quantidade total de lojas cadastradas.', 'dado_oficial', FALSE, TRUE),
    ('lojas_por_status', 'Perguntas sobre lojas por status de estoque: critico, alerta, na media ou cheio.', 'dado_oficial', FALSE, TRUE),
    ('estoque_loja', 'Perguntas sobre estoque atual, minimo e recomendado de uma loja especifica.', 'dado_oficial', FALSE, TRUE),
    ('funcionarios_loja', 'Perguntas sobre funcionarios vinculados a uma loja especifica.', 'dado_oficial', FALSE, TRUE),
    ('total_funcionarios', 'Perguntas sobre quantidade total de funcionarios cadastrados ou ativos.', 'dado_oficial', FALSE, TRUE),
    ('envios', 'Perguntas sobre envios de taloes em um periodo.', 'dado_oficial', FALSE, TRUE),
    ('recebimentos', 'Perguntas sobre recebimentos, pendencias e taxa de recebimento.', 'dado_oficial', FALSE, TRUE),
    ('insight_analitico', 'Perguntas interpretativas sobre situacao geral, prioridade ou recomendacao.', 'interpretativa', TRUE, FALSE),
    ('conversa_livre', 'Conversas naturais sem pedido de dado operacional especifico.', 'conversa_livre', TRUE, FALSE),
    ('fallback', 'Perguntas que nao encaixaram em nenhuma intencao conhecida.', 'fallback', TRUE, FALSE)
ON CONFLICT (chave) DO NOTHING;
