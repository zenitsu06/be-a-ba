const API_BASE = window.OFERTE_CONFIG?.API_BASE || 'http://localhost:8000';
const CHAVE_TALOES_LOCAL = 'taloesJsonAtualizado';
const CHAVE_LOJAS_LOCAL = 'lojasJsonAtualizado';
const CHAVE_RELATORIOS_ADMIN = 'relatoriosEnviadosAdmin';

let usuarioLogado = null;
let lojas = [];
let enviosTaloes = [];
let recebimentosTaloes = [];
let analisesIA = [];
let relatoriosEnviados = [];
let relatorioGerado = null;

document.addEventListener('DOMContentLoaded', async () => {
    iniciarRelatorios();
    await carregarDadosRelatorios();
    renderizarRelatorios();
    inicializarEventosRelatorios();
});

function iniciarRelatorios() {
    usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
    if (!usuarioLogado || !window.OfertePermissions?.has('relatorios')) {
        window.location.href = '../login/login.html';
        return;
    }

    configurarSidebarPorPerfil();
    document.getElementById('btn-sair-gestor')?.addEventListener('click', sair);
}

function configurarSidebarPorPerfil() {
    const sidebarAdmin = document.getElementById('sidebar-admin');
    const sidebarGestor = document.getElementById('sidebar-gestor');
    const colNome = document.getElementById('col-nome-relatorio');
    const btnEnviar = document.getElementById('btn-enviar-admin');

    if (usuarioLogado.cargo !== 'gestor') {
        document.body.classList.add('admin-report');
        document.body.classList.remove('manager-report');
        sidebarAdmin.style.display = 'flex';
        sidebarGestor.style.display = 'none';
        colNome.style.display = '';
        btnEnviar.style.display = 'none';
        return;
    }

    document.body.classList.add('manager-report');
    document.body.classList.remove('admin-report');
    sidebarAdmin.style.display = 'none';
    sidebarGestor.style.display = 'flex';
    colNome.style.display = 'none';
    btnEnviar.style.display = '';
    document.getElementById('nome-gestor-sidebar').innerText = usuarioLogado.nome || 'Gestor';
}

function sair() {
    localStorage.removeItem('usuarioLogado');
    window.location.href = '../login/login.html';
}

async function carregarDadosRelatorios() {
    relatorioGerado = JSON.parse(localStorage.getItem('relatorioGestorGerado') || 'null');

    const lojasApi = await apiGet('/api/lojas');
    if (lojasApi?.lojas) {
        lojas = lojasApi.lojas;
    } else {
        const locais = JSON.parse(localStorage.getItem(CHAVE_LOJAS_LOCAL) || 'null');
        lojas = locais?.lojas || (await fetchJson('../dados/lojas.json', { lojas: [] })).lojas || [];
    }

    const enviosApi = await apiGet('/api/envios');
    const recebimentosApi = await apiGet('/api/recebimentos');
    if (enviosApi?.envios_taloes) {
        enviosTaloes = enviosApi.envios_taloes;
        recebimentosTaloes = recebimentosApi?.recebimentos_taloes || [];
    } else {
        const locais = JSON.parse(localStorage.getItem(CHAVE_TALOES_LOCAL) || 'null');
        const dados = locais || await fetchJson('../dados/taloes.json', { envios_taloes: [], recebimentos_taloes: [] });
        enviosTaloes = dados.envios_taloes || [];
        recebimentosTaloes = dados.recebimentos_taloes || [];
    }

    const dadosIA = await apiGet('/api/ia/envio-taloes') || await fetchJson('../dados/ia_envio_taloes.json', {});
    analisesIA = dadosIA.analises || [];

    if (usuarioLogado.cargo === 'administrador') {
        const enviadosApi = await apiGet('/api/relatorios/enviados');
        if (enviadosApi?.relatorios) {
            relatoriosEnviados = enviadosApi.relatorios;
            localStorage.setItem(CHAVE_RELATORIOS_ADMIN, JSON.stringify(relatoriosEnviados));
        } else {
            relatoriosEnviados = JSON.parse(localStorage.getItem(CHAVE_RELATORIOS_ADMIN) || '[]');
        }
    }
}

function inicializarEventosRelatorios() {
    document.getElementById('busca-relatorio').addEventListener('input', renderizarRelatorios);
    document.getElementById('data-inicial').addEventListener('change', renderizarRelatorios);
    document.getElementById('data-final').addEventListener('change', renderizarRelatorios);
    document.getElementById('btn-exportar-csv').addEventListener('click', exportarCsvPython);
    document.getElementById('btn-enviar-admin').addEventListener('click', enviarRelatorioParaAdmin);
}

function renderizarRelatorios() {
    const corpo = document.getElementById('tabela-relatorios-corpo');
    const linhas = usuarioLogado.cargo === 'administrador'
        ? filtrarLinhas(relatoriosEnviados.map(normalizarRelatorioEnviado))
        : filtrarLinhas(montarLinhasRelatorio());

    corpo.innerHTML = '';

    linhas.forEach(linha => {
        const tr = document.createElement('tr');
        tr.innerHTML = usuarioLogado.cargo === 'administrador'
            ? `
                <td>${linha.nome || '-'}</td>
                <td>${formatarDataTabela(linha.data_hora_envio || linha.data_hora || linha.enviado_em)}</td>
                <td><strong>${linha.id_envio || linha.remessa || '-'}</strong></td>
                <td>${linha.lojaTexto || linha.loja || '-'}</td>
                <td>${linha.quantidade_enviada ?? '-'}</td>
                <td>${linha.quantidade_recomendada ?? linha.recomendada ?? '-'}</td>
                <td>${linha.quantidade_minima ?? linha.minima ?? '-'}</td>
                <td>${linha.prioridade_ia ?? linha.prioridade ?? '-'}</td>
                <td>${linha.divergencia ?? '-'}</td>
            `
            : `
                <td>${formatarDataTabela(linha.data_hora_envio)}</td>
                <td><strong>${linha.id_envio}</strong></td>
                <td>${linha.lojaTexto}</td>
                <td>${linha.quantidade_enviada}</td>
                <td>${linha.quantidade_recomendada}</td>
                <td>${linha.quantidade_minima}</td>
                <td>${linha.prioridade_ia}</td>
                <td>${linha.divergencia}</td>
            `;
        corpo.appendChild(tr);
    });

    if (!linhas.length) {
        const colspan = usuarioLogado.cargo === 'administrador' ? 9 : 8;
        corpo.innerHTML = `<tr><td colspan="${colspan}">Nenhum registro encontrado.</td></tr>`;
    }
}

function montarLinhasRelatorio() {
    if (relatorioGerado?.linhas?.length) {
        return relatorioGerado.linhas.map(linha => ({
            ...linha,
            id_envio: linha.id_envio || linha.remessa,
            data_hora_envio: linha.data_hora_envio || linha.data_hora,
            lojaTexto: linha.lojaTexto || linha.loja,
            quantidade_recomendada: linha.quantidade_recomendada || linha.recomendada,
            quantidade_minima: linha.quantidade_minima || linha.minima,
            prioridade_ia: linha.prioridade_ia || linha.prioridade
        }));
    }

    const recebimentosPorEnvio = Object.fromEntries(recebimentosTaloes.map(item => [item.id_envio, item]));
    return enviosTaloes.map(envio => {
        const loja = lojas.find(item => item.codigo_loja === envio.cod_loja);
        const analise = analisesIA.find(item => item.codigo_loja === envio.cod_loja) || {};
        const recebimento = recebimentosPorEnvio[envio.id_envio];
        const quantidadeEnviada = Number(envio.quantidade_enviada || 0);
        const divergencia = recebimento
            ? Math.abs(quantidadeEnviada - Number(recebimento.quantidade_recebida || 0))
            : '-';

        return {
            ...envio,
            lojaTexto: envio.loja_nome
                ? `${envio.cod_loja} - ${envio.loja_nome}`
                : loja
                    ? `${loja.codigo_loja} - ${loja.nome_da_loja}`
                    : envio.cod_loja,
            quantidade_recomendada: envio.quantidade_recomendada || analise.quantidade_sugerida || loja?.quantidade_recomendada || '-',
            quantidade_minima: envio.quantidade_minima || analise.quantidade_minima || loja?.quantidade_minima || '-',
            prioridade_ia: envio.prioridade_ia || analise.prioridade || '-',
            divergencia
        };
    });
}

function normalizarRelatorioEnviado(linha) {
    return {
        ...linha,
        id_envio: linha.id_envio || linha.remessa,
        data_hora_envio: linha.data_hora_envio || linha.data_hora || linha.enviado_em,
        lojaTexto: linha.lojaTexto || linha.loja,
        quantidade_recomendada: linha.quantidade_recomendada || linha.recomendada,
        quantidade_minima: linha.quantidade_minima || linha.minima,
        prioridade_ia: linha.prioridade_ia || linha.prioridade
    };
}

function filtrarLinhas(linhas) {
    const termo = document.getElementById('busca-relatorio').value.toLowerCase().trim();
    const dataInicial = document.getElementById('data-inicial').value;
    const dataFinal = document.getElementById('data-final').value;

    return linhas.filter(linha => {
        const texto = `${linha.nome || ''} ${linha.id_envio || ''} ${linha.remessa || ''} ${linha.lojaTexto || ''} ${linha.loja || ''} ${linha.data_hora_envio || ''}`.toLowerCase();
        const data = obterDataISO(linha.data_hora_envio || linha.data_hora || linha.enviado_em);
        return texto.includes(termo)
            && (!dataInicial || data >= dataInicial)
            && (!dataFinal || data <= dataFinal);
    });
}

async function enviarRelatorioParaAdmin() {
    const linhas = filtrarLinhas(montarLinhasRelatorio());
    if (!linhas.length) {
        alert('Nao ha dados para enviar ao administrador.');
        return;
    }

    const payload = {
        nome_usuario: usuarioLogado.nome || 'Gestor',
        matricula_usuario: usuarioLogado.matricula || '',
        linhas: linhas.map(linha => ({
            data_hora_envio: linha.data_hora_envio,
            id_envio: linha.id_envio,
            lojaTexto: linha.lojaTexto,
            quantidade_enviada: linha.quantidade_enviada,
            quantidade_recomendada: linha.quantidade_recomendada,
            quantidade_minima: linha.quantidade_minima,
            prioridade_ia: linha.prioridade_ia,
            divergencia: linha.divergencia
        }))
    };

    const respostaApi = await apiPost('/api/relatorios/enviar', payload);
    if (!respostaApi?.relatorio) {
        const enviados = JSON.parse(localStorage.getItem(CHAVE_RELATORIOS_ADMIN) || '[]');
        const agora = formatarDataHoraStorage(new Date());
        const locais = payload.linhas.map(linha => ({
            nome: payload.nome_usuario,
            enviado_em: agora,
            ...linha
        }));
        localStorage.setItem(CHAVE_RELATORIOS_ADMIN, JSON.stringify([...locais, ...enviados]));
    }

    alert('Relatorio enviado para o administrador.');
}

async function exportarCsvPython() {
    const tipo = usuarioLogado.cargo === 'administrador' ? 'relatorios_enviados' : 'gestor';
    const params = new URLSearchParams({
        busca: document.getElementById('busca-relatorio').value.trim(),
        data_inicial: document.getElementById('data-inicial').value,
        data_final: document.getElementById('data-final').value
    });

    let response;
    try {
        response = await fetch(`${API_BASE}/api/relatorios/${tipo}.csv?${params.toString()}`);
    } catch (erro) {
        response = null;
    }

    if (!response?.ok) {
        alert(`Para exportar via Python, inicie o backend em ${API_BASE}.`);
        return;
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${tipo}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

async function apiGet(route) {
    return apiRequest(route);
}

async function apiPost(route, payload) {
    return apiRequest(route, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
}

async function apiRequest(route, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 800);
    try {
        const response = await fetch(`${API_BASE}${route}`, {
            ...options,
            signal: controller.signal
        });
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

function obterDataISO(valor) {
    if (!valor) return '';
    return String(valor).split(' ')[0] || '';
}

function formatarDataTabela(valor) {
    if (!valor) return '-';
    const [data, hora] = String(valor).split(' ');
    if (!data || !hora) return valor;
    const [ano, mes, dia] = data.split('-');
    if (!ano || !mes || !dia) return valor;
    return `${dia}/${mes}/${ano} - ${hora.slice(0, 5)}`;
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
