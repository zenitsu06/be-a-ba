const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const env = require('../config/env');
const repository = require('../repositories/oferte.repository');
const AppError = require('../utils/AppError');
const { readJsonFile } = require('../utils/files');
const { toCsv } = require('../utils/csv');
const {
  normalizePermissions,
  normalizeProfile,
  normalizeProfileSlug,
  normalizeReceipt,
  normalizeShipment,
  normalizeStore,
  normalizeUser,
  parseStoreCode,
  toNumber,
} = require('../utils/normalizers');

const CORE_PROFILE_SLUGS = new Set(['administrador', 'gestor', 'lojista']);

async function health() {
  try {
    return {
      ok: true,
      sistema: 'Oferte e Ganhe',
      banco: await repository.databaseHealth(),
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
  return (await repository.listUsers()).map(normalizeUser);
}

async function getUserByMatricula(matricula) {
  const user = await repository.findUserViewByMatricula(String(matricula || '').trim().toUpperCase());
  if (!user) throw new AppError('Usuario nao encontrado.', 404);
  return normalizeUser(user);
}

async function authenticate(matricula, senha) {
  const userCode = String(matricula || '').trim().toUpperCase();
  const row = await repository.findUserForAuth(userCode, senha || '');
  if (!row) throw new AppError('Matricula ou senha incorretas.', 401);
  if ((row.status || 'Ativo') === 'Inativo') {
    throw new AppError('Usuario inativo. Acesso bloqueado.', 403);
  }
  return normalizeUser(row, false);
}

async function saveUser(payload) {
  const required = ['nome', 'matricula', 'email', 'cargo'];
  const missing = required.filter((field) => !payload[field]);
  if (missing.length) throw new AppError(`Campos obrigatorios ausentes: ${missing.join(', ')}`);

  const matricula = String(payload.matricula).trim().toUpperCase();
  const cargo = normalizeProfileSlug(payload.cargo);
  const rawStoreCode = payload.cod_loja || payload.codigo_loja || parseStoreCode(payload.loja);
  const codLoja = rawStoreCode ? await repository.resolveStoreCode(String(rawStoreCode).trim().toUpperCase()) : null;
  const senha = String(payload.senha || '');
  const currentPasswordHash = await repository.findUserPasswordHash(matricula);

  if (!senha && !currentPasswordHash) throw new AppError('Senha do usuario e obrigatoria.');

  const saved = await repository.upsertUser({
    matricula,
    nome: String(payload.nome).trim(),
    email: String(payload.email).trim(),
    senha,
    cargo,
    codLoja,
    loja: payload.loja || '',
    lojaNome: payload.lojaNome || '',
    lojaUf: String(payload.lojaUf || '').trim().toUpperCase() || null,
    status: payload.status || 'Ativo',
    currentPasswordHash,
  });

  const profile = await repository.findProfileByCargo(cargo);
  if (profile) {
    await repository.replaceUserProfile(matricula, profile.id_perfil);
  }

  const user = await repository.findUserViewByMatricula(saved.matricula);
  return normalizeUser(user);
}

async function setUserStatus(matricula, status) {
  if (!['Ativo', 'Inativo'].includes(status)) {
    throw new AppError('Status invalido. Use Ativo ou Inativo.');
  }
  const saved = await repository.setUserStatus(String(matricula || '').trim().toUpperCase(), status);
  if (!saved) throw new AppError('Usuario nao encontrado.', 404);

  const user = await repository.findUserViewByMatricula(saved.matricula);
  return normalizeUser(user);
}

async function redefineUserPassword(matricula, novaSenha) {
  const userCode = String(matricula || '').trim().toUpperCase();
  const password = String(novaSenha || '').trim();
  if (!userCode || !password) throw new AppError('Matricula e nova senha sao obrigatorias.');
  if (password.length < 4) throw new AppError('A nova senha deve ter pelo menos 4 caracteres.');

  const updated = await repository.updateUserPassword(userCode, password);
  if (!updated) throw new AppError('Usuario nao encontrado.', 404);
  return { matricula: updated.matricula, senha_redefinida: true };
}

async function requestPasswordRecovery(email, matricula) {
  const identifier = String(matricula || '').trim().toUpperCase();
  if (identifier) {
    await getUserByMatricula(identifier);
  }
  return {
    enviado: true,
    email: email || null,
    matricula: identifier || null,
    codigo_teste: '123456',
    observacao: 'Fluxo local de demonstracao. Use o codigo 123456 para redefinir a senha.',
  };
}

async function deleteUser(matricula) {
  const deleted = await repository.deleteUserByMatricula(String(matricula || '').trim().toUpperCase());
  if (!deleted) throw new AppError('Usuario nao encontrado.', 404);
  return { matricula: deleted.matricula, excluido: true, observacao: 'Usuario marcado como Inativo para preservar historico.' };
}

async function listProfiles() {
  return (await repository.listProfiles()).map(normalizeProfile);
}

async function getProfileById(idPerfil) {
  const profile = await repository.findProfileViewById(idPerfil);
  if (!profile) throw new AppError('Perfil nao encontrado.', 404);
  return normalizeProfile(profile);
}

async function saveProfile(payload) {
  const nome = String(payload.nome_perfil || payload.nome || '').trim();
  const cargo = normalizeProfileSlug(payload.cargo || nome);
  const atribacoes = payload.atribacoes || payload.atribuicoes || ['dashboard'];

  if (!nome || !cargo) throw new AppError('Nome e cargo do perfil sao obrigatorios.');
  if (!Array.isArray(atribacoes)) throw new AppError('Atribuicoes do perfil devem ser uma lista.');

  return repository.withTransaction(async (client) => {
    const profile = await repository.upsertProfile(client, {
      nome,
      cargo,
      descricao: payload.descricao || `Perfil ${nome}`,
    });
    const permissions = normalizePermissions(atribacoes);
    await repository.replaceProfilePermissions(client, profile.id_perfil, permissions);
    return normalizeProfile({ ...profile, atribacoes: permissions });
  });
}

async function deleteProfile(cargo) {
  const cargoSlug = normalizeProfileSlug(cargo);
  if (!cargoSlug) throw new AppError('Cargo do perfil e obrigatorio.');
  if (CORE_PROFILE_SLUGS.has(cargoSlug)) {
    throw new AppError('Perfis base do sistema nao podem ser excluidos.', 409);
  }
  if (await repository.hasUsersLinkedToProfile(cargoSlug)) {
    throw new AppError('Perfil vinculado a usuario. Altere o cargo dos usuarios antes de excluir.', 409);
  }
  const deleted = await repository.deleteProfileByCargo(cargoSlug);
  if (!deleted) throw new AppError('Perfil nao encontrado.', 404);
  return { cargo: cargoSlug, excluido: true };
}

async function deleteProfileById(idPerfil) {
  const profile = await repository.findProfileViewById(idPerfil);
  if (!profile) throw new AppError('Perfil nao encontrado.', 404);
  return deleteProfile(profile.cargo);
}

async function listUserProfiles() {
  return repository.listUserProfiles();
}

async function listUserProfilesByMatricula(matricula) {
  return repository.listUserProfilesByMatricula(String(matricula || '').trim().toUpperCase());
}

async function linkUserProfile(payload) {
  const matricula = String(payload.matricula_usuario || payload.matricula || '').trim().toUpperCase();
  const idPerfil = toNumber(payload.id_perfil, -1);
  if (!matricula || idPerfil <= 0) throw new AppError('Matricula e id_perfil sao obrigatorios.');
  await getUserByMatricula(matricula);
  await getProfileById(idPerfil);
  await repository.linkUserProfile(matricula, idPerfil);
  return { matricula_usuario: matricula, id_perfil: idPerfil, vinculado: true };
}

async function unlinkUserProfile(matricula, idPerfil) {
  const userCode = String(matricula || '').trim().toUpperCase();
  const profileId = toNumber(idPerfil, -1);
  const removed = await repository.unlinkUserProfile(userCode, profileId);
  if (!removed) throw new AppError('Vinculo usuario-perfil nao encontrado.', 404);
  return { matricula_usuario: userCode, id_perfil: profileId, removido: true };
}

async function listStores() {
  return (await repository.listStores()).map(normalizeStore);
}

async function getStoreByCode(codigo) {
  const store = await repository.findStoreViewByCode(String(codigo || '').trim().toUpperCase());
  if (!store) throw new AppError('Loja nao encontrada.', 404);
  return normalizeStore(store);
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

  await repository.withTransaction(async (client) => {
    await repository.upsertStore(client, {
      codigo,
      nome,
      cidade: payload.cidade || null,
      uf,
      dataCadastro: payload.data_cadastro || new Date().toISOString().slice(0, 10),
      quantidadeMinima,
      quantidadeRecomendada,
    });
    await repository.upsertInventory(client, codigo, quantidadeAtual);

    const funcionario = String(payload.funcionario_matricula || '').trim().toUpperCase();
    if (funcionario) {
      const linked = await repository.linkEmployeeToStore(client, {
        codigo,
        nome,
        uf,
        funcionario,
        descricao: `${nome}${uf ? ` - ${uf}` : ''} (Cod: ${codigo})`,
      });
      if (!linked) throw new AppError('Funcionario informado nao foi encontrado.', 404);
    }
  });

  return normalizeStore(await repository.findStoreViewByCode(codigo));
}

async function deleteStore(codigo) {
  const deleted = await repository.deleteStoreByCode(String(codigo || '').trim().toUpperCase());
  if (!deleted) throw new AppError('Loja nao encontrada.', 404);
  return { codigo_loja: deleted.cod_loja, excluido: true };
}

async function listDuplicateStores() {
  return repository.listDuplicateStores();
}

async function listInventory() {
  return repository.listInventory();
}

async function getInventoryByStore(codigo) {
  const inventory = await repository.findInventoryByStore(String(codigo || '').trim().toUpperCase());
  if (!inventory) throw new AppError('Estoque da loja nao encontrado.', 404);
  return inventory;
}

async function updateInventory(payload) {
  const codLoja = String(payload.cod_loja || '').trim().toUpperCase();
  const quantidadeAtual = toNumber(payload.quantidade_atual, -1);
  if (!codLoja) throw new AppError('Codigo da loja e obrigatorio.');
  if (quantidadeAtual < 0) throw new AppError('Quantidade atual nao pode ser negativa.');

  const estoque = await repository.upsertInventoryReturning(codLoja, quantidadeAtual);
  let iaAtualizada = false;
  try {
    await runAiAnalysis();
    iaAtualizada = true;
  } catch (_error) {
    iaAtualizada = false;
  }
  return { estoque, ia_atualizada: iaAtualizada };
}

async function deleteInventory(codigo) {
  const deleted = await repository.deleteInventoryByStore(String(codigo || '').trim().toUpperCase());
  if (!deleted) throw new AppError('Estoque da loja nao encontrado.', 404);
  return { codigo_loja: deleted.codigo_loja, excluido: true };
}

async function listShipments() {
  return (await repository.listShipments()).map(normalizeShipment);
}

async function getShipment(idEnvio) {
  const id = String(idEnvio || '').trim();
  const shipment = id.startsWith('ENV-')
    ? await repository.findShipmentViewByCode(id)
    : await repository.findShipmentViewByNumericId(id);
  if (!shipment) throw new AppError('Envio nao encontrado.', 404);
  return normalizeShipment(shipment);
}

async function generateShipmentCode() {
  const year = new Date().getFullYear();
  const prefix = `ENV-${year}-`;
  const codes = await repository.listShipmentCodes(prefix);
  const maxSeq = codes.reduce((max, code) => {
    const seq = Number.parseInt(String(code || '').replace(prefix, ''), 10);
    return Number.isFinite(seq) ? Math.max(max, seq) : max;
  }, 0);
  return `${prefix}${String(maxSeq + 1).padStart(3, '0')}`;
}

async function generateReceiptCode() {
  const year = new Date().getFullYear();
  const prefix = `REC-${year}-`;
  const codes = await repository.listReceiptCodes(prefix);
  const maxSeq = codes.reduce((max, code) => {
    const seq = Number.parseInt(String(code || '').replace(prefix, ''), 10);
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

  const store = await repository.findStoreForShipment(codLoja);
  if (!store) throw new AppError('Loja nao encontrada.', 404);

  const ai = (await readAiAnalysis()).analises.find((item) => item.codigo_loja === codLoja) || {};
  const codigoEnvio = payload.id_envio || (await generateShipmentCode());

  await repository.createShipment({
    codigoEnvio,
    codLoja,
    matricula,
    dataHoraEnvio: payload.data_hora_envio || new Date(),
    dataEntregaPrevista: payload.data_entrega_prevista || new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
    quantidade,
    quantidadeRecomendada: ai.quantidade_sugerida || store.quantidade_recomendada || 0,
    quantidadeMinima: ai.quantidade_minima || store.quantidade_minima || 0,
    prioridadeIa: ai.prioridade || 'pendente',
    status: payload.status || 'Pendente',
    insightIa: ai.mensagem || 'Analise IA calculada pelo banco.',
  });

  return getShipmentByCode(codigoEnvio);
}

async function updateShipment(payload) {
  const idEnvio = String(payload.id_envio || '').trim();
  const codLoja = String(payload.cod_loja || '').trim().toUpperCase();
  const quantidade = toNumber(payload.quantidade_enviada);
  if (!idEnvio) throw new AppError('Codigo do envio e obrigatorio.');
  if (!codLoja || quantidade <= 0) throw new AppError('Loja e quantidade enviada sao obrigatorias.');

  const store = await repository.findStoreForShipment(codLoja);
  if (!store) throw new AppError('Loja nao encontrada.', 404);

  const ai = (await readAiAnalysis()).analises.find((item) => item.codigo_loja === codLoja) || {};
  const updated = await repository.updateShipment({
    idEnvio,
    codLoja,
    dataHoraEnvio: payload.data_hora_envio || new Date(),
    dataEntregaPrevista: payload.data_entrega_prevista || null,
    quantidade,
    quantidadeRecomendada: ai.quantidade_sugerida || store.quantidade_recomendada || 0,
    quantidadeMinima: ai.quantidade_minima || store.quantidade_minima || 0,
    prioridadeIa: ai.prioridade || 'pendente',
    status: payload.status || 'Pendente',
    insightIa: ai.mensagem || 'Analise IA calculada pelo banco.',
  });
  if (!updated) throw new AppError('Envio nao encontrado.', 404);
  return getShipmentByCode(idEnvio);
}

async function getShipmentByCode(codigoEnvio) {
  const shipment = await repository.findShipmentViewByCode(codigoEnvio);
  if (!shipment) throw new AppError('Envio nao encontrado.', 404);
  return normalizeShipment(shipment);
}

async function listReceipts() {
  return (await repository.listReceipts()).map(normalizeReceipt);
}

async function getReceipt(idRecebimento) {
  const receipt = await repository.findReceiptViewByNumericId(String(idRecebimento || '').trim());
  if (!receipt) throw new AppError('Recebimento nao encontrado.', 404);
  return normalizeReceipt(receipt);
}

async function createReceipt(payload) {
  const idEnvio = String(payload.id_envio || '').trim();
  const quantidadeRecebida = toNumber(payload.quantidade_recebida, -1);
  const matricula = String(payload.matricula_usuario || '').trim().toUpperCase();
  if (!idEnvio || quantidadeRecebida < 0 || !matricula) {
    throw new AppError('Envio, quantidade recebida e matricula sao obrigatorios.');
  }

  const codigoRecebimento = await generateReceiptCode();
  const receipt = await repository.withTransaction(async (client) => {
    const envio = await repository.findShipmentInternalByCode(client, idEnvio);
    if (!envio) throw new AppError('Envio nao encontrado.', 404);

    const receiptRow = await repository.findReceiptByShipmentId(client, envio.id_envio);
    const quantidadeAnterior = receiptRow ? toNumber(receiptRow.quantidade_recebida) : 0;
    const codigoFinal = receiptRow?.codigo_recebimento || codigoRecebimento;
    const divergencia = Math.abs(toNumber(envio.quantidade_enviada) - quantidadeRecebida);
    const dataHoraRecebimento = payload.data_hora_recebimento || new Date();
    const observacao = payload.observacao || '';

    if (receiptRow) {
      await repository.updateReceipt(client, {
        idEnvio: envio.id_envio,
        matricula,
        dataHoraRecebimento,
        quantidadeRecebida,
        divergencia,
        observacao,
      });
    } else {
      await repository.insertReceipt(client, {
        codigoRecebimento: codigoFinal,
        idEnvio: envio.id_envio,
        codLoja: envio.cod_loja,
        matricula,
        dataHoraRecebimento,
        quantidadeRecebida,
        divergencia,
        observacao,
      });
    }

    await repository.markShipmentAsReceived(client, envio.id_envio);
    await repository.ensureInventoryRow(client, envio.cod_loja);
    await repository.applyInventoryDelta(client, envio.cod_loja, quantidadeRecebida - quantidadeAnterior);

    return normalizeReceipt(await repository.findReceiptViewByCode(client, codigoFinal));
  });

  try {
    await runAiAnalysis();
  } catch (_error) {
    // Recebimento precisa persistir mesmo quando a IA Python estiver indisponivel.
  }

  return receipt;
}

async function readAiAnalysis() {
  const output = readJsonFile(env.ai.outputPath);
  if (output?.analises && Array.isArray(output.analises)) {
    try {
      const totalStores = await repository.countStores();
      if (toNumber(output.total_lojas, -1) === toNumber(totalStores, -2)) {
        return output;
      }
      return await runAiAnalysis();
    } catch (_error) {
      return output;
    }
  }

  const estoque = await repository.listStockAlerts();
  const analises = estoque.map((row) => {
    const atual = toNumber(row.quantidade_atual);
    const recomendado = toNumber(row.quantidade_recomendada);
    const minimo = toNumber(row.quantidade_minima);
    const reposicao = Math.max(recomendado - atual, 0);
    const prioridade = {
      CRITICO: 'Critico',
      ALERTA: 'Alerta',
      NA_MEDIA: 'Na media',
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

async function runAiAnalysis() {
  if (!fs.existsSync(env.ai.scriptPath)) {
    throw new AppError('Script Python de IA nao encontrado.', 500);
  }

  let lastError = null;
  for (const command of pythonCandidates()) {
    try {
      await runPython(command, [env.ai.scriptPath], { cwd: path.dirname(env.ai.scriptPath) });
      const output = readJsonFile(env.ai.outputPath);
      if (!output) throw new Error('Python executou, mas nao gerou ia_envio_taloes.json.');
      return output;
    } catch (error) {
      lastError = error;
    }
  }

  throw new AppError(`Falha ao executar IA Python: ${lastError?.message || 'Python nao encontrado.'}`, 500);
}

function pythonCandidates() {
  return [
    env.ai.pythonBin,
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python313', 'python.exe'),
    'python',
    'py',
  ].filter(Boolean);
}

function runPython(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || env.projectRoot,
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

async function listAnomalyReport() {
  return repository.listAnomalyReport();
}

async function listWorkplaceNotifications() {
  return repository.listWorkplaceNotifications();
}

async function listSentReports() {
  return repository.listSentReports();
}

async function listMaintenance() {
  return repository.listMaintenance();
}

async function getMaintenance(idManutencao) {
  const item = await repository.findMaintenanceById(idManutencao);
  if (!item) throw new AppError('Manutencao nao encontrada.', 404);
  return item;
}

async function createMaintenance(payload) {
  const idEnvio = String(payload.id_envio || payload.codigo_envio || '').trim();
  const matricula = String(payload.matricula_usuario || payload.matricula || '').trim().toUpperCase();
  const motivo = String(payload.motivo || payload.observacao || '').trim();
  if (!idEnvio || !matricula || !motivo) throw new AppError('Envio, matricula e motivo sao obrigatorios.');
  const created = await repository.createMaintenance({
    idEnvio,
    matricula,
    motivo,
    dataHoraManutencao: payload.data_hora_manutencao || new Date(),
  });
  if (!created) throw new AppError('Envio nao encontrado.', 404);
  return getMaintenance(created.id_manutencao);
}

async function listHistory() {
  return repository.listHistory();
}

async function listHistoryByStore(codigo) {
  return repository.listHistory({ codLoja: String(codigo || '').trim().toUpperCase() });
}

async function listHistoryByUser(matricula) {
  return repository.listHistory({ matricula: String(matricula || '').trim().toUpperCase() });
}

async function dashboardSummary() {
  const lojas = await listStores();
  const envios = await listShipments();
  const recebimentos = await listReceipts();
  const ia = await readAiAnalysis();
  const totalEnviado = envios.reduce((sum, item) => sum + toNumber(item.quantidade_enviada), 0);
  const totalRecebido = recebimentos.reduce((sum, item) => sum + toNumber(item.quantidade_recebida), 0);
  return {
    lojas: lojas.length,
    envios: envios.length,
    recebimentos: recebimentos.length,
    total_enviado: totalEnviado,
    total_recebido: totalRecebido,
    lojas_criticas: ia.resumo?.lojas_criticas || 0,
    lojas_alerta: ia.resumo?.lojas_alerta || 0,
  };
}

async function dashboardInventory() {
  const ia = await readAiAnalysis();
  return {
    resumo: ia.resumo,
    estoque: ia.analises,
    alertas: ia.alertas,
  };
}

async function dashboardShipments() {
  const envios = await listShipments();
  return {
    total: envios.length,
    pendentes: envios.filter((item) => item.status !== 'Recebido').length,
    recebidos: envios.filter((item) => item.status === 'Recebido').length,
    envios,
  };
}

async function currentAuthUser() {
  return { autenticado: true, observacao: 'JWT ainda nao foi ativado; use /auth/login para validar credenciais.' };
}

async function submitReport(payload) {
  const sender = payload.nome_usuario || payload.nome || 'Usuario';
  const rows = Array.isArray(payload.linhas) ? payload.linhas : [];
  const sentAt = new Date();

  await repository.withTransaction(async (client) => {
    for (const row of rows) {
      await repository.insertSentReport(client, {
        sender,
        tipo: payload.tipo || payload.tipo_relatorio || 'relatorio',
        destinatario: payload.destinatario || null,
        assunto: payload.assunto || null,
        sentAt,
        row,
      });
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

async function answerChatbot(question) {
  const pergunta = String(question || '').trim();
  if (!pergunta) return { resposta: 'Digite uma pergunta para consultar os indicadores.' };

  const iaResponse = await askIaChat(pergunta);
  if (iaResponse) return iaResponse;

  return answerLocalChatbot(pergunta);
}

async function askIaChat(pergunta) {
  const baseUrl = String(env.ai.serviceUrl || '').replace(/\/+$/, '');
  if (!baseUrl || typeof fetch !== 'function') return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.ai.serviceTimeoutMs);

  try {
    const response = await fetch(`${baseUrl}/chat/perguntar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pergunta }),
      signal: controller.signal,
    });
    if (!response.ok) return null;

    const data = await response.json();
    if (!data?.resposta) return null;

    return {
      resposta: data.resposta,
      fonte: data.fonte || 'camada_ia',
      intencao: data.intencao || null,
      periodo_inicio: data.periodo_inicio || null,
      periodo_fim: data.periodo_fim || null,
      kpis_considerados: data.kpis_considerados || [],
    };
  } catch (_error) {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function answerLocalChatbot(question) {
  const text = removeAccents(String(question || '').trim().toLowerCase());
  if (text.includes('abaixo do estoque') || text.includes('estoque minimo')) {
    const ai = await readAiAnalysis();
    const alertas = ai.alertas || [];
    if (!alertas.length) return { resposta: 'Nenhuma loja esta abaixo do estoque minimo no momento.' };
    const nomes = alertas.slice(0, 10).map((item) => `${item.nome_loja} (${item.uf || '-'})`).join(', ');
    return { resposta: `${alertas.length} loja(s) estao abaixo do estoque minimo: ${nomes}.` };
  }

  if (text.includes('taloes enviados') || text.includes('total de taloes')) {
    const start = new Date();
    start.setDate(start.getDate() - start.getDay() + 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    const total = await repository.totalShipmentsBetween(start, end);
    return { resposta: `O total de taloes enviados nesta semana e ${total}.` };
  }

  return { resposta: 'Ainda nao tenho uma resposta simulada para essa pergunta.' };
}

function removeAccents(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

module.exports = {
  AppError,
  answerChatbot,
  authenticate,
  createReceipt,
  createMaintenance,
  createShipment,
  currentAuthUser,
  dashboardInventory,
  dashboardShipments,
  dashboardSummary,
  deleteInventory,
  deleteProfile,
  deleteProfileById,
  deleteStore,
  deleteUser,
  getInventoryByStore,
  getMaintenance,
  getProfileById,
  getReceipt,
  getShipment,
  getStoreByCode,
  getUserByMatricula,
  health,
  listAnomalyReport,
  listDuplicateStores,
  listHistory,
  listHistoryByStore,
  listHistoryByUser,
  listInventory,
  listMaintenance,
  listProfiles,
  listReceipts,
  listSentReports,
  listShipments,
  listStores,
  listUserProfiles,
  listUserProfilesByMatricula,
  listUsers,
  listWorkplaceNotifications,
  linkUserProfile,
  readAiAnalysis,
  redefineUserPassword,
  requestPasswordRecovery,
  runAiAnalysis,
  reportRows,
  saveProfile,
  saveStore,
  saveUser,
  setUserStatus,
  submitReport,
  toCsv,
  unlinkUserProfile,
  updateInventory,
  updateShipment,
};
