const API_BASE = window.OFERTE_CONFIG?.API_BASE || 'http://localhost:8000';
const CHAVE_TALOES_LOCAL = 'taloesJsonAtualizado';
const CHAVE_LOJAS_LOCAL = 'lojasJsonAtualizado';

let usuarioLogado = null;
let lojas = [];
let enviosTaloes = [];
let recebimentosTaloes = [];
let analisesIA = [];
let resumoIA = null;

document.addEventListener('DOMContentLoaded', async () => {
    iniciarGestor();
    await carregarDadosGestor();
    renderizarResumoIA();
    renderizarGraficoEstoque();
    renderizarTabelaGestor();
    inicializarEventosGestor();
});

function iniciarGestor() {
    usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
    if (!usuarioLogado || !window.OfertePermissions?.has('dashboard')) {
        window.location.href = '../login/login.html';
        return;
    }

    document.getElementById('nome-gestor-sidebar').innerText = usuarioLogado.nome || 'Gestor';
    document.getElementById('btn-sair').addEventListener('click', () => {
        localStorage.removeItem('usuarioLogado');
        window.location.href = '../login/login.html';
    });
}

async function carregarDadosGestor() {
    const lojasApi = await apiGet('/api/lojas');
    const estoqueApi = await apiGet('/api/estoque');
    if (lojasApi?.lojas) {
        lojas = aplicarEstoqueNasLojas(lojasApi.lojas, estoqueApi?.estoque_lojas || []);
        localStorage.setItem(CHAVE_LOJAS_LOCAL, JSON.stringify({
            lojas,
            estoque_lojas: estoqueApi?.estoque_lojas || []
        }));
    } else {
        const dadosLocais = JSON.parse(localStorage.getItem(CHAVE_LOJAS_LOCAL) || 'null');
        if (dadosLocais?.lojas) {
            lojas = aplicarEstoqueNasLojas(dadosLocais.lojas, dadosLocais.estoque_lojas || []);
        } else {
            const dados = await fetchJson('../dados/lojas.json', { lojas: [], estoque_lojas: [] });
            lojas = aplicarEstoqueNasLojas(dados.lojas || [], dados.estoque_lojas || []);
            localStorage.setItem(CHAVE_LOJAS_LOCAL, JSON.stringify(dados));
        }
    }

    const enviosApi = await apiGet('/api/envios');
    const recebimentosApi = await apiGet('/api/recebimentos');
    if (enviosApi?.envios_taloes) {
        enviosTaloes = enviosApi.envios_taloes;
        recebimentosTaloes = recebimentosApi?.recebimentos_taloes || [];
        localStorage.setItem(CHAVE_TALOES_LOCAL, JSON.stringify({
            envios_taloes: enviosTaloes,
            recebimentos_taloes: recebimentosTaloes
        }));
    } else {
        const dadosLocais = JSON.parse(localStorage.getItem(CHAVE_TALOES_LOCAL) || 'null');
        if (dadosLocais?.envios_taloes) {
            enviosTaloes = dadosLocais.envios_taloes;
            recebimentosTaloes = dadosLocais.recebimentos_taloes || [];
        } else {
            const dados = await fetchJson('../dados/taloes.json', { envios_taloes: [], recebimentos_taloes: [] });
            enviosTaloes = dados.envios_taloes || [];
            recebimentosTaloes = dados.recebimentos_taloes || [];
        }
    }

    const dadosIA = await apiGet('/api/ia/envio-taloes') || await fetchJson('../dados/ia_envio_taloes.json', {});
    analisesIA = dadosIA.analises || [];
    resumoIA = dadosIA.resumo || null;
}

function renderizarResumoIA() {
    const mensagem = document.getElementById('mensagem-ia');
    const prioridade = analisesIA.reduce((maior, atual) =>
        Number(atual.score_prioridade || 0) > Number(maior?.score_prioridade || -1) ? atual : maior,
    null);

    const linhas = [
        resumoIA?.mensagem || 'Aguardando dados da analise Python para montar os indicadores inteligentes.'
    ];

    if (prioridade) {
        linhas.push('');
        linhas.push(`Maior atencao: ${prioridade.nome_loja} (${prioridade.uf}), estado ${normalizarPrioridadeTexto(prioridade.prioridade, prioridade.classe_css)}, sugestao de ${prioridade.quantidade_sugerida} taloes e score ${prioridade.score_prioridade}/100.`);
    }

    mensagem.innerText = linhas.join('\n');
}

function renderizarGraficoEstoque() {
    const canvas = document.getElementById('estoque-canvas');
    const ctx = canvas.getContext('2d');
    const total = lojas.length || 1;
    const baixos = calcularLojasBaixas();
    const ok = Math.max(total - baixos, 0);
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const raio = 92;
    const anguloBaixo = (baixos / total) * Math.PI * 2;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    desenharFatia(ctx, cx, cy, raio, -Math.PI / 2, -Math.PI / 2 + anguloBaixo, '#ff110d');
    desenharFatia(ctx, cx, cy, raio, -Math.PI / 2 + anguloBaixo, Math.PI * 1.5, '#d5d5d5');

    if (ok === total) {
        desenharFatia(ctx, cx, cy, raio, -Math.PI / 2, Math.PI * 1.5, '#d5d5d5');
    }

    ctx.fillStyle = '#101816';
    ctx.font = '600 16px Segoe UI';
    ctx.textAlign = 'center';
    ctx.fillText(`${baixos} baixo`, cx, cy - 2);
    ctx.font = '13px Segoe UI';
    ctx.fillText(`${ok} OK`, cx, cy + 20);
}

function desenharFatia(ctx, cx, cy, raio, inicio, fim, cor) {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, raio, inicio, fim);
    ctx.closePath();
    ctx.fillStyle = cor;
    ctx.fill();
}

function calcularLojasBaixas() {
    if (resumoIA?.lojas_baixas || resumoIA?.lojas_criticas) {
        return Number(resumoIA.lojas_baixas || 0) + Number(resumoIA.lojas_criticas || 0);
    }

    return lojas.filter(loja => Number(loja['Quantidade atual'] || loja.quantidade_atual || 0) < Number(loja.quantidade_minima || 0)).length;
}

function renderizarTabelaGestor() {
    const corpo = document.getElementById('tabela-gestor-corpo');
    const linhas = obterLinhasVisiveisGestor();

    corpo.innerHTML = '';
    linhas.forEach(linha => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><button class="row-expand-btn">⌄</button></td>
            <td>${formatarDataTabela(linha.data_hora_envio)}</td>
            <td><strong>${linha.id_envio}</strong></td>
            <td>${linha.lojaTexto}</td>
            <td>${linha.quantidade_enviada}</td>
            <td>${linha.quantidade_recomendada}</td>
            <td>${linha.quantidade_minima}</td>
            <td><span class="priority-badge ${linha.classePrioridade}">${linha.prioridade_ia}</span></td>
            <td>${linha.divergencia}</td>
        `;
        corpo.appendChild(tr);
    });

    if (!linhas.length) {
        corpo.innerHTML = '<tr><td colspan="9">Nenhum recebimento encontrado.</td></tr>';
    }
}

function obterLinhasVisiveisGestor() {
    const termo = document.getElementById('busca-gestor')?.value.toLowerCase().trim() || '';
    const status = document.getElementById('filtro-status-gestor')?.value || '';
    const dataInicial = document.getElementById('data-inicial-gestor')?.value || '';
    const dataFinal = document.getElementById('data-final-gestor')?.value || '';

    return montarLinhasGestor().filter(linha => {
        const texto = `${linha.id_envio} ${linha.lojaTexto} ${linha.data_hora_envio}`.toLowerCase();
        const data = obterDataISO(linha.data_hora_envio);
        return texto.includes(termo)
            && (!status || linha.status === status)
            && (!dataInicial || data >= dataInicial)
            && (!dataFinal || data <= dataFinal);
    });
}

function montarLinhasGestor() {
    const recebimentosPorEnvio = Object.fromEntries(recebimentosTaloes.map(item => [item.id_envio, item]));
    return enviosTaloes.map(envio => {
        const loja = buscarLoja(envio.cod_loja);
        const analise = buscarAnaliseIA(envio.cod_loja);
        const recebimento = recebimentosPorEnvio[envio.id_envio];
        const divergencia = recebimento
            ? Math.abs(Number(envio.quantidade_enviada || 0) - Number(recebimento.quantidade_recebida || 0))
            : '-';
        const prioridade = normalizarPrioridadeTexto(analise.prioridade || envio.prioridade_ia, analise.classe_css);

        return {
            ...envio,
            lojaTexto: envio.loja_nome
                ? `${envio.cod_loja} - ${envio.loja_nome}`
                : loja
                    ? `${loja.codigo_loja} - ${loja.nome_da_loja}`
                    : envio.cod_loja,
            quantidade_recomendada: envio.quantidade_recomendada || analise.quantidade_sugerida || loja?.quantidade_recomendada || '-',
            quantidade_minima: envio.quantidade_minima || analise.quantidade_minima || loja?.quantidade_minima || '-',
            prioridade_ia: prioridade,
            classePrioridade: classePrioridade(prioridade),
            score_prioridade: analise.score_prioridade || 0,
            divergencia
        };
    }).sort((a, b) => Number(b.score_prioridade || 0) - Number(a.score_prioridade || 0));
}

function inicializarEventosGestor() {
    document.getElementById('busca-gestor').addEventListener('input', renderizarTabelaGestor);
    document.getElementById('filtro-status-gestor').addEventListener('change', renderizarTabelaGestor);
    document.getElementById('data-inicial-gestor').addEventListener('change', renderizarTabelaGestor);
    document.getElementById('data-final-gestor').addEventListener('change', renderizarTabelaGestor);
    document.getElementById('btn-gerar-relatorio').addEventListener('click', gerarRelatorioGestor);
    document.getElementById('btn-exportar-gestor')?.addEventListener('click', exportarRelatorioGestor);
}

function gerarRelatorioGestor() {
    const linhas = obterLinhasVisiveisGestor();
    if (!linhas.length) {
        alert('Nao ha dados na tabela para gerar relatorio.');
        return;
    }

    localStorage.setItem('relatorioGestorGerado', JSON.stringify({
        criado_em: formatarDataHoraStorage(new Date()),
        nome_usuario: usuarioLogado.nome || 'Gestor',
        matricula_usuario: usuarioLogado.matricula || '',
        linhas
    }));
    window.OferteReports?.registrarRelatorio({
        nome: 'Relatório do gestor',
        origem: 'Dashboard Gestor',
        arquivo: 'relatorio-gestor.csv',
        usuario: usuarioLogado,
        linhas,
        colunas: colunasRelatorioGestor()
    });
    window.location.href = './relatorios.html';
}

function aplicarEstoqueNasLojas(listaLojas, listaEstoque) {
    const estoquePorLoja = Object.fromEntries(
        (listaEstoque || []).map(item => [String(item.codigo_loja || '').toUpperCase(), Number(item.quantidade_atual || 0)])
    );
    return (listaLojas || []).map(loja => {
        const codigo = String(loja.codigo_loja || '').toUpperCase();
        if (!(codigo in estoquePorLoja)) return loja;
        return {
            ...loja,
            'Quantidade atual': estoquePorLoja[codigo],
            quantidade_atual: estoquePorLoja[codigo]
        };
    });
}

function buscarLoja(codLoja) {
    return lojas.find(loja => loja.codigo_loja === codLoja);
}

function buscarAnaliseIA(codLoja) {
    return analisesIA.find(analise => analise.codigo_loja === codLoja) || {};
}

function classePrioridade(prioridade) {
    const valor = normalizarTextoPrioridade(prioridade);
    if (valor.includes('crit') || valor.includes('prioridade') || valor.includes('alta')) return 'critico';
    if (valor.includes('alert')) return 'alerta';
    if (valor.includes('media') || valor.includes('média')) return 'media';
    if (valor.includes('cheio') || valor.includes('baixa')) return 'cheio';
    return 'pendente';
}

function normalizarPrioridadeTexto(prioridade, classe = '') {
    const valor = normalizarTextoPrioridade(prioridade || classe);
    if (valor.includes('crit') || valor.includes('prioridade') || valor.includes('alta')) return 'Crítico';
    if (valor.includes('alert') || valor.includes('baixo')) return 'Alerta';
    if (valor.includes('média') || valor.includes('media')) return 'Na média';
    if (valor.includes('cheio') || valor.includes('baixa')) return 'Cheio';
    return prioridade || 'Pendente';
}

function normalizarTextoPrioridade(valor) {
    return String(valor || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function colunasRelatorioGestor() {
    return [
        ['data_hora_envio', 'Data / hora'],
        ['id_envio', 'Remessa'],
        ['lojaTexto', 'Loja'],
        ['quantidade_enviada', 'Qnt. enviada'],
        ['quantidade_recomendada', 'Recomendada'],
        ['quantidade_minima', 'Mínima'],
        ['prioridade_ia', 'Prioridade'],
        ['divergencia', 'Divergência']
    ];
}

function exportarRelatorioGestor() {
    const linhas = obterLinhasVisiveisGestor();
    window.OferteReports?.exportarCsv({
        nome: 'Relatório do gestor',
        origem: 'Dashboard Gestor',
        arquivo: 'relatorio-gestor.csv',
        usuario: usuarioLogado,
        linhas,
        colunas: colunasRelatorioGestor()
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

function formatarDataTabela(valor) {
    if (!valor) return '-';
    const [data, hora] = String(valor).split(' ');
    if (!data || !hora) return valor;
    const [ano, mes, dia] = data.split('-');
    return `${dia}/${mes}/${ano} - ${hora.slice(0, 5)}`;
}

function obterDataISO(valor) {
    if (!valor) return '';
    return String(valor).split(' ')[0] || '';
}

function formatarDataHoraStorage(data) {
    const partes = new Intl.DateTimeFormat('pt-BR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }).formatToParts(data);
    const mapa = Object.fromEntries(partes.map(parte => [parte.type, parte.value]));
    return `${mapa.year}-${mapa.month}-${mapa.day} ${mapa.hour}:${mapa.minute}:${mapa.second}`;
}
