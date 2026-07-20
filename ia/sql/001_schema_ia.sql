CREATE SCHEMA IF NOT EXISTS ia;

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

CREATE TABLE IF NOT EXISTS ia.resultados_indicadores (
    id BIGSERIAL PRIMARY KEY,
    indicador_id BIGINT NOT NULL REFERENCES ia.indicadores(id),
    loja_id BIGINT,
    periodo_inicio DATE NOT NULL,
    periodo_fim DATE NOT NULL,
    valor_numerico NUMERIC,
    valor_json JSONB,
    fonte_dados TEXT NOT NULL,
    calculado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ia.calculos_analytics (
    id BIGSERIAL PRIMARY KEY,
    calculo_hash TEXT NOT NULL UNIQUE,
    indicador TEXT NOT NULL,
    periodo_inicio DATE NOT NULL,
    periodo_fim DATE NOT NULL,
    origem TEXT NOT NULL DEFAULT 'node',
    filtros JSONB NOT NULL DEFAULT '{}'::jsonb,
    calculos JSONB NOT NULL,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ia.modelos_llm (
    id BIGSERIAL PRIMARY KEY,
    provedor TEXT NOT NULL DEFAULT 'openrouter',
    modelo TEXT NOT NULL,
    finalidade TEXT,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
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
    UNIQUE (nome, versao)
);

CREATE TABLE IF NOT EXISTS ia.consultas_ia (
    id BIGSERIAL PRIMARY KEY,
    usuario_solicitante TEXT,
    indicador_id BIGINT REFERENCES ia.indicadores(id),
    periodo_inicio DATE,
    periodo_fim DATE,
    prompt_id BIGINT REFERENCES ia.prompts(id),
    pergunta TEXT NOT NULL,
    dados_origem JSONB,
    nivel_confianca NUMERIC(5, 2),
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ia.execucoes_llm (
    id BIGSERIAL PRIMARY KEY,
    consulta_id BIGINT REFERENCES ia.consultas_ia(id),
    modelo_id BIGINT REFERENCES ia.modelos_llm(id),
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    total_tokens INTEGER,
    custo_estimado NUMERIC(12, 6),
    tempo_ms INTEGER,
    status TEXT NOT NULL,
    erro TEXT,
    executado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
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

CREATE TABLE IF NOT EXISTS ia.insights_historico (
    id BIGSERIAL PRIMARY KEY,
    calculo_hash TEXT NOT NULL UNIQUE REFERENCES ia.calculos_analytics(calculo_hash),
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
    usuario TEXT,
    avaliacao INTEGER CHECK (avaliacao BETWEEN 1 AND 5),
    comentario TEXT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ia.logs_ia (
    id BIGSERIAL PRIMARY KEY,
    consulta_id BIGINT REFERENCES ia.consultas_ia(id),
    evento TEXT NOT NULL,
    detalhes JSONB,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_resultados_indicador_periodo
    ON ia.resultados_indicadores (indicador_id, periodo_inicio, periodo_fim);

CREATE INDEX IF NOT EXISTS idx_calculos_analytics_indicador_periodo
    ON ia.calculos_analytics (indicador, periodo_inicio, periodo_fim);

CREATE INDEX IF NOT EXISTS idx_insights_historico_indicador_periodo
    ON ia.insights_historico (indicador, periodo_inicio, periodo_fim);

CREATE INDEX IF NOT EXISTS idx_consultas_ia_criado_em
    ON ia.consultas_ia (criado_em);

CREATE INDEX IF NOT EXISTS idx_execucoes_llm_consulta
    ON ia.execucoes_llm (consulta_id);
