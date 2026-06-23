const TEMPO_INATIVIDADE_MS = 10 * 60 * 1000;
const CHAVE_TALOES_LOCAL = 'taloesJsonAtualizado';
const CHAVE_LOJAS_LOCAL = 'lojasJsonAtualizado';
const API_BASE = window.OFERTE_CONFIG?.API_BASE || 'http://localhost:8000';
const tokenSessaoEnvio = Math.random().toString(36).substring(2);

let timeoutInatividade;
let usuarioLogado = null;
let lojas = [];
let enviosTaloes = [];
let recebimentosTaloes = [];
let analisesIA = [];
let resumoIA = null;
let envioEmEdicaoId = null;

document.addEventListener('DOMContentLoaded', async () => {
    iniciarSeguranca();
    await carregarDados();
    popularSelectLojas();
    renderizarSugestaoIA();
    renderizarTabela();
    inicializarEventos();
});

function iniciarSeguranca() {
    usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
    if (!usuarioLogado || !window.OfertePermissions?.has('enviar-taloes')) {
        window.location.href = '../login/login.html';
        return;
    }

    document.getElementById('nome-admin').innerText = usuarioLogado.nome;

    sessionStorage.setItem('tokenSessaoEnvioAtiva', tokenSessaoEnvio);
    localStorage.setItem('tokenControleEnvio', tokenSessaoEnvio);

    window.addEventListener('storage', (e) => {
        if (e.key === 'tokenControleEnvio' && e.newValue !== sessionStorage.getItem('tokenSessaoEnvioAtiva')) {
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

async function carregarDados() {
    const lojasApi = await apiGet('/api/lojas');
    if (lojasApi?.lojas) {
        lojas = lojasApi.lojas;
        localStorage.setItem(CHAVE_LOJAS_LOCAL, JSON.stringify({ lojas }));
    } else {
        const dadosLocais = JSON.parse(localStorage.getItem(CHAVE_LOJAS_LOCAL));
        if (dadosLocais?.lojas) {
            lojas = dadosLocais.lojas;
        } else {
            const respostaLojas = await fetch('../dados/lojas.json');
            const dadosLojas = await respostaLojas.json();
            lojas = dadosLojas.lojas || [];
            localStorage.setItem(CHAVE_LOJAS_LOCAL, JSON.stringify({ lojas }));
        }
    }

    const taloesApi = await apiGet('/api/envios');
    if (taloesApi?.envios_taloes) {
        enviosTaloes = taloesApi.envios_taloes;
        const recebimentosApi = await apiGet('/api/recebimentos');
        recebimentosTaloes = recebimentosApi?.recebimentos_taloes || [];
    } else {
        const dadosLocais = JSON.parse(localStorage.getItem(CHAVE_TALOES_LOCAL));
        if (dadosLocais && Array.isArray(dadosLocais.envios_taloes)) {
            enviosTaloes = dadosLocais.envios_taloes;
            recebimentosTaloes = dadosLocais.recebimentos_taloes || [];
            await carregarResultadoPythonIA();
            return;
        }

        const respostaTaloes = await fetch('../dados/taloes.json');
        const dadosTaloes = await respostaTaloes.json();
        enviosTaloes = dadosTaloes.envios_taloes || [];
        recebimentosTaloes = dadosTaloes.recebimentos_taloes || [];
        salvarTaloesJson();
    }

    await carregarResultadoPythonIA();
}

async function carregarResultadoPythonIA() {
    try {
        const dadosApi = await apiGet('/api/ia/envio-taloes');
        const dadosIA = dadosApi || await (await fetch('../dados/ia_envio_taloes.json')).json();
        analisesIA = dadosIA.analises || [];
        resumoIA = dadosIA.resumo || null;
    } catch (erro) {
        analisesIA = [];
        resumoIA = {
            mensagem: 'Resultado de IA não encontrado. Execute python/ia_envio_taloes.py para gerar dados/ia_envio_taloes.json.'
        };
    }
}

function inicializarEventos() {
    const modal = document.getElementById('modal-envio');

    document.getElementById('btn-abrir-envio').addEventListener('click', () => {
        prepararModalEnvio();
        modal.style.display = 'flex';
    });

    document.getElementById('btn-fechar-modal').addEventListener('click', () => {
        fecharModalEnvio();
    });

    document.getElementById('busca-loja').addEventListener('input', (e) => {
        popularSelectLojas(e.target.value);
    });

    document.getElementById('env-loja').addEventListener('change', atualizarDadosLojaSelecionada);

    document.getElementById('form-envio').addEventListener('submit', async (e) => {
        e.preventDefault();
        await confirmarEnvio();
    });

    document.getElementById('busca-envio').addEventListener('input', renderizarTabela);
    document.getElementById('filtro-status').addEventListener('change', renderizarTabela);
}

function prepararModalEnvio() {
    envioEmEdicaoId = null;
    document.getElementById('modal-envio-titulo').innerText = 'Cadastrar envio de talões';
    document.getElementById('btn-submit-envio').innerText = 'Confirmar';
    document.getElementById('form-envio').reset();
    document.getElementById('env-data-hora').value = formatarDataHora(new Date());
    document.getElementById('env-codigo').value = gerarCodigoEnvio();
    document.getElementById('env-entrega-prevista').value = calcularDataEntregaPrevista();
    document.getElementById('env-status').value = 'Pendente';
    popularSelectLojas();
    limparPreviewLoja();
}

function popularSelectLojas(filtro = "") {
    const select = document.getElementById('env-loja');
    const termo = filtro.toLowerCase().trim();

    select.innerHTML = '<option value="">Selecione a filial...</option>';

    lojas
        .filter(loja => {
            const textoBusca = `${loja.codigo_loja} ${loja.nome_da_loja} ${loja.uf}`.toLowerCase();
            return textoBusca.includes(termo);
        })
        .forEach(loja => {
            const opt = document.createElement('option');
            opt.value = loja.codigo_loja;
            opt.innerText = `${loja.codigo_loja} - ${loja.nome_da_loja} (${loja.uf})`;
            select.appendChild(opt);
        });
}

function atualizarDadosLojaSelecionada() {
    const codLoja = document.getElementById('env-loja').value;
    const loja = buscarLoja(codLoja);

    if (!loja) {
        limparPreviewLoja();
        return;
    }

    const analise = buscarAnaliseIA(codLoja);
    document.getElementById('preview-codigo').innerText = loja.codigo_loja;
    document.getElementById('preview-nome').innerText = loja.nome_da_loja;
    document.getElementById('preview-uf').innerText = loja.uf;
    document.getElementById('env-recomendada').value = analise.quantidade_sugerida || loja.quantidade_recomendada;
    document.getElementById('env-minima').value = analise.quantidade_minima || loja.quantidade_minima;
    document.getElementById('env-prioridade').value = analise.prioridade || "pendente";
    document.getElementById('env-quantidade').value = analise.quantidade_sugerida || loja.quantidade_recomendada;
    document.getElementById('env-insight').innerText = analise.mensagem || "Execute o script Python para gerar a análise desta loja.";
}

async function confirmarEnvio() {
    const codLoja = document.getElementById('env-loja').value;
    const loja = buscarLoja(codLoja);

    if (!loja) {
        alert('Selecione uma loja válida para continuar.');
        return;
    }

    const quantidade = parseInt(document.getElementById('env-quantidade').value, 10);
    if (!quantidade || quantidade <= 0) {
        alert('Informe uma quantidade válida de talões.');
        return;
    }

    const analise = buscarAnaliseIA(codLoja);
    const novoEnvio = {
        id_envio: document.getElementById('env-codigo').value,
        cod_loja: loja.codigo_loja,
        loja_nome: loja.nome_da_loja,
        loja_uf: loja.uf,
        matricula_usuario: usuarioLogado.matricula,
        data_hora_envio: document.getElementById('env-data-hora').value,
        data_entrega_prevista: document.getElementById('env-entrega-prevista').value || calcularDataEntregaPrevista(),
        quantidade_enviada: quantidade,
        quantidade_recomendada: analise.quantidade_sugerida || loja.quantidade_recomendada,
        quantidade_minima: analise.quantidade_minima || loja.quantidade_minima,
        prioridade_ia: analise.prioridade || "pendente",
        status: document.getElementById('env-status').value || "Pendente",
        insight_ia: analise.mensagem || "Análise Python não encontrada para esta loja."
    };

    if (envioEmEdicaoId) {
        const respostaApi = await apiPost('/api/envios/editar', novoEnvio);
        const envioAtualizado = respostaApi?.envio || novoEnvio;
        enviosTaloes = enviosTaloes.map(envio =>
            envio.id_envio === envioEmEdicaoId ? { ...envio, ...envioAtualizado } : envio
        );
        salvarTaloesJson();
        renderizarTabela();
        fecharModalEnvio();
        alert('Remessa atualizada com sucesso.');
    } else {
        const respostaApi = await apiPost('/api/envios', novoEnvio);
        if (respostaApi?.envio) {
            enviosTaloes.unshift(respostaApi.envio);
        } else {
            enviosTaloes.unshift(novoEnvio);
            salvarTaloesJson();
        }

        renderizarTabela();
        fecharModalEnvio();
        alert('Envio cadastrado com sucesso.');
    }
}

function renderizarTabela() {
    const corpo = document.getElementById('tabela-envios-corpo');
    const termo = document.getElementById('busca-envio').value.toLowerCase().trim();
    const filtroStatus = document.getElementById('filtro-status').value;

    corpo.innerHTML = "";

    enviosTaloes
        .map(envio => montarEnvioTabela(envio))
        .filter(envio => {
            const textoBusca = `${envio.id_envio} ${envio.lojaTexto} ${envio.data_hora_envio}`.toLowerCase();
            const passaBusca = textoBusca.includes(termo);
            const passaStatus = !filtroStatus || envio.status === filtroStatus;
            return passaBusca && passaStatus;
        })
        .forEach(envio => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><button class="row-expand-btn">⌄</button></td>
                <td>${formatarDataTabela(envio.data_hora_envio)}</td>
                <td><strong>${envio.id_envio}</strong></td>
                <td>${envio.lojaTexto}</td>
                <td>${envio.quantidade_enviada}</td>
                <td>${envio.quantidade_recomendada}</td>
                <td>${envio.quantidade_minima}</td>
                <td><span class="priority-badge ${envio.classePrioridade}">${envio.prioridade_ia}</span></td>
                <td>
                    <button class="btn-edit-shipment" onclick="abrirEdicaoEnvio('${envio.id_envio}')">Editar</button>
                </td>
            `;
            corpo.appendChild(tr);
        });

    if (!corpo.children.length) {
        corpo.innerHTML = '<tr><td colspan="9">Nenhum envio encontrado.</td></tr>';
    }
}

function abrirEdicaoEnvio(idEnvio) {
    const envio = enviosTaloes.find(item => item.id_envio === idEnvio);
    if (!envio) return;

    envioEmEdicaoId = idEnvio;
    document.getElementById('modal-envio-titulo').innerText = 'Editar remessa de talões';
    document.getElementById('btn-submit-envio').innerText = 'Salvar alterações';
    document.getElementById('form-envio').reset();
    document.getElementById('env-data-hora').value = envio.data_hora_envio || formatarDataHora(new Date());
    document.getElementById('env-codigo').value = envio.id_envio;
    document.getElementById('env-entrega-prevista').value = envio.data_entrega_prevista || calcularDataEntregaPrevista();
    document.getElementById('env-status').value = envio.status || 'Pendente';

    popularSelectLojas();
    document.getElementById('env-loja').value = envio.cod_loja;
    atualizarDadosLojaSelecionada();
    document.getElementById('env-quantidade').value = envio.quantidade_enviada || '';
    document.getElementById('env-recomendada').value = envio.quantidade_recomendada || document.getElementById('env-recomendada').value;
    document.getElementById('env-minima').value = envio.quantidade_minima || document.getElementById('env-minima').value;
    document.getElementById('env-prioridade').value = envio.prioridade_ia || document.getElementById('env-prioridade').value;
    document.getElementById('modal-envio').style.display = 'flex';
}

function montarEnvioTabela(envio) {
    const loja = buscarLoja(envio.cod_loja);
    const analise = buscarAnaliseIA(envio.cod_loja);
    const prioridade = envio.prioridade_ia || analise.prioridade || "pendente";

    return {
        ...envio,
        lojaTexto: envio.loja_nome
            ? `${envio.cod_loja} - ${envio.loja_nome}`
            : loja
                ? `${loja.codigo_loja} - ${loja.nome_da_loja}`
                : envio.cod_loja,
        quantidade_recomendada: envio.quantidade_recomendada || analise.quantidade_sugerida || (loja ? loja.quantidade_recomendada : "-"),
        quantidade_minima: envio.quantidade_minima || analise.quantidade_minima || (loja ? loja.quantidade_minima : "-"),
        prioridade_ia: prioridade,
        classePrioridade: classePrioridade(prioridade)
    };
}

function renderizarSugestaoIA() {
    document.getElementById('texto-sugestao-ia').innerText =
        resumoIA?.mensagem || 'Execute python/ia_envio_taloes.py para gerar as recomendações.';
}

function buscarAnaliseIA(codLoja) {
    return analisesIA.find(analise => analise.codigo_loja === codLoja) || {};
}

function classePrioridade(prioridade) {
    if (prioridade === "Prioridade") return "alta";
    if (prioridade === "média") return "media";
    if (prioridade === "baixa") return "baixa";
    return "pendente";
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

function buscarLoja(codLoja) {
    return lojas.find(loja => loja.codigo_loja === codLoja);
}

function gerarCodigoEnvio() {
    const ano = new Date().getFullYear();
    const maiorSequencial = enviosTaloes.reduce((maior, envio) => {
        const match = String(envio.id_envio || "").match(new RegExp(`ENV-${ano}-(\\d{3})`));
        return match ? Math.max(maior, parseInt(match[1], 10)) : maior;
    }, 0);

    return `ENV-${ano}-${String(maiorSequencial + 1).padStart(3, '0')}`;
}

function calcularDataEntregaPrevista() {
    const data = new Date();
    data.setDate(data.getDate() + 3);
    return data.toISOString().slice(0, 10);
}

function limparPreviewLoja() {
    document.getElementById('preview-codigo').innerText = "-";
    document.getElementById('preview-nome').innerText = "-";
    document.getElementById('preview-uf').innerText = "-";
    document.getElementById('env-recomendada').value = "";
    document.getElementById('env-minima').value = "";
    document.getElementById('env-prioridade').value = "";
    document.getElementById('env-insight').innerText = "Selecione uma loja para carregar a análise gerada em Python.";
}

function fecharModalEnvio() {
    envioEmEdicaoId = null;
    document.getElementById('modal-envio').style.display = 'none';
    document.getElementById('form-envio').reset();
    document.getElementById('modal-envio-titulo').innerText = 'Cadastrar envio de talões';
    document.getElementById('btn-submit-envio').innerText = 'Confirmar';
    limparPreviewLoja();
}

function salvarTaloesJson() {
    localStorage.setItem(CHAVE_TALOES_LOCAL, JSON.stringify({
        envios_taloes: enviosTaloes,
        recebimentos_taloes: recebimentosTaloes
    }));
}

function formatarDataHora(data) {
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
    if (!valor) return "-";
    const [data, hora] = valor.split(" ");
    if (!data || !hora) return valor;
    const [ano, mes, dia] = data.split("-");
    return `${dia}/${mes}/${ano} - ${hora.slice(0, 5)}`;
}
