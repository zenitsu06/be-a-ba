const { query, withTransaction, databaseHealth } = require('../database/conexao');

function db(client) {
  return client || { query };
}

async function listUsers() {
  const { rows } = await query(`
    SELECT nome, matricula, email, cargo, loja, "lojaNome", "lojaUf", status, atribacoes
    FROM public.vw_usuarios_api
    ORDER BY nome
  `);
  return rows;
}

async function findUserForAuth(matricula, senha) {
  const { rows } = await query(
    `
    SELECT u.nome, u.matricula, u.email, u.cargo, u.loja, u."lojaNome", u."lojaUf", u.status, u.atribacoes
    FROM public.vw_usuarios_api u
    JOIN public.usuarios base ON UPPER(base.matricula) = UPPER(u.matricula)
    WHERE UPPER(u.matricula) = $1
      AND base.senha_hash = crypt($2, base.senha_hash)
    `,
    [matricula, senha],
  );
  return rows[0] || null;
}

async function findUserPasswordHash(matricula) {
  const { rows } = await query('SELECT senha_hash FROM public.usuarios WHERE matricula = $1', [matricula]);
  return rows[0]?.senha_hash || null;
}

async function updateUserPassword(matricula, senha) {
  const { rows, rowCount } = await query(
    `
    UPDATE public.usuarios
    SET senha_hash = crypt($2, gen_salt('bf'))
    WHERE matricula = $1
    RETURNING matricula
    `,
    [matricula, senha],
  );
  return rowCount ? rows[0] : null;
}

async function upsertUser(payload) {
  const { rows } = await query(
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
      payload.matricula,
      payload.nome,
      payload.email,
      payload.senha,
      payload.cargo,
      payload.codLoja,
      payload.loja,
      payload.lojaNome,
      payload.lojaUf,
      payload.status,
      payload.currentPasswordHash,
    ],
  );
  return rows[0];
}

async function findUserViewByMatricula(matricula) {
  const { rows } = await query(
    `
    SELECT nome, matricula, email, cargo, loja, "lojaNome", "lojaUf", status, atribacoes
    FROM public.vw_usuarios_api
    WHERE matricula = $1
    `,
    [matricula],
  );
  return rows[0] || null;
}

async function deleteUserByMatricula(matricula) {
  const { rows, rowCount } = await query(
    "UPDATE public.usuarios SET status = 'Inativo' WHERE matricula = $1 RETURNING matricula",
    [matricula],
  );
  return rowCount ? rows[0] : null;
}

async function setUserStatus(matricula, status) {
  const { rows, rowCount } = await query(
    'UPDATE public.usuarios SET status = $1 WHERE matricula = $2 RETURNING matricula',
    [status, matricula],
  );
  return rowCount ? rows[0] : null;
}

async function replaceUserProfile(matricula, idPerfil) {
  await query('DELETE FROM public.usuarios_perfis WHERE matricula_usuario = $1', [matricula]);
  await query(
    `
    INSERT INTO public.usuarios_perfis (matricula_usuario, id_perfil)
    VALUES ($1, $2)
    ON CONFLICT (matricula_usuario, id_perfil) DO NOTHING
    `,
    [matricula, idPerfil],
  );
}

async function listProfiles() {
  const { rows } = await query(`
    SELECT id_perfil, nome_perfil, cargo, descricao, atribacoes
    FROM public.vw_perfis_api
    ORDER BY id_perfil
  `);
  return rows;
}

async function findProfileViewById(idPerfil) {
  const { rows } = await query(
    `
    SELECT id_perfil, nome_perfil, cargo, descricao, atribacoes
    FROM public.vw_perfis_api
    WHERE id_perfil = $1
    `,
    [idPerfil],
  );
  return rows[0] || null;
}

async function upsertProfile(client, payload) {
  const { rows } = await db(client).query(
    `
    INSERT INTO public.perfis (nome_perfil, cargo, descricao)
    VALUES ($1, $2, $3)
    ON CONFLICT (cargo) DO UPDATE SET
      nome_perfil = EXCLUDED.nome_perfil,
      descricao = EXCLUDED.descricao
    RETURNING id_perfil, nome_perfil, cargo, descricao
    `,
    [payload.nome, payload.cargo, payload.descricao],
  );
  return rows[0];
}

async function replaceProfilePermissions(client, idPerfil, permissions) {
  await db(client).query('DELETE FROM public.perfis_permissoes WHERE id_perfil = $1', [idPerfil]);
  for (const recurso of permissions) {
    await db(client).query(
      `
      INSERT INTO public.perfis_permissoes (id_perfil, recurso, acao, permitido)
      VALUES ($1, $2, 'acessar', TRUE)
      ON CONFLICT (id_perfil, recurso, acao) DO UPDATE SET permitido = TRUE
      `,
      [idPerfil, recurso],
    );
  }
}

async function findProfileByCargo(cargo) {
  const { rows } = await query('SELECT id_perfil, cargo FROM public.perfis WHERE cargo = $1', [cargo]);
  return rows[0] || null;
}

async function hasUsersLinkedToProfile(cargo) {
  const { rowCount } = await query('SELECT 1 FROM public.usuarios WHERE cargo = $1 LIMIT 1', [cargo]);
  return rowCount > 0;
}

async function deleteProfileByCargo(cargo) {
  const { rows, rowCount } = await query('DELETE FROM public.perfis WHERE cargo = $1 RETURNING cargo', [cargo]);
  return rowCount ? rows[0] : null;
}

async function listUserProfiles() {
  const { rows } = await query(`
    SELECT up.matricula_usuario, u.nome AS usuario_nome,
           up.id_perfil, p.nome_perfil, p.cargo, up.data_vinculo
    FROM public.usuarios_perfis up
    JOIN public.usuarios u ON u.matricula = up.matricula_usuario
    JOIN public.perfis p ON p.id_perfil = up.id_perfil
    ORDER BY up.matricula_usuario, up.id_perfil
  `);
  return rows;
}

async function listUserProfilesByMatricula(matricula) {
  const { rows } = await query(
    `
    SELECT up.matricula_usuario, u.nome AS usuario_nome,
           up.id_perfil, p.nome_perfil, p.cargo, up.data_vinculo
    FROM public.usuarios_perfis up
    JOIN public.usuarios u ON u.matricula = up.matricula_usuario
    JOIN public.perfis p ON p.id_perfil = up.id_perfil
    WHERE up.matricula_usuario = $1
    ORDER BY up.id_perfil
    `,
    [matricula],
  );
  return rows;
}

async function linkUserProfile(matricula, idPerfil) {
  const { rows } = await query(
    `
    INSERT INTO public.usuarios_perfis (matricula_usuario, id_perfil)
    VALUES ($1, $2)
    ON CONFLICT (matricula_usuario, id_perfil) DO NOTHING
    RETURNING matricula_usuario, id_perfil, data_vinculo
    `,
    [matricula, idPerfil],
  );
  return rows[0] || { matricula_usuario: matricula, id_perfil: idPerfil };
}

async function unlinkUserProfile(matricula, idPerfil) {
  const { rowCount } = await query(
    'DELETE FROM public.usuarios_perfis WHERE matricula_usuario = $1 AND id_perfil = $2',
    [matricula, idPerfil],
  );
  return rowCount > 0;
}

async function resolveStoreCode(codLoja) {
  const { rows } = await query('SELECT cod_loja FROM public.lojas WHERE cod_loja = $1', [codLoja]);
  return rows[0]?.cod_loja || null;
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
  return rows;
}

async function findStoreViewByCode(codLoja) {
  const { rows } = await query(
    `
    SELECT codigo_loja, nome_da_loja, cidade, uf, data_cadastro,
           quantidade_minima, quantidade_recomendada,
           "Quantidade atual", quantidade_atual,
           funcionario_matricula, funcionario_nome, funcionario_email, funcionario_cargo
    FROM public.vw_lojas_api
    WHERE codigo_loja = $1
    `,
    [codLoja],
  );
  return rows[0] || null;
}

async function deleteStoreByCode(codLoja) {
  const { rows, rowCount } = await query('DELETE FROM public.lojas WHERE cod_loja = $1 RETURNING cod_loja', [codLoja]);
  return rowCount ? rows[0] : null;
}

async function findStoreForShipment(codLoja) {
  const { rows } = await query(
    `
    SELECT codigo_loja, nome_da_loja, uf, quantidade_minima, quantidade_recomendada
    FROM public.vw_lojas_api
    WHERE codigo_loja = $1
    `,
    [codLoja],
  );
  return rows[0] || null;
}

async function upsertStore(client, payload) {
  await db(client).query(
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
      payload.codigo,
      payload.nome,
      payload.cidade,
      payload.uf,
      payload.dataCadastro,
      payload.quantidadeMinima,
      payload.quantidadeRecomendada,
    ],
  );
}

async function linkEmployeeToStore(client, payload) {
  const { rowCount } = await db(client).query(
    `
    UPDATE public.usuarios
    SET cod_loja = $1,
        loja_descricao = $2,
        loja_nome_manual = $3,
        loja_uf_manual = $4
    WHERE matricula = $5
    RETURNING matricula
    `,
    [payload.codigo, payload.descricao, payload.nome, payload.uf, payload.funcionario],
  );
  return rowCount > 0;
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

async function findInventoryByStore(codLoja) {
  const { rows } = await query(
    `
    SELECT cod_loja AS codigo_loja,
           quantidade_atual,
           TO_CHAR(atualizado_em, 'YYYY-MM-DD HH24:MI:SS') AS atualizado_em
    FROM public.estoque_lojas
    WHERE cod_loja = $1
    `,
    [codLoja],
  );
  return rows[0] || null;
}

async function deleteInventoryByStore(codLoja) {
  const { rows, rowCount } = await query(
    'DELETE FROM public.estoque_lojas WHERE cod_loja = $1 RETURNING cod_loja AS codigo_loja',
    [codLoja],
  );
  return rowCount ? rows[0] : null;
}

async function upsertInventory(client, codLoja, quantidadeAtual) {
  await db(client).query(
    `
    INSERT INTO public.estoque_lojas (cod_loja, quantidade_atual)
    VALUES ($1, $2)
    ON CONFLICT (cod_loja) DO UPDATE SET
      quantidade_atual = EXCLUDED.quantidade_atual,
      atualizado_em = NOW()
    `,
    [codLoja, quantidadeAtual],
  );
}

async function upsertInventoryReturning(codLoja, quantidadeAtual) {
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
  return rows[0];
}

async function ensureInventoryRow(client, codLoja) {
  await db(client).query(
    `
    INSERT INTO public.estoque_lojas (cod_loja, quantidade_atual)
    VALUES ($1, 0)
    ON CONFLICT (cod_loja) DO NOTHING
    `,
    [codLoja],
  );
}

async function applyInventoryDelta(client, codLoja, delta) {
  await db(client).query(
    `
    UPDATE public.estoque_lojas
    SET quantidade_atual = GREATEST(quantidade_atual + $1, 0),
        atualizado_em = NOW()
    WHERE cod_loja = $2
    `,
    [delta, codLoja],
  );
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
  return rows;
}

async function listShipmentCodes(prefix) {
  const { rows } = await query(
    'SELECT codigo_envio FROM public.envios_taloes WHERE codigo_envio LIKE $1',
    [`${prefix}%`],
  );
  return rows.map((row) => row.codigo_envio);
}

async function createShipment(payload) {
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
      payload.codigoEnvio,
      payload.codLoja,
      payload.matricula,
      payload.dataHoraEnvio,
      payload.dataEntregaPrevista,
      payload.quantidade,
      payload.quantidadeRecomendada,
      payload.quantidadeMinima,
      payload.prioridadeIa,
      payload.status,
      payload.insightIa,
    ],
  );
}

async function updateShipment(payload) {
  const { rowCount } = await query(
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
      payload.codLoja,
      payload.dataHoraEnvio,
      payload.dataEntregaPrevista,
      payload.quantidade,
      payload.quantidadeRecomendada,
      payload.quantidadeMinima,
      payload.prioridadeIa,
      payload.status,
      payload.insightIa,
      payload.idEnvio,
    ],
  );
  return rowCount > 0;
}

async function findShipmentViewByCode(codigoEnvio) {
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
  return rows[0] || null;
}

async function findShipmentViewByNumericId(idEnvio) {
  const { rows } = await query(
    `
    SELECT codigo_envio
    FROM public.envios_taloes
    WHERE id_envio = $1
    `,
    [idEnvio],
  );
  return rows[0] ? findShipmentViewByCode(rows[0].codigo_envio) : null;
}

async function findShipmentInternalByCode(client, codigoEnvio) {
  const { rows } = await db(client).query(
    `
    SELECT id_envio, codigo_envio, cod_loja, quantidade_enviada
    FROM public.envios_taloes
    WHERE codigo_envio = $1
    `,
    [codigoEnvio],
  );
  return rows[0] || null;
}

async function markShipmentAsReceived(client, idEnvio) {
  await db(client).query("UPDATE public.envios_taloes SET status = 'Recebido' WHERE id_envio = $1", [idEnvio]);
}

async function listReceipts() {
  const { rows } = await query(`
    SELECT id_recebimento, id_envio, cod_loja, matricula_usuario,
           data_hora_recebimento, quantidade_recebida,
           quantidade_divergencia, observacao
    FROM public.vw_recebimentos_api
    ORDER BY data_hora_recebimento DESC
  `);
  return rows;
}

async function listReceiptCodes(prefix) {
  const { rows } = await query(
    'SELECT codigo_recebimento FROM public.recebimentos_taloes WHERE codigo_recebimento LIKE $1',
    [`${prefix}%`],
  );
  return rows.map((row) => row.codigo_recebimento);
}

async function findReceiptByShipmentId(client, idEnvio) {
  const { rows } = await db(client).query(
    `
    SELECT id_recebimento, quantidade_recebida, codigo_recebimento
    FROM public.recebimentos_taloes
    WHERE id_envio = $1
    `,
    [idEnvio],
  );
  return rows[0] || null;
}

async function insertReceipt(client, payload) {
  await db(client).query(
    `
    INSERT INTO public.recebimentos_taloes (
      codigo_recebimento, id_envio, cod_loja, matricula_usuario,
      data_hora_recebimento, quantidade_recebida,
      quantidade_divergencia, observacao
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
    [
      payload.codigoRecebimento,
      payload.idEnvio,
      payload.codLoja,
      payload.matricula,
      payload.dataHoraRecebimento,
      payload.quantidadeRecebida,
      payload.divergencia,
      payload.observacao,
    ],
  );
}

async function updateReceipt(client, payload) {
  await db(client).query(
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
      payload.matricula,
      payload.dataHoraRecebimento,
      payload.quantidadeRecebida,
      payload.divergencia,
      payload.observacao,
      payload.idEnvio,
    ],
  );
}

async function findReceiptViewByCode(client, codigoRecebimento) {
  const { rows } = await db(client).query(
    `
    SELECT id_recebimento, id_envio, cod_loja, matricula_usuario,
           data_hora_recebimento, quantidade_recebida,
           quantidade_divergencia, observacao
    FROM public.vw_recebimentos_api
    WHERE id_recebimento = $1
    `,
    [codigoRecebimento],
  );
  return rows[0] || null;
}

async function findReceiptViewByNumericId(idRecebimento) {
  const { rows } = await query(
    `
    SELECT id_recebimento, id_envio, cod_loja, matricula_usuario,
           data_hora_recebimento, quantidade_recebida,
           quantidade_divergencia, observacao
    FROM public.vw_recebimentos_api
    WHERE id_recebimento = $1
    `,
    [idRecebimento],
  );
  return rows[0] || null;
}

async function listMaintenance() {
  const { rows } = await query(`
    SELECT m.id_manutencao,
           e.codigo_envio AS id_envio,
           m.matricula_usuario,
           TO_CHAR(m.data_hora_manutencao, 'YYYY-MM-DD HH24:MI:SS') AS data_hora_manutencao,
           m.motivo
    FROM public.manutencoes_taloes m
    JOIN public.envios_taloes e ON e.id_envio = m.id_envio
    ORDER BY m.data_hora_manutencao DESC
  `);
  return rows;
}

async function findMaintenanceById(idManutencao) {
  const { rows } = await query(
    `
    SELECT m.id_manutencao,
           e.codigo_envio AS id_envio,
           m.matricula_usuario,
           TO_CHAR(m.data_hora_manutencao, 'YYYY-MM-DD HH24:MI:SS') AS data_hora_manutencao,
           m.motivo
    FROM public.manutencoes_taloes m
    JOIN public.envios_taloes e ON e.id_envio = m.id_envio
    WHERE m.id_manutencao = $1
    `,
    [idManutencao],
  );
  return rows[0] || null;
}

async function createMaintenance(payload) {
  const { rows } = await query(
    `
    INSERT INTO public.manutencoes_taloes (id_envio, matricula_usuario, data_hora_manutencao, motivo)
    SELECT e.id_envio, $2, $3, $4
    FROM public.envios_taloes e
    WHERE e.codigo_envio = $1 OR e.id_envio::TEXT = $1
    RETURNING id_manutencao
    `,
    [payload.idEnvio, payload.matricula, payload.dataHoraManutencao, payload.motivo],
  );
  return rows[0] || null;
}

async function listHistory(filters = {}) {
  const params = [];
  const where = [];
  if (filters.codLoja) {
    params.push(filters.codLoja);
    where.push(`cod_loja = $${params.length}`);
  }
  if (filters.matricula) {
    params.push(filters.matricula);
    where.push(`matricula_usuario = $${params.length}`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { rows } = await query(
    `
    SELECT *
    FROM (
      SELECT 'envio' AS tipo, e.codigo_envio AS codigo, e.cod_loja, e.matricula_usuario,
             e.quantidade_enviada AS quantidade, e.status, e.observacao,
             e.data_hora_envio AS data_hora
      FROM public.envios_taloes e
      UNION ALL
      SELECT 'recebimento' AS tipo, r.codigo_recebimento AS codigo, r.cod_loja, r.matricula_usuario,
             r.quantidade_recebida AS quantidade, 'Recebido' AS status, r.observacao,
             r.data_hora_recebimento AS data_hora
      FROM public.recebimentos_taloes r
      UNION ALL
      SELECT 'manutencao' AS tipo, m.id_manutencao::TEXT AS codigo, e.cod_loja, m.matricula_usuario,
             NULL::INT AS quantidade, 'Manutencao' AS status, m.motivo AS observacao,
             m.data_hora_manutencao AS data_hora
      FROM public.manutencoes_taloes m
      JOIN public.envios_taloes e ON e.id_envio = m.id_envio
    ) historico
    ${whereSql}
    ORDER BY data_hora DESC
    `,
    params,
  );
  return rows;
}

async function countStores() {
  const { rows } = await query('SELECT COUNT(*)::INT AS total FROM public.lojas');
  return rows[0]?.total || 0;
}

async function listStockAlerts() {
  const { rows } = await query(`
    SELECT cod_loja, nome_loja, uf, quantidade_atual,
           quantidade_recomendada, quantidade_minima,
           status_estoque, prioridade_ordem
    FROM public.vw_estoque_alertas
    ORDER BY prioridade_ordem, cod_loja
  `);
  return rows;
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

async function insertSentReport(client, payload) {
  await db(client).query(
    `
    INSERT INTO public.relatorios_enviados (
      nome_usuario, tipo_relatorio, destinatario,
      assunto, status_envio, enviado_em, dados
    )
    VALUES ($1, $2, $3, $4, 'ENVIADO', $5, $6::jsonb)
    `,
    [
      payload.sender,
      payload.tipo,
      payload.destinatario,
      payload.assunto,
      payload.sentAt,
      JSON.stringify(payload.row),
    ],
  );
}

async function totalShipmentsBetween(start, end) {
  const { rows } = await query(
    `
    SELECT COALESCE(SUM(quantidade_enviada), 0) AS total
    FROM public.envios_taloes
    WHERE data_hora_envio >= $1 AND data_hora_envio < $2
    `,
    [start, end],
  );
  return rows[0]?.total || 0;
}

module.exports = {
  databaseHealth,
  withTransaction,
  listUsers,
  findUserForAuth,
  findUserPasswordHash,
  updateUserPassword,
  upsertUser,
  findUserViewByMatricula,
  deleteUserByMatricula,
  setUserStatus,
  replaceUserProfile,
  listProfiles,
  findProfileViewById,
  upsertProfile,
  replaceProfilePermissions,
  findProfileByCargo,
  hasUsersLinkedToProfile,
  deleteProfileByCargo,
  listUserProfiles,
  listUserProfilesByMatricula,
  linkUserProfile,
  unlinkUserProfile,
  resolveStoreCode,
  listStores,
  findStoreViewByCode,
  findStoreForShipment,
  upsertStore,
  linkEmployeeToStore,
  deleteStoreByCode,
  listDuplicateStores,
  listInventory,
  findInventoryByStore,
  upsertInventory,
  upsertInventoryReturning,
  deleteInventoryByStore,
  ensureInventoryRow,
  applyInventoryDelta,
  listShipments,
  listShipmentCodes,
  createShipment,
  updateShipment,
  findShipmentViewByCode,
  findShipmentViewByNumericId,
  findShipmentInternalByCode,
  markShipmentAsReceived,
  listReceipts,
  listReceiptCodes,
  findReceiptByShipmentId,
  insertReceipt,
  updateReceipt,
  findReceiptViewByCode,
  findReceiptViewByNumericId,
  listMaintenance,
  findMaintenanceById,
  createMaintenance,
  listHistory,
  countStores,
  listStockAlerts,
  listAnomalyReport,
  listWorkplaceNotifications,
  listSentReports,
  insertSentReport,
  totalShipmentsBetween,
};
