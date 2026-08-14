const API_BASE = window.OFERTE_CONFIG?.API_BASE || 'http://localhost:8000';
const CHAVE_TALOES_LOCAL = 'taloesJsonAtualizado';
const CHAVE_LOJAS_LOCAL = 'lojasJsonAtualizado';
const CHAVE_HISTORICO_ESTOQUE_LOCAL = 'historicoEstoqueLojas';
const TEMPO_INATIVIDADE_MS = 10 * 60 * 1000;
const tokenSessaoUsuario = Math.random().toString(36).substring(2);

let timeoutInatividade;
let usuarioLogado = null;
let lojas = [];
let estoqueLojas = [];
let enviosTaloes = [];
let recebimentosTaloes = [];
let lojaAtual = null;
let estoqueAtual = 0;

document.addEventListener('DOMContentLoaded', async () => {
    iniciarSeguranca();
    await carregarDadosUsuario();
    aplicarContextoUsuario();
    renderizarPainelEstoque();
    renderizarTabela();
    inicializarEventos();
});

function iniciarSeguranca() {
    usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
    if (!usuarioLogado || usuarioLogado.cargo !== 'lojista') {
        window.location.href = '../login/login.html';
        return;
    }

    sessionStorage.setItem('tokenSessaoUsuarioAtiva', tokenSessaoUsuario);
    localStorage.setItem('tokenControleUsuario', tokenSessaoUsuario);

    window.addEventListener('storage', (e) => {
        if (e.key === 'tokenControleUsuario' && e.newValue !== sessionStorage.getItem('tokenSessaoUsuarioAtiva')) {
            alert('Uma nova sessao foi iniciada em outra aba. Esta sera encerrada.');
            encerrarSessaoSeguranca();
        }
    });

    resetarTimerSeguranca();
    window.addEventListener('mousemove', resetarTimerSeguranca);
    window.addEventListener('keydown', resetarTimerSeguranca);
}

function resetarTimerSeguranca() {
    clearTimeout(timeoutInatividade);
    timeoutInatividade = setTimeout(() => {
        alert('Sessao expirada por inatividade.');
        encerrarSessaoSeguranca();
    }, TEMPO_INATIVIDADE_MS);
}

function encerrarSessaoSeguranca() {
    localStorage.removeItem('usuarioLogado');
    window.location.href = '../login/login.html';
}

async function carregarDadosUsuario() {
    await carregarLojas();
    await carregarTaloes();
    lojaAtual = encontrarLojaUsuario();
    estoqueAtual = obterEstoqueAtual(lojaAtual);
}

async function carregarLojas() {
    const lojasApi = await apiGet('/api/lojas');
    if (lojasApi?.lojas) {
        lojas = lojasApi.lojas;
        const estoqueApi = await apiGet('/api/estoque');
        estoqueLojas = estoqueApi?.estoque_lojas || montarEstoqueAPartirDasLojas(lojas);
        aplicarEstoqueNasLojas();
        salvarLojasLocal();
        return;
    }

    const locais = JSON.parse(localStorage.getItem(CHAVE_LOJAS_LOCAL) || 'null');
    if (locais?.lojas) {
        lojas = locais.lojas;
        estoqueLojas = locais.estoque_lojas || montarEstoqueAPartirDasLojas(lojas);
        aplicarEstoqueNasLojas();
        return;
    }

    const dados = await fetchJson('../dados/lojas.json', { lojas: [], estoque_lojas: [] });
    lojas = dados.lojas || [];
    estoqueLojas = dados.estoque_lojas || montarEstoqueAPartirDasLojas(lojas);
    aplicarEstoqueNasLojas();
    salvarLojasLocal();
}

async function carregarTaloes() {
    const enviosApi = await apiGet('/api/envios');
    const recebimentosApi = await apiGet('/api/recebimentos');

    if (enviosApi?.envios_taloes) {
        enviosTaloes = enviosApi.envios_taloes;
        recebimentosTaloes = recebimentosApi?.recebimentos_taloes || [];
        salvarTaloesLocal();
        return;
    }

    const locais = JSON.parse(localStorage.getItem(CHAVE_TALOES_LOCAL) || 'null');
    if (locais?.envios_taloes) {
        enviosTaloes = locais.envios_taloes;
        recebimentosTaloes = locais.recebimentos_taloes || [];
        return;
    }

    const dados = await fetchJson('../dados/taloes.json', { envios_taloes: [], recebimentos_taloes: [] });
    enviosTaloes = dados.envios_taloes || [];
    recebimentosTaloes = dados.recebimentos_taloes || [];
    salvarTaloesLocal();
}

function aplicarContextoUsuario() {
    document.getElementById('nome-usuario-header').innerText = usuarioLogado.nome || 'Lojista';
    document.getElementById('rec-funcionario-matricula').value = usuarioLogado.matricula || '';

    const lojaNome = lojaAtual?.nome_da_loja || usuarioLogado.lojaNome || extrairNomeLoja(usuarioLogado.loja) || '-';
    const lojaUf = lojaAtual?.uf || usuarioLogado.lojaUf || extrairUfLoja(usuarioLogado.loja) || '-';
    const lojaCod = lojaAtual?.codigo_loja || extrairCodigoLoja(usuarioLogado.loja) || '-';

    document.getElementById('info-loja-nome').innerText = lojaNome;
    document.getElementById('info-loja-uf').innerText = lojaUf;
    document.getElementById('rec-loja-nome').innerText = lojaNome;
    document.getElementById('rec-loja-uf').innerText = lojaUf;
    document.getElementById('rec-loja-cod').innerText = lojaCod;
}

function renderizarPainelEstoque() {
    document.getElementById('total-estoque').innerText = estoqueAtual;
    const label = document.getElementById('label-situacao');
    const minimo = Number(lojaAtual?.quantidade_minima || 0);
    const recomendado = Number(lojaAtual?.quantidade_recomendada || Math.max(minimo * 3, 1));

    if (estoqueAtual <= minimo) {
        label.innerText = 'Alerta';
        label.className = 'status-badge badge-red';
    } else if (estoqueAtual < recomendado) {
        label.innerText = 'Atencao';
        label.className = 'status-badge badge-yellow';
    } else {
        label.innerText = 'Acima da media';
        label.className = 'status-badge badge-green';
    }
}

function inicializarEventos() {
    const modal = document.getElementById('modal-recebimento');

    document.getElementById('btn-abrir-recebimento').addEventListener('click', () => {
        const envio = buscarPrimeiroEnvioPendente();
        if (!envio) {
            alert('Nao existe remessa pendente para esta loja.');
            return;
        }

        preencherModalComEnvio(envio);
        modal.style.display = 'flex';
    });

    document.getElementById('btn-fechar-modal').addEventListener('click', () => {
        modal.style.display = 'none';
        document.getElementById('form-recebimento').reset();
        aplicarContextoUsuario();
    });

    document.getElementById('rec-codigo-remessa').addEventListener('input', (e) => {
        const envio = buscarEnvioDaLoja(e.target.value.trim());
        if (envio) preencherModalComEnvio(envio, false);
    });

    document.getElementById('form-recebimento').addEventListener('submit', async (e) => {
        e.preventDefault();
        await confirmarRecebimento();
    });

    document.getElementById('input-busca').addEventListener('input', resetarERenderizarTabelaUsuario);
    document.getElementById('filtro-status').addEventListener('change', resetarERenderizarTabelaUsuario);
    document.getElementById('btn-editar-estoque').addEventListener('click', editarEstoqueAtual);
    document.getElementById('btn-exportar')?.addEventListener('click', exportarCsvPython);
    document.getElementById('btn-sair').addEventListener('click', encerrarSessaoSeguranca);
}

function resetarERenderizarTabelaUsuario() {
    window.OfertePagination?.resetar('usuario');
    renderizarTabela();
}

function preencherModalComEnvio(envio, atualizarCodigo = true) {
    const recebimento = buscarRecebimento(envio.id_envio);
    document.getElementById('rec-data-hora').value = formatarDataHoraStorage(new Date());
    if (atualizarCodigo) document.getElementById('rec-codigo-remessa').value = envio.id_envio;
    document.getElementById('rec-loja-nome').innerText = envio.loja_nome || lojaAtual?.nome_da_loja || '-';
    document.getElementById('rec-loja-uf').innerText = envio.loja_uf || lojaAtual?.uf || '-';
    document.getElementById('rec-loja-cod').innerText = envio.cod_loja || lojaAtual?.codigo_loja || '-';
    document.getElementById('rec-funcionario-matricula').value = usuarioLogado.matricula || '';
    document.getElementById('rec-qnt-enviados').value = envio.quantidade_enviada || 0;
    document.getElementById('rec-qnt-recebidos').value = recebimento?.quantidade_recebida ?? '';
    document.getElementById('rec-observacoes').value = recebimento?.observacao || envio.observacao || '';
}

async function confirmarRecebimento() {
    const codigo = document.getElementById('rec-codigo-remessa').value.trim();
    const envio = buscarEnvioDaLoja(codigo);

    if (!envio) {
        alert('Remessa nao encontrada para esta loja.');
        return;
    }

    const recebidos = Number(document.getElementById('rec-qnt-recebidos').value || 0);
    if (recebidos < 0) {
        alert('Informe uma quantidade recebida valida.');
        return;
    }

    const observacao = document.getElementById('rec-observacoes').value.trim();
    const payload = {
        id_envio: envio.id_envio,
        quantidade_recebida: recebidos,
        matricula_usuario: usuarioLogado.matricula,
        data_hora_recebimento: document.getElementById('rec-data-hora').value || formatarDataHoraStorage(new Date()),
        observacao
    };

    const respostaApi = await apiPost('/api/recebimentos', payload);
    if (respostaApi?.recebimento) {
        await carregarDadosUsuario();
    } else {
        aplicarRecebimentoLocal(envio, payload);
    }

    aplicarContextoUsuario();
    renderizarPainelEstoque();
    renderizarTabela();
    document.getElementById('modal-recebimento').style.display = 'none';
    document.getElementById('form-recebimento').reset();
    alert('Recebimento atualizado com sucesso.');
}

function aplicarRecebimentoLocal(envio, payload) {
    const existente = buscarRecebimento(envio.id_envio);
    const quantidadeAnterior = Number(existente?.quantidade_recebida || 0);
    const divergencia = Math.abs(Number(envio.quantidade_enviada || 0) - Number(payload.quantidade_recebida || 0));

    if (existente) {
        Object.assign(existente, {
            ...payload,
            cod_loja: envio.cod_loja,
            quantidade_divergencia: divergencia
        });
    } else {
        recebimentosTaloes.unshift({
            id_recebimento: gerarCodigoRecebimento(),
            cod_loja: envio.cod_loja,
            ...payload,
            quantidade_divergencia: divergencia
        });
    }

    envio.status = 'Recebido';
    estoqueAtual = Math.max(estoqueAtual + Number(payload.quantidade_recebida || 0) - quantidadeAnterior, 0);
    atualizarEstoqueLocal(estoqueAtual);
    salvarTaloesLocal();
    salvarLojasLocal();
}

async function editarEstoqueAtual() {
    if (!lojaAtual) {
        alert('Loja do usuario nao encontrada.');
        return;
    }

    const valor = prompt('Informe o estoque atual de taloes:', String(estoqueAtual));
    if (valor === null) return;

    const quantidade = Number(valor);
    if (!Number.isFinite(quantidade) || quantidade < 0) {
        alert('Informe uma quantidade valida.');
        return;
    }

    const estoqueAnterior = estoqueAtual;
    const respostaApi = await apiPost('/api/estoque', {
        cod_loja: lojaAtual.codigo_loja,
        quantidade_atual: quantidade
    });

    if (respostaApi?.estoque) {
        await carregarDadosUsuario();
    } else {
        estoqueAtual = quantidade;
        atualizarEstoqueLocal(quantidade);
        salvarLojasLocal();
    }

    registrarReducaoEstoque(estoqueAnterior, quantidade);
    aplicarContextoUsuario();
    renderizarPainelEstoque();
    alert('Estoque atualizado.');
}

function renderizarTabela() {
    const corpo = document.getElementById('tabela-corpo');
    const linhas = obterLinhasVisiveisUsuario();
    const pagina = window.OfertePagination?.pagina('usuario', linhas) || {
        itens: linhas,
        totalItens: linhas.length,
        itensPorPagina: linhas.length || 1,
        totalPaginas: 1,
        paginaAtual: 1
    };

    corpo.innerHTML = '';

    pagina.itens.forEach((item, index) => {
        const trPrincipal = document.createElement('tr');
        const badgeClass = item.status === 'recebido' ? 'badge-green' : 'badge-yellow';

        trPrincipal.innerHTML = `
            <td><button class="row-expand-btn" onclick="alternarObservacao(${index}, event)">▼</button></td>
            <td>${item.data}</td>
            <td>${item.remessa}</td>
            <td>${item.lojista}</td>
            <td><u>${item.email}</u></td>
            <td>${item.recebidos}</td>
            <td>${item.divergencia}</td>
            <td><span class="status-badge ${badgeClass}">${item.status}</span></td>
        `;

        const trObservacao = document.createElement('tr');
        trObservacao.id = `obs-row-${index}`;
        trObservacao.className = 'row-observations';
        trObservacao.style.display = 'none';
        trObservacao.innerHTML = `
            <td colspan="8">
                <div class="obs-container">
                    <strong>Observacoes:</strong><br><br>${item.obs || 'Nenhuma observacao informada.'}
                </div>
            </td>
        `;

        corpo.appendChild(trPrincipal);
        corpo.appendChild(trObservacao);
    });

    if (!linhas.length) {
        corpo.innerHTML = '<tr><td colspan="8">Nenhuma remessa encontrada para esta loja.</td></tr>';
    }

    window.OfertePagination?.renderizar('paginacao-usuario', 'usuario', pagina, renderizarTabela);
}

function obterLinhasVisiveisUsuario() {
    const termo = document.getElementById('input-busca').value.toLowerCase().trim();
    const statusFiltro = document.getElementById('filtro-status').value.toLowerCase();
    return montarLinhasRecebimento().filter(item => {
        const texto = `${item.data} ${item.remessa} ${item.lojista} ${item.email}`.toLowerCase();
        return texto.includes(termo) && (!statusFiltro || item.status === statusFiltro);
    });
}

function montarLinhasRecebimento() {
    return enviosDaLoja().map(envio => {
        const recebimento = buscarRecebimento(envio.id_envio);
        const status = recebimento || normalizarStatusRecebido(envio.status) ? 'recebido' : 'pendente';
        const recebidos = recebimento?.quantidade_recebida ?? envio.quantidade_recebida ?? 0;
        const divergencia = recebimento?.quantidade_divergencia ?? envio.quantidade_divergencia ?? '-';

        return {
            data: formatarDataTabela(recebimento?.data_hora_recebimento || envio.data_hora_envio),
            remessa: envio.id_envio,
            lojista: usuarioLogado.matricula,
            email: usuarioLogado.email || '-',
            quantidade_enviada: envio.quantidade_enviada,
            recebidos,
            divergencia,
            status,
            obs: recebimento?.observacao || envio.observacao || ''
        };
    });
}

function alternarObservacao(index, event) {
    const linhaObs = document.getElementById(`obs-row-${index}`);
    const btn = event?.target;
    if (!linhaObs) return;

    if (linhaObs.style.display === 'none') {
        linhaObs.style.display = 'table-row';
        btn?.classList.add('active');
    } else {
        linhaObs.style.display = 'none';
        btn?.classList.remove('active');
    }
}

function buscarPrimeiroEnvioPendente() {
    return enviosDaLoja().find(envio => !buscarRecebimento(envio.id_envio) && !normalizarStatusRecebido(envio.status));
}

function buscarEnvioDaLoja(idEnvio) {
    return enviosDaLoja().find(envio => String(envio.id_envio || '').toUpperCase() === String(idEnvio || '').toUpperCase());
}

function enviosDaLoja() {
    if (!lojaAtual) return [];
    const codigo = String(lojaAtual.codigo_loja || '').toUpperCase();
    return enviosTaloes.filter(envio => String(envio.cod_loja || '').toUpperCase() === codigo);
}

function buscarRecebimento(idEnvio) {
    return recebimentosTaloes.find(item => String(item.id_envio || '').toUpperCase() === String(idEnvio || '').toUpperCase());
}

function normalizarStatusRecebido(status) {
    const valor = String(status || '').toLowerCase();
    return valor === 'recebido' || valor === 'entregue';
}

function encontrarLojaUsuario() {
    const codigo = extrairCodigoLoja(usuarioLogado.loja);
    if (codigo) {
        const porCodigo = lojas.find(loja => String(loja.codigo_loja || '').toUpperCase() === codigo);
        if (porCodigo) return porCodigo;
    }

    const lojaNome = usuarioLogado.lojaNome || extrairNomeLoja(usuarioLogado.loja);
    const lojaUf = usuarioLogado.lojaUf || extrairUfLoja(usuarioLogado.loja);
    return lojas.find(loja =>
        loja.nome_da_loja === lojaNome &&
        String(loja.uf || '').toUpperCase() === String(lojaUf || '').toUpperCase()
    ) || null;
}

function obterEstoqueAtual(loja) {
    if (!loja) return 0;
    const item = estoqueLojas.find(estoque => String(estoque.codigo_loja || '').toUpperCase() === String(loja.codigo_loja || '').toUpperCase());
    return Number(item?.quantidade_atual ?? loja['Quantidade atual'] ?? loja.quantidade_atual ?? 0);
}

function atualizarEstoqueLocal(quantidade) {
    if (!lojaAtual) return;
    const codigo = String(lojaAtual.codigo_loja || '').toUpperCase();
    const estoque = estoqueLojas.find(item => String(item.codigo_loja || '').toUpperCase() === codigo);
    const atualizadoEm = formatarDataHoraStorage(new Date());

    lojaAtual['Quantidade atual'] = quantidade;
    lojaAtual.quantidade_atual = quantidade;
    lojas = lojas.map(loja => String(loja.codigo_loja || '').toUpperCase() === codigo ? lojaAtual : loja);

    if (estoque) {
        estoque.quantidade_atual = quantidade;
        estoque.atualizado_em = atualizadoEm;
    } else {
        estoqueLojas.push({
            codigo_loja: lojaAtual.codigo_loja,
            quantidade_atual: quantidade,
            atualizado_em: atualizadoEm
        });
    }
}

function montarEstoqueAPartirDasLojas(lista) {
    return (lista || []).map(loja => ({
        codigo_loja: loja.codigo_loja,
        quantidade_atual: Number(loja['Quantidade atual'] ?? loja.quantidade_atual ?? 0),
        atualizado_em: loja.atualizado_em || ''
    }));
}

function aplicarEstoqueNasLojas() {
    const estoquePorLoja = Object.fromEntries(
        estoqueLojas.map(item => [String(item.codigo_loja || '').toUpperCase(), Number(item.quantidade_atual || 0)])
    );
    lojas = lojas.map(loja => {
        const codigo = String(loja.codigo_loja || '').toUpperCase();
        if (!(codigo in estoquePorLoja)) return loja;
        return {
            ...loja,
            'Quantidade atual': estoquePorLoja[codigo],
            quantidade_atual: estoquePorLoja[codigo]
        };
    });
}

function salvarTaloesLocal() {
    localStorage.setItem(CHAVE_TALOES_LOCAL, JSON.stringify({
        envios_taloes: enviosTaloes,
        recebimentos_taloes: recebimentosTaloes
    }));
}

function salvarLojasLocal() {
    localStorage.setItem(CHAVE_LOJAS_LOCAL, JSON.stringify({
        lojas,
        estoque_lojas: estoqueLojas
    }));
}

function registrarReducaoEstoque(estoqueAnterior, estoqueNovo) {
    if (!lojaAtual || Number(estoqueNovo) >= Number(estoqueAnterior)) return;
    const historico = JSON.parse(localStorage.getItem(CHAVE_HISTORICO_ESTOQUE_LOCAL) || '[]');
    historico.unshift({
        codigo_loja: lojaAtual.codigo_loja,
        loja: lojaAtual.nome_da_loja,
        uf: lojaAtual.uf,
        estoque_anterior: Number(estoqueAnterior),
        estoque_novo: Number(estoqueNovo),
        quantidade_entregue: Number(estoqueAnterior) - Number(estoqueNovo),
        matricula_usuario: usuarioLogado.matricula || '',
        atualizado_em: formatarDataHoraStorage(new Date())
    });
    localStorage.setItem(CHAVE_HISTORICO_ESTOQUE_LOCAL, JSON.stringify(historico.slice(0, 200)));
}

function gerarCodigoRecebimento() {
    const ano = new Date().getFullYear();
    const maior = recebimentosTaloes.reduce((valor, recebimento) => {
        const match = String(recebimento.id_recebimento || '').match(new RegExp(`REC-${ano}-(\\d{3})`));
        return match ? Math.max(valor, Number(match[1])) : valor;
    }, 0);
    return `REC-${ano}-${String(maior + 1).padStart(3, '0')}`;
}

async function exportarCsvPython() {
    const minimo = lojaAtual?.quantidade_minima ?? '-';
    const recomendado = lojaAtual?.quantidade_recomendada ?? '-';
    const prioridade = document.getElementById('label-situacao')?.innerText || '-';
    const linhasPadrao = obterLinhasVisiveisUsuario().map(linha =>
        window.OferteReports?.normalizarLinhaRelatorioEstoque
            ? window.OferteReports.normalizarLinhaRelatorioEstoque(linha, usuarioLogado, {
                quantidade_enviada_estoque: linha.quantidade_enviada || linha.recebidos,
                quantidade_recomendada: recomendado,
                quantidade_minima: minimo,
                status_prioridade_loja: prioridade,
                divergencia: linha.divergencia
            })
            : linha
    );

    window.OferteReports?.exportarCsv({
        nome: 'Relatorio de recebimentos',
        origem: 'Painel Lojista',
        arquivo: 'recebimentos.csv',
        usuario: usuarioLogado,
        linhas: linhasPadrao,
        colunas: window.OferteReports?.colunasRelatorioEstoque?.() || []
    });
    return;

    window.OferteReports?.exportarCsv({
        nome: 'Relatório de recebimentos',
        origem: 'Painel Lojista',
        arquivo: 'recebimentos.csv',
        usuario: usuarioLogado,
        linhas: obterLinhasVisiveisUsuario(),
        colunas: [
            ['data', 'Data / hora'],
            ['remessa', 'Remessa'],
            ['lojista', 'Lojista'],
            ['email', 'E-mail'],
            ['recebidos', 'Qnt. recebida'],
            ['divergencia', 'Divergência'],
            ['status', 'Status'],
            ['obs', 'Observações']
        ]
    });
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

function extrairNomeLoja(loja) {
    if (!loja) return '';
    return loja.split(' - ')[0].trim();
}

function extrairUfLoja(loja) {
    if (!loja) return '';
    const resultado = loja.match(/-\s*([A-Z]{2})\s*\(/);
    return resultado ? resultado[1] : '';
}

function extrairCodigoLoja(loja) {
    if (!loja) return '';
    const resultado = String(loja).match(/Cod:\s*([A-Z0-9-]+)/i);
    return resultado ? resultado[1].toUpperCase() : '';
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

function formatarDataTabela(valor) {
    if (!valor) return '-';
    const [data, hora] = String(valor).split(' ');
    if (!data || !hora) return valor;
    const [ano, mes, dia] = data.split('-');
    if (!ano || !mes || !dia) return valor;
    return `${dia}/${mes}/${ano} - ${hora.slice(0, 5)}`;
}
