const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { databaseHealth, query, withTransaction } = require('./db');

const projectRoot = path.resolve(__dirname, '..');
const aiScriptPath = path.join(projectRoot, 'python', 'ia_envio_taloes.py');
const aiOutputPath = path.join(projectRoot, 'dados', 'ia_envio_taloes.json');

class AppError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const CORE_PROFILE_SLUGS = new Set(['administrador', 'gestor', 'lojista']);

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeProfileSlug(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '');
}

function normalizePermissions(values) {
  const permissions = ['dashboard'];
  const input = Array.isArray(values) ? values : values ? [values] : [];
  for (const value of input) {
    const item = String(value || '').trim();
    if (item && !permissions.includes(item)) permissions.push(item);
  }
  return permissions;
}

function parseStoreCode(value) {
  const match = String(value || '').match(/cod:\s*([^)]+)/i);
  return match ? match[1].trim().toUpperCase() : '';
}

function normalizeUser(row, includePassword = true) {
  const user = {
    nome: row.nome,
    matricula: row.matricula,
    email: row.email,
    cargo: row.cargo,
    loja: row.loja || '',
    lojaNome: row.lojaNome || row.lojanome || '',
    lojaUf: row.lojaUf || row.lojauf || '',
    status: row.status || 'Ativo',
    atribacoes: normalizePermissions(row.atribacoes),
  };
  if (includePassword) user.senha = '';
  return user;
}

function normalizeProfile(row) {
  return {
    id_perfil: toNumber(row.id_perfil),
    nome_perfil: row.nome_perfil,
    cargo: row.cargo,
    descricao: row.descricao,
    atribacoes: normalizePermissions(row.atribacoes),
  };
}

function normalizeStore(row) {
  const current = toNumber(row.quantidade_atual ?? row['Quantidade atual']);
  return {
    codigo_loja: row.codigo_loja,
    nome_da_loja: row.nome_da_loja,
    cidade: row.cidade || '',
    uf: row.uf || null,
    data_cadastro: row.data_cadastro || '',
    quantidade_minima: toNumber(row.quantidade_minima),
    quantidade_recomendada: toNumber(row.quantidade_recomendada),
    'Quantidade atual': current,
    quantidade_atual: current,
    funcionario_matricula: row.funcionario_matricula || '',
    funcionario_nome: row.funcionario_nome || '',
    funcionario_email: row.funcionario_email || '',
    funcionario_cargo: row.funcionario_cargo || '',
  };
}

function normalizeShipment(row) {
  return {
    id_envio: row.id_envio,
    cod_loja: row.cod_loja,
    loja_nome: row.loja_nome,
    loja_uf: row.loja_uf,
    matricula_usuario: row.matricula_usuario,
    data_hora_envio: row.data_hora_envio || '',
    data_entrega_prevista: row.data_entrega_prevista || '',
    quantidade_enviada: toNumber(row.quantidade_enviada),
    quantidade_recomendada: toNumber(row.quantidade_recomendada),
    quantidade_minima: toNumber(row.quantidade_minima),
    prioridade_ia: row.prioridade_ia || 'pendente',
    status: row.status || 'Pendente',
    insight_ia: row.insight_ia || '',
    atualizado_em: row.atualizado_em || '',
  };
}

function normalizeReceipt(row) {
  return {
    id_recebimento: row.id_recebimento,
    cod_loja: row.cod_loja,
    id_envio: row.id_envio,
    matricula_usuario: row.matricula_usuario,
    data_hora_recebimento: row.data_hora_recebimento || '',
    quantidade_recebida: toNumber(row.quantidade_recebida),
    quantidade_divergencia: toNumber(row.quantidade_divergencia),
    observacao: row.observacao || '',
  };
}

async function health() {
  try {
    return {
      ok: true,
      sistema: 'Oferte e Ganhe',
      banco: await databaseHealth(),
    };
  } catch (error) {
    return {
      ok: true,
      sistema: 'Oferte e Ganhe',
      banco: {
        available: false,
        reason: error.message,
      },
    };
  }
}

async function listUsers() {
  const { rows } = await query(`
    SELECT nome, matricula, email, cargo, loja, "lojaNome", "lojaUf", status, atribacoes
    FROM public.vw_usuarios_api
    ORDER BY nome
  `);
  return rows.map(normalizeUser);
}

async function listProfiles() {
  const { rows } = await query(`
    SELECT id_perfil, nome_perfil, cargo, descricao, atribacoes
    FROM public.vw_perfis_api
    ORDER BY id_perfil
  `);
  return rows.map(normalizeProfile);
}

async function saveProfile(payload) {
  const nome = String(payload.nome_perfil || payload.nome || '').trim();
  const cargo = normalizeProfileSlug(payload.cargo || nome);
  const atribacoes = payload.atribacoes || payload.atribuicoes || ['dashboard'];

  if (!nome || !cargo) throw new AppError('Nome e cargo do perfil sao obrigatorios.');
  if (!Array.isArray(atribacoes)) throw new AppError('Atribuicoes do perfil devem ser uma lista.');

  return withTransaction(async (client) => {
    const saved = await client.query(
      `
      INSERT INTO public.perfis (nome_perfil, cargo, descricao)
      VALUES ($1, $2, $3)
      ON CONFLICT (cargo) DO UPDATE SET
        nome_perfil = EXCLUDED.nome_perfil,
        descricao = EXCLUDED.descricao
      RETURNING id_perfil, nome_perfil, cargo, descricao
      `,
      [nome, cargo, payload.descricao || `Perfil ${nome}`],
    );

    const profile = saved.rows[0];
    await client.query('DELETE FROM public.perfis_permissoes WHERE id_perfil = $1', [profile.id_perfil]);
    for (const recurso of normalizePermissions(atribacoes)) {
      await client.query(
        `
        INSERT INTO public.perfis_permissoes (id_perfil, recurso, acao, permitido)
        VALUES ($1, $2, 'acessar', TRUE)
        ON CONFLICT (id_perfil, recurso, acao) DO UPDATE SET permitido = TRUE
        `,
        [profile.id_perfil, recurso],
      );
    }

    return normalizeProfile({ ...profile, atribacoes });
  });
}

async function deleteProfile(cargo) {
  const cargoSlug = normalizeProfileSlug(cargo);
  if (!cargoSlug) throw new AppError('Cargo do perfil e obrigatorio.');
  if (CORE_PROFILE_SLUGS.has(cargoSlug)) {
    throw new AppError('Perfis base do sistema nao podem ser excluidos.', 409);
  }

  const linked = await query('SELECT 1 FROM public.usuarios WHERE cargo = $1 LIMIT 1', [cargoSlug]);
  if (linked.rowCount) {
    throw new AppError('Perfil vinculado a usuario. Altere o cargo dos usuarios antes de excluir.', 409);
  }

  const deleted = await query('DELETE FROM public.perfis WHERE cargo = $1 RETURNING cargo', [cargoSlug]);
  if (!deleted.rowCount) throw new AppError('Perfil nao encontrado.', 404);
  return { cargo: cargoSlug, excluido: true };
}

async function authenticate(matricula, senha) {
  const userCode = String(matricula || '').trim().toUpperCase();
  const { rows } = await query(
    `
    SELECT u.nome, u.matricula, u.email, u.cargo, u.loja, u."lojaNome", u."lojaUf", u.status, u.atribacoes
    FROM public.vw_usuarios_api u
    JOIN public.usuarios base ON UPPER(base.matricula) = UPPER(u.matricula)
    WHERE UPPER(u.matricula) = $1
      AND base.senha_hash = crypt($2, base.senha_hash)
    `,
    [userCode, senha || ''],
  );

  if (!rows.length) throw new AppError('Matricula ou senha incorretas.', 401);
  if ((rows[0].status || 'Ativo') === 'Inativo') {
    throw new AppError('Usuario inativo. Acesso bloqueado.', 403);
  }
  return normalizeUser(rows[0], false);
}

async function resolveStoreCode(codLoja) {
  const code = String(codLoja || '').trim().toUpperCase();
  if (!code) return null;
  const { rows } = await query('SELECT cod_loja FROM public.lojas WHERE cod_loja = $1', [code]);
  return rows[0]?.cod_loja || null;
}

async function saveUser(payload) {
  const required = ['nome', 'matricula', 'email', 'cargo'];
  const missing = required.filter((field) => !payload[field]);
  if (missing.length) throw new AppError(`Campos obrigatorios ausentes: ${missing.join(', ')}`);

  const matricula = String(payload.matricula).trim().toUpperCase();
  const cargo = normalizeProfileSlug(payload.cargo);
  const rawStoreCode = payload.cod_loja || payload.codigo_loja || parseStoreCode(payload.loja);
  const codLoja = await resolveStoreCode(rawStoreCode);
  const senha = String(payload.senha || '');
  const current = await query('SELECT senha_hash FROM public.usuarios WHERE matricula = $1', [matricula]);

  if (!senha && !current.rowCount) throw new AppError('Senha do usuario e obrigatoria.');

  const saved = await query(
    `
    INSERT INTO public.usuarios (
      matricula, nome, email, senha_hash, cargo, cod_loja,
      loja_descricao, loja_nome_manual, loja_uf_manual, status
    )
    VALUES (
      $1, $2, $3,
      CASE WHEN $4 = '' THEN $11 ELSE crypt($4, gen_salt('bf')) END,
      $5, $6, $7, $8, $9, $10
    )
    ON CONFLICT (matricula) DO UPDATE SET
      nome = EXCLUDED.nome,
      email = EXCLUDED.email,
      senha_hash = CASE WHEN $4 = '' THEN public.usuarios.senha_hash ELSE EXCLUDED.senha_hash END,
      cargo = EXCLUDED.cargo,
      cod_loja = EXCLUDED.cod_loja,
      loja_descricao = EXCLUDED.loja_descricao,
      loja_nome_manual = EXCLUDED.loja_nome_manual,
      loja_uf_manual = EXCLUDED.loja_uf_manual,
      status = EXCLUDED.status
    RETURNING matricula
    `,
    [
      matricula,
      String(payload.nome).trim(),
      String(payload.email).trim(),
      senha,
      cargo,
      codLoja,
      payload.loja || '',
      payload.lojaNome || '',
      String(payload.lojaUf || '').trim().toUpperCase() || null,
      payload.status || 'Ativo',
      current.rows[0]?.senha_hash || null,
    ],
  );

  const profile = await query('SELECT id_perfil FROM public.perfis WHERE cargo = $1', [cargo]);
  if (profile.rowCount) {
    await query('DELETE FROM public.usuarios_perfis WHERE matricula_usuario = $1', [matricula]);
    await query(
      `
      INSERT INTO public.usuarios_perfis (matricula_usuario, id_perfil)
      VALUES ($1, $2)
      ON CONFLICT (matricula_usuario, id_perfil) DO NOTHING
      `,
      [matricula, profile.rows[0].id_perfil],
    );
  }

  const { rows } = await query(
    `
    SELECT nome, matricula, email, cargo, loja, "lojaNome", "lojaUf", status, atribacoes
    FROM public.vw_usuarios_api
    WHERE matricula = $1
    `,
    [saved.rows[0].matricula],
  );
  return normalizeUser(rows[0]);
}

async function setUserStatus(matricula, status) {
  if (!['Ativo', 'Inativo'].includes(status)) {
    throw new AppError('Status invalido. Use Ativo ou Inativo.');
  }
  const saved = await query(
    'UPDATE public.usuarios SET status = $1 WHERE matricula = $2 RETURNING matricula',
    [status, String(matricula || '').trim().toUpperCase()],
  );
  if (!saved.rowCount) throw new AppError('Usuario nao encontrado.', 404);

  const { rows } = await query(
    `
    SELECT nome, matricula, email, cargo, loja, "lojaNome", "lojaUf", status, atribacoes
    FROM public.vw_usuarios_api
    WHERE matricula = $1
    `,
    [saved.rows[0].matricula],
  );
  return normalizeUser(rows[0]);
}

async function listStores() {
  const { rows } = await query(`
    SELECT codigo_loja, nome_da_loja, cidade, uf, data_cadastro,
           quantidade_minima, quantidade_recomendada,
           "Quantidade atual", quantidade_atual,
           funcionario_matricula, funcionario_nome, funcionario_email, funcionario_cargo
    FROM public.vw_lojas_api
    ORDER BY codigo_loja
  `);
  return rows.map(normalizeStore);
}

async function saveStore(payload) {
  const codigo = String(payload.codigo_loja || '').trim().toUpperCase();
  const nome = String(payload.nome_da_loja || '').trim();
  const uf = String(payload.uf || '').trim().toUpperCase() || null;
  if (!codigo || !nome) throw new AppError('Codigo e nome da loja sao obrigatorios.');
  if (uf && uf.length !== 2) throw new AppError('UF deve conter 2 letras.');

  const quantidadeMinima = toNumber(payload.quantidade_minima, 30);
  const quantidadeRecomendada = toNumber(payload.quantidade_recomendada, Math.max(quantidadeMinima * 3, 90));
  const quantidadeAtual = toNumber(payload.quantidade_atual ?? payload['Quantidade atual'], 0);

  await withTransaction(async (client) => {
    await client.query(
      `
      INSERT INTO public.lojas (
        cod_loja, nome_loja, cidade, uf, data_cadastro,
        quantidade_minima, quantidade_recomendada
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (cod_loja) DO UPDATE SET
        nome_loja = EXCLUDED.nome_loja,
        cidade = EXCLUDED.cidade,
        uf = EXCLUDED.uf,
        data_cadastro = EXCLUDED.data_cadastro,
        quantidade_minima = EXCLUDED.quantidade_minima,
        quantidade_recomendada = EXCLUDED.quantidade_recomendada
      `,
      [
        codigo,
        nome,
        payload.cidade || null,
        uf,
        payload.data_cadastro || new Date().toISOString().slice(0, 10),
        quantidadeMinima,
        quantidadeRecomendada,
      ],
    );

    await client.query(
      `
      INSERT INTO public.estoque_lojas (cod_loja, quantidade_atual)
      VALUES ($1, $2)
      ON CONFLICT (cod_loja) DO UPDATE SET
        quantidade_atual = EXCLUDED.quantidade_atual,
        atualizado_em = NOW()
      `,
      [codigo, quantidadeAtual],
    );

    const funcionario = String(payload.funcionario_matricula || '').trim().toUpperCase();
    if (funcionario) {
      const updated = await client.query(
        `
        UPDATE public.usuarios
        SET cod_loja = $1,
            loja_descricao = $2,
            loja_nome_manual = $3,
            loja_uf_manual = $4
        WHERE matricula = $5
        RETURNING matricula
        `,
        [codigo, `${nome}${uf ? ` - ${uf}` : ''} (Cod: ${codigo})`, nome, uf, funcionario],
      );
      if (!updated.rowCount) throw new AppError('Funcionario informado nao foi encontrado.', 404);
    }
  });

  const { rows } = await query(
    `
    SELECT codigo_loja, nome_da_loja, cidade, uf, data_cadastro,
           quantidade_minima, quantidade_recomendada,
           "Quantidade atual", quantidade_atual,
           funcionario_matricula, funcionario_nome, funcionario_email, funcionario_cargo
    FROM public.vw_lojas_api
    WHERE codigo_loja = $1
    `,
    [codigo],
  );
  return normalizeStore(rows[0]);
}

async function listInventory() {
  const { rows } = await query(`
    SELECT cod_loja AS codigo_loja,
           quantidade_atual,
           TO_CHAR(atualizado_em, 'YYYY-MM-DD HH24:MI:SS') AS atualizado_em
    FROM public.estoque_lojas
    ORDER BY cod_loja
  `);
  return rows;
}

async function updateInventory(payload) {
  const codLoja = String(payload.cod_loja || '').trim().toUpperCase();
  const quantidadeAtual = toNumber(payload.quantidade_atual, -1);
  if (!codLoja) throw new AppError('Codigo da loja e obrigatorio.');
  if (quantidadeAtual < 0) throw new AppError('Quantidade atual nao pode ser negativa.');

  const { rows } = await query(
    `
    INSERT INTO public.estoque_lojas (cod_loja, quantidade_atual)
    VALUES ($1, $2)
    ON CONFLICT (cod_loja) DO UPDATE SET
      quantidade_atual = EXCLUDED.quantidade_atual,
      atualizado_em = NOW()
    RETURNING cod_loja AS codigo_loja,
              quantidade_atual,
              TO_CHAR(atualizado_em, 'YYYY-MM-DD HH24:MI:SS') AS atualizado_em
    `,
    [codLoja, quantidadeAtual],
  );
  let iaAtualizada = false;
  try {
    await runAiAnalysis();
    iaAtualizada = true;
  } catch (_error) {
    iaAtualizada = false;
  }
  return { estoque: rows[0], ia_atualizada: iaAtualizada };
}

async function listDuplicateStores() {
  const { rows } = await query(`
    WITH normalizadas AS (
      SELECT
        cod_loja,
        nome_loja,
        cidade,
        uf,
        LOWER(TRIM(nome_loja)) AS nome_norm,
        COALESCE(LOWER(TRIM(cidade)), '') AS cidade_norm,
        COALESCE(uf::TEXT, '') AS uf_norm
      FROM public.lojas
    ),
    marcadas AS (
      SELECT *,
             COUNT(*) OVER (PARTITION BY nome_norm, cidade_norm, uf_norm) AS total_repeticoes
      FROM normalizadas
    )
    SELECT cod_loja, nome_loja, cidade, uf, total_repeticoes
    FROM marcadas
    WHERE total_repeticoes > 1
    ORDER BY nome_norm, cidade_norm, uf_norm, cod_loja
  `);
  return rows;
}

async function listShipments() {
  const { rows } = await query(`
    SELECT id_envio, cod_loja, loja_nome, loja_uf, matricula_usuario,
           data_hora_envio, data_entrega_prevista, quantidade_enviada,
           quantidade_recomendada, quantidade_minima, prioridade_ia,
           status, insight_ia, atualizado_em
    FROM public.vw_envios_api
    ORDER BY data_hora_envio DESC
  `);
  return rows.map(normalizeShipment);
}

async function listReceipts() {
  const { rows } = await query(`
    SELECT id_recebimento, id_envio, cod_loja, matricula_usuario,
           data_hora_recebimento, quantidade_recebida,
           quantidade_divergencia, observacao
    FROM public.vw_recebimentos_api
    ORDER BY data_hora_recebimento DESC
  `);
  return rows.map(normalizeReceipt);
}

async function generateShipmentCode() {
  const year = new Date().getFullYear();
  const prefix = `ENV-${year}-`;
  const { rows } = await query(
    'SELECT codigo_envio FROM public.envios_taloes WHERE codigo_envio LIKE $1',
    [`${prefix}%`],
  );
  const maxSeq = rows.reduce((max, row) => {
    const seq = Number.parseInt(String(row.codigo_envio || '').replace(prefix, ''), 10);
    return Number.isFinite(seq) ? Math.max(max, seq) : max;
  }, 0);
  return `${prefix}${String(maxSeq + 1).padStart(3, '0')}`;
}

async function generateReceiptCode() {
  const year = new Date().getFullYear();
  const prefix = `REC-${year}-`;
  const { rows } = await query(
    'SELECT codigo_recebimento FROM public.recebimentos_taloes WHERE codigo_recebimento LIKE $1',
    [`${prefix}%`],
  );
  const maxSeq = rows.reduce((max, row) => {
    const seq = Number.parseInt(String(row.codigo_recebimento || '').replace(prefix, ''), 10);
    return Number.isFinite(seq) ? Math.max(max, seq) : max;
  }, 0);
  return `${prefix}${String(maxSeq + 1).padStart(3, '0')}`;
}

async function createShipment(payload) {
  const codLoja = String(payload.cod_loja || '').trim().toUpperCase();
  const quantidade = toNumber(payload.quantidade_enviada);
  const matricula = String(payload.matricula_usuario || '').trim().toUpperCase();
  if (!codLoja || quantidade <= 0) throw new AppError('Loja e quantidade enviada sao obrigatorias.');
  if (!matricula) throw new AppError('Matricula do usuario responsavel e obrigatoria.');

  const store = await query(
    `
    SELECT codigo_loja, nome_da_loja, uf, quantidade_minima, quantidade_recomendada
    FROM public.vw_lojas_api
    WHERE codigo_loja = $1
    `,
    [codLoja],
  );
  if (!store.rowCount) throw new AppError('Loja nao encontrada.', 404);

  const ai = (await readAiAnalysis()).analises.find((item) => item.codigo_loja === codLoja) || {};
  const codigoEnvio = payload.id_envio || (await generateShipmentCode());

  await query(
    `
    INSERT INTO public.envios_taloes (
      codigo_envio, cod_loja, matricula_usuario, data_hora_envio,
      data_entrega_prevista, quantidade_enviada,
      quantidade_recomendada, quantidade_minima,
      prioridade_ia, status, insight_ia
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `,
    [
      codigoEnvio,
      codLoja,
      matricula,
      payload.data_hora_envio || new Date(),
      payload.data_entrega_prevista || new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
      quantidade,
      ai.quantidade_sugerida || store.rows[0].quantidade_recomendada || 0,
      ai.quantidade_minima || store.rows[0].quantidade_minima || 0,
      ai.prioridade || 'pendente',
      payload.status || 'Pendente',
      ai.mensagem || 'Analise IA calculada pelo banco.',
    ],
  );

  return getShipmentByCode(codigoEnvio);
}

async function getShipmentByCode(codigoEnvio) {
  const { rows } = await query(
    `
    SELECT id_envio, cod_loja, loja_nome, loja_uf, matricula_usuario,
           data_hora_envio, data_entrega_prevista, quantidade_enviada,
           quantidade_recomendada, quantidade_minima, prioridade_ia,
           status, insight_ia, atualizado_em
    FROM public.vw_envios_api
    WHERE id_envio = $1
    `,
    [codigoEnvio],
  );
  if (!rows.length) throw new AppError('Envio nao encontrado.', 404);
  return normalizeShipment(rows[0]);
}

async function updateShipment(payload) {
  const idEnvio = String(payload.id_envio || '').trim();
  const codLoja = String(payload.cod_loja || '').trim().toUpperCase();
  const quantidade = toNumber(payload.quantidade_enviada);
  if (!idEnvio) throw new AppError('Codigo do envio e obrigatorio.');
  if (!codLoja || quantidade <= 0) throw new AppError('Loja e quantidade enviada sao obrigatorias.');

  const store = await query(
    `
    SELECT codigo_loja, nome_da_loja, uf, quantidade_minima, quantidade_recomendada
    FROM public.vw_lojas_api
    WHERE codigo_loja = $1
    `,
    [codLoja],
  );
  if (!store.rowCount) throw new AppError('Loja nao encontrada.', 404);

  const ai = (await readAiAnalysis()).analises.find((item) => item.codigo_loja === codLoja) || {};
  const updated = await query(
    `
    UPDATE public.envios_taloes
    SET cod_loja = $1,
        data_hora_envio = $2,
        data_entrega_prevista = $3,
        quantidade_enviada = $4,
        quantidade_recomendada = $5,
        quantidade_minima = $6,
        prioridade_ia = $7,
        status = $8,
        insight_ia = $9
    WHERE codigo_envio = $10
    RETURNING codigo_envio
    `,
    [
      codLoja,
      payload.data_hora_envio || new Date(),
      payload.data_entrega_prevista || null,
      quantidade,
      ai.quantidade_sugerida || store.rows[0].quantidade_recomendada || 0,
      ai.quantidade_minima || store.rows[0].quantidade_minima || 0,
      ai.prioridade || 'pendente',
      payload.status || 'Pendente',
      ai.mensagem || 'Analise IA calculada pelo banco.',
      idEnvio,
    ],
  );
  if (!updated.rowCount) throw new AppError('Envio nao encontrado.', 404);
  return getShipmentByCode(idEnvio);
}

async function createReceipt(payload) {
  const idEnvio = String(payload.id_envio || '').trim();
  const quantidadeRecebida = toNumber(payload.quantidade_recebida, -1);
  const matricula = String(payload.matricula_usuario || '').trim().toUpperCase();
  if (!idEnvio || quantidadeRecebida < 0 || !matricula) {
    throw new AppError('Envio, quantidade recebida e matricula sao obrigatorios.');
  }

  const codigoRecebimento = await generateReceiptCode();
  const receipt = await withTransaction(async (client) => {
    const envioResult = await client.query(
      `
      SELECT id_envio, codigo_envio, cod_loja, quantidade_enviada
      FROM public.envios_taloes
      WHERE codigo_envio = $1
      `,
      [idEnvio],
    );
    if (!envioResult.rowCount) throw new AppError('Envio nao encontrado.', 404);

    const envio = envioResult.rows[0];
    const divergencia = Math.abs(toNumber(envio.quantidade_enviada) - quantidadeRecebida);
    const receiptResult = await client.query(
      `
      SELECT id_recebimento, quantidade_recebida, codigo_recebimento
      FROM public.recebimentos_taloes
      WHERE id_envio = $1
      `,
      [envio.id_envio],
    );
    const quantidadeAnterior = receiptResult.rowCount ? toNumber(receiptResult.rows[0].quantidade_recebida) : 0;
    const codigoFinal = receiptResult.rows[0]?.codigo_recebimento || codigoRecebimento;

    if (receiptResult.rowCount) {
      await client.query(
        `
        UPDATE public.recebimentos_taloes
        SET matricula_usuario = $1,
            data_hora_recebimento = $2,
            quantidade_recebida = $3,
            quantidade_divergencia = $4,
            observacao = $5
        WHERE id_envio = $6
        `,
        [
          matricula,
          payload.data_hora_recebimento || new Date(),
          quantidadeRecebida,
          divergencia,
          payload.observacao || '',
          envio.id_envio,
        ],
      );
    } else {
      await client.query(
        `
        INSERT INTO public.recebimentos_taloes (
          codigo_recebimento, id_envio, cod_loja, matricula_usuario,
          data_hora_recebimento, quantidade_recebida,
          quantidade_divergencia, observacao
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        [
          codigoFinal,
          envio.id_envio,
          envio.cod_loja,
          matricula,
          payload.data_hora_recebimento || new Date(),
          quantidadeRecebida,
          divergencia,
          payload.observacao || '',
        ],
      );
    }

    await client.query("UPDATE public.envios_taloes SET status = 'Recebido' WHERE id_envio = $1", [envio.id_envio]);
    await client.query(
      `
      INSERT INTO public.estoque_lojas (cod_loja, quantidade_atual)
      VALUES ($1, 0)
      ON CONFLICT (cod_loja) DO NOTHING
      `,
      [envio.cod_loja],
    );
    await client.query(
      `
      UPDATE public.estoque_lojas
      SET quantidade_atual = GREATEST(quantidade_atual + $1, 0),
          atualizado_em = NOW()
      WHERE cod_loja = $2
      `,
      [quantidadeRecebida - quantidadeAnterior, envio.cod_loja],
    );

    const saved = await client.query(
      `
      SELECT id_recebimento, id_envio, cod_loja, matricula_usuario,
             data_hora_recebimento, quantidade_recebida,
             quantidade_divergencia, observacao
      FROM public.vw_recebimentos_api
      WHERE id_recebimento = $1
      `,
      [codigoFinal],
    );
    return normalizeReceipt(saved.rows[0]);
  });

  try {
    await runAiAnalysis();
  } catch (_error) {
    // A operacao de recebimento nao deve falhar se a IA estiver indisponivel.
  }

  return receipt;
}

async function readAiAnalysis() {
  const output = readJsonFile(aiOutputPath);
  if (output?.analises && Array.isArray(output.analises)) {
    try {
      const count = await query('SELECT COUNT(*)::INT AS total FROM public.lojas');
      if (toNumber(output.total_lojas, -1) === toNumber(count.rows[0]?.total, -2)) {
        return output;
      }
      return await runAiAnalysis();
    } catch (_error) {
      return output;
    }
  }

  const estoque = await query(`
    SELECT cod_loja, nome_loja, uf, quantidade_atual,
           quantidade_recomendada, quantidade_minima,
           status_estoque, prioridade_ordem
    FROM public.vw_estoque_alertas
    ORDER BY prioridade_ordem, cod_loja
  `);

  const analises = estoque.rows.map((row) => {
    const atual = toNumber(row.quantidade_atual);
    const recomendado = toNumber(row.quantidade_recomendada);
    const minimo = toNumber(row.quantidade_minima);
    const reposicao = Math.max(recomendado - atual, 0);
    const prioridade = {
      CRITICO: 'Crítico',
      ALERTA: 'Alerta',
      NA_MEDIA: 'Na média',
      CHEIO: 'Cheio',
    }[row.status_estoque] || row.status_estoque || '';
    return {
      codigo_loja: row.cod_loja,
      nome_loja: row.nome_loja,
      uf: row.uf,
      estoque_atual: atual,
      quantidade_sugerida: reposicao,
      quantidade_minima: minimo,
      prioridade,
      score_prioridade: Math.max(0, 100 - toNumber(row.prioridade_ordem, 4) * 15),
      dias_ate_minimo: null,
      nivel: row.status_estoque,
      mensagem: `${prioridade}: ${row.nome_loja} (${row.uf || 'UF nao informada'}) | Estoque atual: ${atual} | Minimo: ${minimo} | Reposicao sugerida: ${reposicao} taloes`,
    };
  });
  const alertas = analises.filter((item) => ['CRITICO', 'ALERTA'].includes(item.nivel));
  const anomalias = await listAnomalyReport();
  const notificacoes = await listWorkplaceNotifications();

  return {
    gerado_em: new Date().toISOString(),
    total_lojas: analises.length,
    resumo: {
      mensagem: `Analise carregada do banco. Lojas em alerta: ${alertas.length}.`,
      lojas_criticas: analises.filter((item) => item.nivel === 'CRITICO').length,
      lojas_alerta: analises.filter((item) => item.nivel === 'ALERTA').length,
      lojas_media: analises.filter((item) => item.nivel === 'NA_MEDIA').length,
      lojas_cheias: analises.filter((item) => item.nivel === 'CHEIO').length,
      anomalias: anomalias.length,
      notificacoes_workplace: notificacoes.length,
    },
    alertas,
    analises,
    anomalias_recebimento: anomalias,
    notificacoes_workplace: notificacoes,
  };
}

async function listAnomalyReport() {
  const { rows } = await query(`
    SELECT tipo, cod_loja AS codigo_loja, descricao, recomendacao, severidade
    FROM public.anomalias_recebimento
    ORDER BY criado_em DESC
  `);
  return rows;
}

async function listWorkplaceNotifications() {
  const { rows } = await query(`
    SELECT canal, destino, cod_loja AS codigo_loja, mensagem, nivel, status,
           TO_CHAR(enviado_em, 'YYYY-MM-DD HH24:MI:SS') AS enviado_em
    FROM public.notificacoes_workplace
    ORDER BY criado_em DESC
  `);
  return rows;
}

async function listSentReports() {
  const { rows } = await query(`
    SELECT nome_usuario AS nome,
           TO_CHAR(enviado_em, 'YYYY-MM-DD HH24:MI:SS') AS enviado_em,
           tipo_relatorio,
           destinatario,
           assunto,
           status_envio,
           dados
    FROM public.relatorios_enviados
    ORDER BY enviado_em DESC
  `);
  return rows;
}

async function submitReport(payload) {
  const sender = payload.nome_usuario || payload.nome || 'Usuario';
  const rows = Array.isArray(payload.linhas) ? payload.linhas : [];
  const sentAt = new Date();

  await withTransaction(async (client) => {
    for (const row of rows) {
      await client.query(
        `
        INSERT INTO public.relatorios_enviados (
          nome_usuario, tipo_relatorio, destinatario,
          assunto, status_envio, enviado_em, dados
        )
        VALUES ($1, $2, $3, $4, 'ENVIADO', $5, $6::jsonb)
        `,
        [
          sender,
          payload.tipo || payload.tipo_relatorio || 'relatorio',
          payload.destinatario || null,
          payload.assunto || null,
          sentAt,
          JSON.stringify(row),
        ],
      );
    }
  });

  return {
    total: rows.length,
    enviado_em: sentAt.toISOString().slice(0, 19).replace('T', ' '),
  };
}

async function listManagerReport() {
  const envios = await listShipments();
  const recebimentos = Object.fromEntries((await listReceipts()).map((item) => [item.id_envio, item]));
  return envios.map((envio) => {
    const recebimento = recebimentos[envio.id_envio];
    const quantidadeRecebida = recebimento ? toNumber(recebimento.quantidade_recebida) : null;
    return {
      data_hora: envio.data_hora_envio,
      remessa: envio.id_envio,
      loja: envio.loja_nome || envio.cod_loja,
      quantidade_enviada: envio.quantidade_enviada,
      recomendada: envio.quantidade_recomendada,
      minima: envio.quantidade_minima,
      prioridade: envio.prioridade_ia,
      divergencia: quantidadeRecebida === null ? '' : Math.abs(envio.quantidade_enviada - quantidadeRecebida),
    };
  });
}

async function reportRows(reportType, filters = {}) {
  const reports = {
    usuarios: async () => (await listUsers()).map(({ senha, ...row }) => row),
    perfis: async () => (await listProfiles()).map((row) => ({ ...row, atribacoes: row.atribacoes.join(', ') })),
    lojas: listStores,
    envios: listShipments,
    recebimentos: listReceipts,
    estoque: listInventory,
    gestor: listManagerReport,
    manutencao_taloes: async () => (await listShipments()).map((envio) => ({
      data_hora: envio.data_hora_envio,
      remessa: envio.id_envio,
      loja: envio.loja_nome || envio.cod_loja,
      cod_loja: envio.cod_loja,
      quantidade_enviada: envio.quantidade_enviada,
      quantidade_recomendada: envio.quantidade_recomendada,
      quantidade_minima: envio.quantidade_minima,
      status: envio.status,
      data_entrega_prevista: envio.data_entrega_prevista,
      prioridade: envio.prioridade_ia,
      atualizado_em: envio.atualizado_em,
      insight_ia: envio.insight_ia,
    })),
    gestao_recebimento: async () => {
      const envios = Object.fromEntries((await listShipments()).map((envio) => [envio.id_envio, envio]));
      return (await listReceipts()).map((receipt) => {
        const envio = envios[receipt.id_envio] || {};
        return {
          data_hora_recebimento: receipt.data_hora_recebimento,
          recebimento: receipt.id_recebimento,
          remessa: receipt.id_envio,
          cod_loja: receipt.cod_loja || envio.cod_loja || '',
          loja: envio.loja_nome || receipt.cod_loja,
          quantidade_enviada: envio.quantidade_enviada || '',
          quantidade_recebida: receipt.quantidade_recebida,
          quantidade_divergencia: receipt.quantidade_divergencia,
          observacao: receipt.observacao,
        };
      });
    },
    gestao_estoque: async () => {
      const iaByStore = Object.fromEntries((await readAiAnalysis()).analises.map((item) => [item.codigo_loja, item]));
      return (await listStores()).map((store) => {
        const ia = iaByStore[store.codigo_loja] || {};
        return {
          codigo_loja: store.codigo_loja,
          loja: store.nome_da_loja,
          uf: store.uf,
          quantidade_atual: store.quantidade_atual,
          quantidade_minima: store.quantidade_minima,
          quantidade_recomendada: store.quantidade_recomendada,
          prioridade: ia.prioridade || '',
          score_prioridade: ia.score_prioridade || '',
          dias_ate_minimo: ia.dias_ate_minimo || '',
          anomalias: '',
        };
      });
    },
    anomalias: listAnomalyReport,
    notificacoes_workplace: listWorkplaceNotifications,
    relatorios_enviados: listSentReports,
  };

  if (!reports[reportType]) throw new AppError('Relatorio invalido.', 404);
  return filterReportRows(await reports[reportType](), filters);
}

function filterReportRows(rows, filters = {}) {
  const search = String(filters.busca || '').trim().toLowerCase();
  const start = String(filters.data_inicial || '').trim();
  const end = String(filters.data_final || '').trim();

  return rows.filter((row) => {
    const text = Object.values(row).join(' ').toLowerCase();
    const date = rowDate(row);
    if (search && !text.includes(search)) return false;
    if (start && date < start) return false;
    if (end && date > end) return false;
    return true;
  });
}

function rowDate(row) {
  for (const key of ['data_hora', 'data_hora_envio', 'data_hora_recebimento', 'enviado_em', 'atualizado_em', 'data_cadastro']) {
    if (row[key]) return String(row[key]).split(' ')[0];
  }
  return '';
}

function readJsonFile(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_error) {
    return fallback;
  }
}

function pythonCandidates() {
  const configured = process.env.PYTHON_BIN || process.env.PYTHON;
  return [
    configured,
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python313', 'python.exe'),
    'python',
    'py',
  ].filter(Boolean);
}

function runPython(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || projectRoot,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(stderr || stdout || `Processo Python finalizou com codigo ${code}.`));
      }
    });
  });
}

async function runAiAnalysis() {
  if (!fs.existsSync(aiScriptPath)) {
    throw new AppError('Script Python de IA nao encontrado.', 500);
  }

  let lastError = null;
  for (const command of pythonCandidates()) {
    try {
      await runPython(command, [aiScriptPath], { cwd: path.dirname(aiScriptPath) });
      const output = readJsonFile(aiOutputPath);
      if (!output) throw new Error('Python executou, mas nao gerou ia_envio_taloes.json.');
      return output;
    } catch (error) {
      lastError = error;
    }
  }

  throw new AppError(`Falha ao executar IA Python: ${lastError?.message || 'Python nao encontrado.'}`, 500);
}

function toCsv(rows) {
  const fieldnames = rows.length ? Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).sort() : ['mensagem'];
  const escape = (value) => {
    const text = value === null || value === undefined ? '' : String(value);
    return `"${text.replace(/"/g, '""')}"`;
  };
  const data = rows.length ? rows : [{ mensagem: 'Sem dados para exportar' }];
  return [
    fieldnames.join(';'),
    ...data.map((row) => fieldnames.map((field) => escape(row[field])).join(';')),
  ].join('\n');
}

async function answerChatbot(question) {
  const text = String(question || '').trim().toLowerCase();
  if (text.includes('abaixo do estoque') || text.includes('estoque minimo') || text.includes('estoque mínimo')) {
    const ai = await readAiAnalysis();
    const alertas = ai.alertas || [];
    if (!alertas.length) return { resposta: 'Nenhuma loja esta abaixo do estoque minimo no momento.' };
    const nomes = alertas.slice(0, 10).map((item) => `${item.nome_loja} (${item.uf || '-'})`).join(', ');
    return { resposta: `${alertas.length} loja(s) estao abaixo do estoque minimo: ${nomes}.` };
  }

  if (text.includes('taloes enviados') || text.includes('talões enviados') || text.includes('total de taloes') || text.includes('total de talões')) {
    const start = new Date();
    start.setDate(start.getDate() - start.getDay() + 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    const { rows } = await query(
      `
      SELECT COALESCE(SUM(quantidade_enviada), 0) AS total
      FROM public.envios_taloes
      WHERE data_hora_envio >= $1 AND data_hora_envio < $2
      `,
      [start, end],
    );
    return { resposta: `O total de taloes enviados nesta semana e ${rows[0].total}.` };
  }

  return { resposta: 'Ainda nao tenho uma resposta simulada para essa pergunta.' };
}

module.exports = {
  AppError,
  answerChatbot,
  authenticate,
  createReceipt,
  createShipment,
  deleteProfile,
  health,
  listAnomalyReport,
  listDuplicateStores,
  listInventory,
  listProfiles,
  listReceipts,
  listSentReports,
  listShipments,
  listStores,
  listUsers,
  listWorkplaceNotifications,
  readAiAnalysis,
  runAiAnalysis,
  reportRows,
  saveProfile,
  saveStore,
  saveUser,
  setUserStatus,
  submitReport,
  toCsv,
  updateInventory,
  updateShipment,
};
