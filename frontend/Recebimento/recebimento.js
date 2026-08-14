const API_BASE = window.OFERTE_CONFIG?.API_BASE || 'http://localhost:8000';
const CHAVE_TALOES_LOCAL = 'taloesJsonAtualizado';
const CHAVE_LOJAS_LOCAL = 'lojasJsonAtualizado';

let usuarioLogado = null;
let enviosTaloes = [];
let recebimentosTaloes = [];
let lojas = [];
let anomaliasIA = [];
let linhasRecebimento = [];

document.addEventListener('DOMContentLoaded', async () => {
    if (!validarAcessoRecebimento()) return;
    await carregarDadosRecebimento();
    renderizarTelaRecebimento();
    inicializarEventosRecebimento();
});

function validarAcessoRecebimento() {
    usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado') || 'null');
    const cargo = normalizarTexto(usuarioLogado?.cargo);
    const permitido = cargo === 'administrador' || window.OfertePermissions?.has('recebimentos');

    if (!usuarioLogado || !permitido) {
        window.location.href = '../login/login.html';
        return false;
    }

    const nomeAdmin = document.getElementById('nome-admin');
    if (nomeAdmin) nomeAdmin.innerText = usuarioLogado.nome || 'Administrador';
    document.getElementById('btn-sair')?.addEventListener('click', deslogar);
    return true;
}

function deslogar() {
    localStorage.removeItem('usuarioLogado');
    window.location.href = '../login/login.html';
}

async function carregarDadosRecebimento() {
    const enviosApi = await apiGet('/api/envios');
    const recebimentosApi = await apiGet('/api/recebimentos');
    const lojasApi = await apiGet('/api/lojas');
    const iaApi = await apiGet('/api/ia/envio-taloes');

    if (enviosApi?.envios_taloes) {
        enviosTaloes = enviosApi.envios_taloes;
        recebimentosTaloes = recebimentosApi?.recebimentos_taloes || [];
        salvarTaloesLocal();
    } else {
        const taloesLocal = JSON.parse(localStorage.getItem(CHAVE_TALOES_LOCAL) || 'null');
        if (taloesLocal?.envios_taloes) {
            enviosTaloes = taloesLocal.envios_taloes || [];
            recebimentosTaloes = taloesLocal.recebimentos_taloes || [];
        } else {
            const dadosTaloes = await fetchJson('../dados/taloes.json', { envios_taloes: [], recebimentos_taloes: [] });
            enviosTaloes = dadosTaloes.envios_taloes || [];
            recebimentosTaloes = dadosTaloes.recebimentos_taloes || [];
        }
    }

    if (lojasApi?.lojas) {
        lojas = lojasApi.lojas;
    } else {
        const lojasLocal = JSON.parse(localStorage.getItem(CHAVE_LOJAS_LOCAL) || 'null');
        lojas = lojasLocal?.lojas || (await fetchJson('../dados/lojas.json', { lojas: [] })).lojas || [];
    }

    const dadosIA = iaApi || await fetchJson('../dados/ia_envio_taloes.json', {});
    anomaliasIA = dadosIA.anomalias_recebimento || [];
}

function renderizarTelaRecebimento() {
    linhasRecebimento = montarLinhasRecebimento();
    renderizarMetricas();
    renderizarCardIA();
    renderizarTabelaRecebimento();
}

function inicializarEventosRecebimento() {
    document.getElementById('busca-recebimento')?.addEventListener('input', () => {
        window.OfertePagination?.resetar('recebimento');
        renderizarTabelaRecebimento();
    });
    document.getElementById('filtro-status')?.addEventListener('change', () => {
        window.OfertePagination?.resetar('recebimento');
        renderizarTabelaRecebimento();
    });
    document.getElementById('btn-exportar-recebimentos')?.addEventListener('click', exportarRelatorioRecebimentos);

    window.addEventListener('storage', (evento) => {
        if (evento.key === CHAVE_TALOES_LOCAL) recarregarDadosLocais();
    });

    window.addEventListener('focus', recarregarDadosLocais);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) recarregarDadosLocais();
    });
}

function recarregarDadosLocais() {
    const taloesLocal = JSON.parse(localStorage.getItem(CHAVE_TALOES_LOCAL) || 'null');
    if (!taloesLocal?.envios_taloes) return;

    enviosTaloes = taloesLocal.envios_taloes || [];
    recebimentosTaloes = taloesLocal.recebimentos_taloes || [];
    renderizarTelaRecebimento();
}

function montarLinhasRecebimento() {
    const recebimentosPorEnvio = new Map(
        recebimentosTaloes.map(item => [normalizarCodigo(item.id_envio), item])
    );
    const recebidosValidos = recebimentosTaloes
        .map(item => Number(item.quantidade_recebida || 0))
        .filter(valor => valor > 0);
    const mediaRecebida = recebidosValidos.length
        ? recebidosValidos.reduce((soma, valor) => soma + valor, 0) / recebidosValidos.length
        : 0;

    return enviosTaloes.map(envio => {
        const recebimento = recebimentosPorEnvio.get(normalizarCodigo(envio.id_envio));
        const loja = buscarLoja(envio.cod_loja);
        const quantidadeEnviada = Number(envio.quantidade_enviada || 0);
        const quantidadeRecebida = recebimento ? Number(recebimento.quantidade_recebida || 0) : null;
        const divergencia = recebimento
            ? Number(recebimento.quantidade_divergencia ?? Math.abs(quantidadeEnviada - quantidadeRecebida))
            : null;
        const status = recebimento ? 'recebido' : 'pendente';
        const analise = detectarAnomaliaRecebimento(envio, recebimento, loja, mediaRecebida, divergencia);

        return {
            dataEnvio: formatarDataTabela(envio.data_hora_envio),
            dataRecebimento: recebimento?.data_hora_recebimento ? formatarDataTabela(recebimento.data_hora_recebimento) : '-',
            remessa: envio.id_envio,
            codigoLoja: envio.cod_loja || loja?.codigo_loja || '-',
            loja: envio.loja_nome || loja?.nome_da_loja || envio.cod_loja || '-',
            uf: envio.loja_uf || loja?.uf || '-',
            quantidadeEnviada,
            quantidadeRecebida,
            recebimentoTexto: quantidadeRecebida === null ? 'Pendente' : quantidadeRecebida,
            divergenciaTexto: divergencia === null ? '-' : divergencia,
            status,
            statusTexto: status === 'recebido' ? 'Recebido' : 'Pendente',
            observacao: recebimento?.observacao || envio.observacao || '',
            analise,
            temAnomalia: analise.nivel === 'divergencia'
        };
    }).sort((a, b) => {
        const peso = { divergencia: 3, aguardando: 2, normal: 1 };
        return (peso[b.analise.nivel] || 0) - (peso[a.analise.nivel] || 0)
            || normalizarDataOrdenacao(b.dataEnvio) - normalizarDataOrdenacao(a.dataEnvio);
    });
}

function detectarAnomaliaRecebimento(envio, recebimento, loja, mediaRecebida, divergencia) {
    if (!recebimento) {
        return {
            nivel: 'aguardando',
            titulo: 'Aguardando',
            descricao: 'Esperando o recebimento do lojista para fazer a analise.'
        };
    }

    if (Number(divergencia || 0) > 0) {
        return {
            nivel: 'divergencia',
            titulo: 'Divergencia',
            descricao: `Divergencia de ${divergencia} taloes.`
        };
    }

    return {
        nivel: 'normal',
        titulo: 'normal',
        descricao: 'Sem divergencia identificada.'
    };
}

function renderizarMetricas() {
    const recebidas = linhasRecebimento.filter(item => item.status === 'recebido').length;
    const pendentes = linhasRecebimento.filter(item => item.status === 'pendente').length;
    const anomalias = linhasRecebimento.filter(item => item.temAnomalia).length;

    document.getElementById('total-envios').innerText = linhasRecebimento.length;
    document.getElementById('total-recebidas').innerText = recebidas;
    document.getElementById('total-pendentes').innerText = pendentes;
    document.getElementById('total-anomalias').innerText = anomalias;
}

function renderizarCardIA() {
    const texto = document.getElementById('texto-ia-recebimento');
    const status = document.getElementById('ia-status');
    const anomalias = linhasRecebimento.filter(item => item.temAnomalia);

    if (!anomalias.length) {
        status.innerText = 'Sem anomalias';
        texto.innerText = 'Nenhuma remessa recebida apresenta divergencia no momento. Remessas pendentes ficam como Aguardando ate o lojista confirmar o recebimento.';
        return;
    }

    const principal = anomalias[0];
    status.innerText = `${anomalias.length} divergencia(s)`;
    texto.innerText = [
        `${anomalias.length} remessa(s) com divergencia no recebimento.`,
        `Principal atencao: ${principal.loja} (${principal.uf}) - ${principal.analise.titulo}.`,
        principal.analise.descricao
    ].join('\n');
}

function renderizarTabelaRecebimento() {
    const corpo = document.getElementById('tabela-recebimento-corpo');
    const linhas = obterLinhasFiltradas();
    const pagina = window.OfertePagination?.pagina('recebimento', linhas) || {
        itens: linhas,
        totalItens: linhas.length,
        itensPorPagina: linhas.length || 1,
        totalPaginas: 1,
        paginaAtual: 1
    };
    corpo.innerHTML = '';

    pagina.itens.forEach(item => {
        const tr = document.createElement('tr');
        const statusClasse = item.status === 'recebido' ? 'recebido' : 'pendente';

        tr.innerHTML = `
            <td>${item.dataEnvio}</td>
            <td><strong>${item.remessa}</strong></td>
            <td>${item.loja}</td>
            <td>${item.uf}</td>
            <td>${item.quantidadeEnviada}</td>
            ${montarCelulaRecebimento(item)}
            <td>${item.divergenciaTexto}</td>
            <td><span class="receipt-status ${statusClasse}">${item.statusTexto}</span></td>
            ${montarCelulaAnaliseIA(item.analise)}
        `;
        corpo.appendChild(tr);
    });

    if (!linhas.length) {
        corpo.innerHTML = '<tr><td colspan="9">Nenhuma remessa encontrada.</td></tr>';
    }

    window.OfertePagination?.renderizar('paginacao-recebimento', 'recebimento', pagina, renderizarTabelaRecebimento);
}

function montarCelulaRecebimento(item) {
    return `
        <td>
            <span class="receipt-value" style="font-weight: 400;">${item.recebimentoTexto}</span>
            <small class="muted-cell">${item.dataRecebimento}</small>
        </td>
    `;
}

function montarCelulaAnaliseIA(analise) {
    const analiseNormalizada = normalizarAnaliseIA(analise);
    return `
        <td>
            <span class="receipt-anomaly ${analiseNormalizada.nivel}" title="${escaparAtributo(analiseNormalizada.descricao)}">
                ${analiseNormalizada.titulo}
            </span>
        </td>
    `;
}

function normalizarAnaliseIA(analise) {
    const nivel = ['divergencia', 'aguardando', 'normal'].includes(analise?.nivel)
        ? analise.nivel
        : 'normal';
    const titulos = {
        divergencia: 'Divergencia',
        aguardando: 'Aguardando',
        normal: 'normal'
    };

    return {
        nivel,
        titulo: titulos[nivel],
        descricao: analise?.descricao || titulos[nivel]
    };
}

function obterLinhasFiltradas() {
    const termo = normalizarTexto(document.getElementById('busca-recebimento')?.value || '');
    const filtro = document.getElementById('filtro-status')?.value || '';

    return linhasRecebimento.filter(item => {
        const texto = normalizarTexto(`${item.dataEnvio} ${item.remessa} ${item.loja} ${item.uf} ${item.statusTexto} ${item.analise.titulo}`);
        const passaBusca = texto.includes(termo);
        const passaFiltro = !filtro
            || item.status === filtro
            || (filtro === 'anomalia' && item.temAnomalia);
        return passaBusca && passaFiltro;
    });
}

function exportarRelatorioRecebimentos() {
    const linhasPadrao = obterLinhasFiltradas().map(item => {
        const loja = buscarLoja(item.codigoLoja);
        return window.OferteReports?.normalizarLinhaRelatorioEstoque
            ? window.OferteReports.normalizarLinhaRelatorioEstoque(item, usuarioLogado, {
                quantidade_enviada_estoque: item.quantidadeEnviada,
                quantidade_recomendada: loja?.quantidade_recomendada,
                quantidade_minima: loja?.quantidade_minima,
                status_prioridade_loja: item.analise?.titulo || item.statusTexto,
                divergencia: item.divergenciaTexto
            })
            : item;
    });

    if (window.OferteReports?.exportarCsv) {
        window.OferteReports.exportarCsv({
            nome: 'Relatorio de recebimento de taloes',
            origem: 'Recebimento',
            arquivo: 'recebimento-taloes.csv',
            usuario: usuarioLogado,
            linhas: linhasPadrao,
            colunas: window.OferteReports?.colunasRelatorioEstoque?.() || []
        });
    }
    return;

    const linhas = obterLinhasFiltradas().map(item => ({
        data_envio: item.dataEnvio,
        remessa: item.remessa,
        loja: item.loja,
        uf: item.uf,
        quantidade_enviada: item.quantidadeEnviada,
        quantidade_recebida: item.recebimentoTexto,
        divergencia: item.divergenciaTexto,
        status: item.statusTexto,
        analise_ia: item.analise.titulo,
        detalhe_ia: item.analise.descricao
    }));

    if (window.OferteReports?.exportarCsv) {
        window.OferteReports.exportarCsv({
            nome: 'Relatório de recebimento de talões',
            origem: 'Recebimento',
            arquivo: 'recebimento-taloes.csv',
            usuario: usuarioLogado,
            linhas,
            colunas: [
                ['data_envio', 'Data de envio'],
                ['remessa', 'Remessa'],
                ['loja', 'Loja'],
                ['uf', 'UF'],
                ['quantidade_enviada', 'Qnt. enviada'],
                ['quantidade_recebida', 'Recebimento'],
                ['divergencia', 'Divergência'],
                ['status', 'Status'],
                ['analise_ia', 'Análise IA'],
                ['detalhe_ia', 'Detalhe IA']
            ]
        });
    }
}

function buscarLoja(codigoLoja) {
    const codigo = normalizarCodigo(codigoLoja);
    return lojas.find(loja => normalizarCodigo(loja.codigo_loja) === codigo) || null;
}

function buscarAnomaliaIA(envio, loja) {
    const idEnvio = normalizarCodigo(envio.id_envio);
    const codigoLoja = normalizarCodigo(envio.cod_loja || loja?.codigo_loja);
    return anomaliasIA.find(item => {
        const descricao = normalizarCodigo(item.descricao);
        return descricao.includes(idEnvio) || normalizarCodigo(item.codigo_loja) === codigoLoja;
    });
}

function normalizarCodigo(valor) {
    return String(valor || '').trim().toUpperCase();
}

function normalizarTexto(valor) {
    return String(valor || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
}

function formatarDataTabela(valor) {
    if (!valor) return '-';
    const data = new Date(String(valor).replace(' ', 'T'));
    if (Number.isNaN(data.getTime())) return valor;
    return data.toLocaleDateString('pt-BR');
}

function normalizarDataOrdenacao(valor) {
    const partes = String(valor || '').split('/');
    if (partes.length !== 3) return 0;
    return new Date(`${partes[2]}-${partes[1]}-${partes[0]}T00:00:00`).getTime() || 0;
}

function escaparAtributo(valor) {
    return String(valor || '').replace(/"/g, '&quot;');
}

function salvarTaloesLocal() {
    localStorage.setItem(CHAVE_TALOES_LOCAL, JSON.stringify({
        envios_taloes: enviosTaloes,
        recebimentos_taloes: recebimentosTaloes
    }));
}

async function fetchJson(url, fallback) {
    try {
        const resposta = await fetch(url);
        if (!resposta.ok) throw new Error('Falha ao carregar JSON');
        return await resposta.json();
    } catch (erro) {
        return fallback;
    }
}

async function apiGet(route) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 800);
    try {
        const resposta = await fetch(`${API_BASE}${route}`, { signal: controller.signal });
        clearTimeout(timeout);
        if (!resposta.ok) return null;
        return await resposta.json();
    } catch (erro) {
        clearTimeout(timeout);
        return null;
    }
}
