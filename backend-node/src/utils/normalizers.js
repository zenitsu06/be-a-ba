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

module.exports = {
  toNumber,
  normalizeProfileSlug,
  normalizePermissions,
  parseStoreCode,
  normalizeUser,
  normalizeProfile,
  normalizeStore,
  normalizeShipment,
  normalizeReceipt,
};
