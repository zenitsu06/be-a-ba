const API_BASE = window.OFERTE_CONFIG?.API_BASE || 'http://localhost:8000';
const CHAVE_LOJAS_LOCAL = 'lojasJsonAtualizado';
const CHAVE_TALOES_LOCAL = 'taloesJsonAtualizado';
const TEMPO_INATIVIDADE_MS = 10 * 60 * 1000;
const tokenSessao = Math.random().toString(36).substring(2);

let timeoutInatividade;
let lojasDashboard = [];
let analisesIA = [];
let resumoIA = null;

const recebidos_taloes_mock = [1200, 1500, 1100, 1800, 1400];

document.addEventListener('DOMContentLoaded', async () => {
    iniciarSeguranca();
    await carregarDadosDashboard();
    renderizarGraficosELojas();
});

function iniciarSeguranca() {
    const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
    if (!usuarioLogado || !window.OfertePermissions?.has('dashboard')) {
        window.location.href = '../login/login.html';
        return;
    }

    document.getElementById('nome-admin').innerText = usuarioLogado.nome;

    sessionStorage.setItem('tokenSessaoAtiva', tokenSessao);
    localStorage.setItem('tokenControleAdmin', tokenSessao);

    window.addEventListener('storage', (e) => {
        if (e.key === 'tokenControleAdmin' && e.newValue !== sessionStorage.getItem('tokenSessaoAtiva')) {
            alert('Uma nova sessão de Administrador foi iniciada em outra aba. Esta será encerrada.');
            deslogar();
        }
    });

    resetarTimer();
    window.addEventListener('mousemove', resetarTimer);
    window.addEventListener('keydown', resetarTimer);

    document.getElementById('btn-sair').addEventListener('click', deslogar);
}

function resetarTimer() {
    clearTimeout(timeoutInatividade);
    timeoutInatividade = setTimeout(() => {
        alert('Sessão expirada por inatividade.');
        deslogar();
    }, TEMPO_INATIVIDADE_MS);
}

function deslogar() {
    localStorage.removeItem('usuarioLogado');
    window.location.href = '../login/login.html';
}

async function carregarDadosDashboard() {
    carregarCardsRegionais();
    await carregarLojasEIA();
}

function carregarCardsRegionais() {
    const historico = JSON.parse(localStorage.getItem('historicoRecebimento') || '[]');
    const totaisUF = { RS: 420, SC: 260, PR: 190, MS: 145, SP: 310 };
    let totalMesAtual = Object.values(totaisUF).reduce((soma, valor) => soma + valor, 0);

    historico.forEach(item => {
        if (item.status === 'Recebido') {
            const recebidos = Number(item.recebidos || 0);
            totalMesAtual += recebidos;
            totaisUF.RS += recebidos;
        }
    });

    document.getElementById('val-RS').innerText = totaisUF.RS;
    document.getElementById('val-SC').innerText = totaisUF.SC;
    document.getElementById('val-PR').innerText = totaisUF.PR;
    document.getElementById('val-MS').innerText = totaisUF.MS;
    document.getElementById('val-SP').innerText = totaisUF.SP;

    window.dadosGraficoBarras = [...recebidos_taloes_mock, totalMesAtual, 0, 0, 0, 0, 0, 0];
}

async function carregarLojasEIA() {
    const lojasApi = await apiGet('/api/lojas');
    const estoqueApi = await apiGet('/api/estoque');

    if (lojasApi?.lojas) {
        lojasDashboard = aplicarEstoqueNasLojas(lojasApi.lojas, estoqueApi?.estoque_lojas || []);
        localStorage.setItem(CHAVE_LOJAS_LOCAL, JSON.stringify({
            lojas: lojasDashboard,
            estoque_lojas: estoqueApi?.estoque_lojas || []
        }));
    } else {
        const locais = JSON.parse(localStorage.getItem(CHAVE_LOJAS_LOCAL) || 'null');
        if (locais?.lojas) {
            lojasDashboard = aplicarEstoqueNasLojas(locais.lojas, locais.estoque_lojas || []);
        } else {
            const dados = await fetchJson('../dados/lojas.json', { lojas: [], estoque_lojas: [] });
            lojasDashboard = aplicarEstoqueNasLojas(dados.lojas || [], dados.estoque_lojas || []);
            localStorage.setItem(CHAVE_LOJAS_LOCAL, JSON.stringify(dados));
        }
    }

    const dadosIA = await apiGet('/api/ia/envio-taloes') || await fetchJson('../dados/ia_envio_taloes.json', {});
    analisesIA = dadosIA.analises || [];
    resumoIA = dadosIA.resumo || null;
}

function renderizarGraficosELojas() {
    renderizarGraficoBarras();
    renderizarGraficoPizza();
    renderizarTabelaEstoqueBaixo();
    renderizarSugestaoIA();
}

function renderizarGraficoBarras() {
    const ctxBar = document.getElementById('barChart').getContext('2d');
    new Chart(ctxBar, {
        type: 'bar',
        data: {
            labels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'],
            datasets: [{
                label: 'Talões Recebidos',
                data: window.dadosGraficoBarras,
                backgroundColor: '#00b087',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } }
        }
    });
}

function renderizarGraficoPizza() {
    const baixos = obterLojasEstoqueBaixo().length;
    const ok = Math.max(lojasDashboard.length - baixos, 0);
    const ctxPie = document.getElementById('pieChart').getContext('2d');

    new Chart(ctxPie, {
        type: 'doughnut',
        data: {
            labels: ['Crítico / Alerta', 'Na média / Cheio'],
            datasets: [{
                data: [baixos, ok],
                backgroundColor: ['#b91c1c', '#00b087'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '65%',
            plugins: { legend: { position: 'bottom' } }
        }
    });
}

function renderizarTabelaEstoqueBaixo() {
    const corpo = document.getElementById('tabela-estoque-baixo');
    const linhas = obterLojasEstoqueBaixo();
    const pagina = window.OfertePagination?.pagina('estoque-baixo', linhas) || {
        itens: linhas,
        totalItens: linhas.length,
        itensPorPagina: linhas.length || 1,
        totalPaginas: 1,
        paginaAtual: 1
    };
    corpo.innerHTML = '';

    pagina.itens.forEach(loja => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${loja.codigo_loja}</strong></td>
            <td>${loja.nome_da_loja}</td>
            <td>${loja.uf}</td>
            <td>${loja.quantidade_recomendada}</td>
            <td>${loja.quantidade_atual}</td>
            <td><span class="priority-badge ${classePrioridade(loja.estado_estoque)}">${loja.estado_estoque}</span></td>
        `;
        corpo.appendChild(tr);
    });

    if (!linhas.length) {
        corpo.innerHTML = '<tr><td colspan="6">Nenhuma loja em estado crítico ou alerta.</td></tr>';
    }

    window.OfertePagination?.renderizar('paginacao-estoque-baixo', 'estoque-baixo', pagina, renderizarTabelaEstoqueBaixo);
}

function renderizarSugestaoIA() {
    const texto = document.getElementById('texto-ia-admin');
    const criticasBase = obterLojasEstoqueBaixo()
        .filter(loja => loja.estado_estoque === 'Crítico');
    const criticas = criticasBase.slice(0, 8);

    if (!criticasBase.length) {
        texto.innerText = [
            `Análise concluída em ${formatarDataHoraVisual(new Date())}`,
            'Nenhuma loja em estado crítico no momento.',
            'Não há reposição urgente recomendada pela IA.'
        ].join('\n');
        return;
    }

    const prioridadeMaxima = criticas.map(loja => `${loja.nome_da_loja} (${loja.uf || '-'})`).join(', ');
    const ocultas = criticasBase.length > criticas.length
        ? `\n+ ${criticasBase.length - criticas.length} loja(s) crítica(s) fora da prévia.`
        : '';
    texto.innerText = [
        `Análise concluída em ${formatarDataHoraVisual(new Date())}`,
        `Quantidade de lojas em estado crítico: ${criticasBase.length}`,
        `Reposição urgente: ${prioridadeMaxima}${ocultas}`
    ].join('\n');
}

function obterLojasEstoqueBaixo() {
    return lojasDashboard
        .map(loja => {
            const analise = buscarAnaliseIA(loja.codigo_loja);
            const quantidadeAtual = Number(loja.quantidade_atual ?? loja['Quantidade atual'] ?? analise.estoque_atual ?? 0);
            const estado = calcularEstadoEstoque({ ...loja, quantidade_atual: quantidadeAtual })
                || normalizarPrioridadeTexto(analise.prioridade, analise.classe_css);
            return {
                ...loja,
                quantidade_atual: quantidadeAtual,
                estado_estoque: estado
            };
        })
        .filter(loja => loja.estado_estoque === 'Crítico' || loja.estado_estoque === 'Alerta')
        .sort((a, b) => {
            const peso = { 'Crítico': 2, 'Alerta': 1 };
            return (peso[b.estado_estoque] || 0) - (peso[a.estado_estoque] || 0)
                || Number(a.quantidade_atual || 0) - Number(b.quantidade_atual || 0);
        });
}

function calcularEstadoEstoque(loja) {
    const atual = Number(loja.quantidade_atual ?? loja['Quantidade atual'] ?? 0);
    const minimo = Number(loja.quantidade_minima || 0);
    const recomendado = Number(loja.quantidade_recomendada || Math.max(minimo * 3, 1));
    if (atual <= minimo) return 'Crítico';
    if (atual < recomendado) return 'Alerta';
    if (atual <= recomendado * 1.15) return 'Na média';
    return 'Cheio';
}

function normalizarPrioridadeTexto(prioridade, classe = '') {
    const valor = String(prioridade || classe || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
    if (valor.includes('crit') || valor.includes('prioridade') || valor.includes('alta')) return 'Crítico';
    if (valor.includes('alert') || valor.includes('baixo')) return 'Alerta';
    if (valor.includes('média') || valor.includes('media')) return 'Na média';
    if (valor.includes('cheio') || valor.includes('baixa')) return 'Cheio';
    return '';
}

function classePrioridade(prioridade) {
    const valor = String(prioridade || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
    if (valor.includes('crit')) return 'critico';
    if (valor.includes('alert')) return 'alerta';
    if (valor.includes('media')) return 'media';
    if (valor.includes('cheio')) return 'cheio';
    return '';
}

function buscarAnaliseIA(codigoLoja) {
    return analisesIA.find(item => item.codigo_loja === codigoLoja) || {};
}

function aplicarEstoqueNasLojas(listaLojas, listaEstoque) {
    const estoquePorLoja = Object.fromEntries(
        (listaEstoque || []).map(item => [String(item.codigo_loja || '').toUpperCase(), Number(item.quantidade_atual || 0)])
    );

    return (listaLojas || []).map(loja => {
        const codigo = String(loja.codigo_loja || '').toUpperCase();
        const quantidade = codigo in estoquePorLoja
            ? estoquePorLoja[codigo]
            : Number(loja.quantidade_atual ?? loja['Quantidade atual'] ?? 0);
        return {
            ...loja,
            quantidade_atual: quantidade,
            'Quantidade atual': quantidade
        };
    });
}

async function apiGet(route) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 800);
    try {
        const response = await fetch(`${API_BASE}${route}`, { signal: controller.signal });
        if (!response.ok) return null;
        return await response.json();
    } catch (erro) {
        return null;
    } finally {
        clearTimeout(timeout);
    }
}

async function fetchJson(url, fallback) {
    try {
        const response = await fetch(url);
        if (!response.ok) return fallback;
        return await response.json();
    } catch (erro) {
        return fallback;
    }
}

function formatarDataHoraVisual(data) {
    return new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).format(data);
}
