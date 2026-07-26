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
            mensagem: 'Resultado de IA não encontrado. Inicie o backend Node e recalcule a IA pela rota /api/ia/envio-taloes/recalcular.'
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
    document.getElementById('btn-exportar-envios')?.addEventListener('click', exportarRelatorioEnvios);
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

    const analise = montarAnaliseLoja(codLoja);
    document.getElementById('preview-codigo').innerText = loja.codigo_loja;
    document.getElementById('preview-nome').innerText = loja.nome_da_loja;
    document.getElementById('preview-uf').innerText = loja.uf;
    document.getElementById('env-recomendada').value = analise.quantidade_sugerida || loja.quantidade_recomendada;
    document.getElementById('env-minima').value = analise.quantidade_minima || loja.quantidade_minima;
    document.getElementById('env-prioridade').value = analise.prioridade || "pendente";
    document.getElementById('env-quantidade').value = analise.quantidade_sugerida || loja.quantidade_recomendada;
    document.getElementById('env-insight').innerText = analise.mensagem || "Recalcule a IA pelo backend Node para gerar a análise desta loja.";
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

    const analise = montarAnaliseLoja(codLoja);
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
        insight_ia: analise.mensagem || "Análise de IA não encontrada para esta loja."
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
    corpo.innerHTML = "";

    obterEnviosVisiveis()
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
                <td>
                    <button class="btn-edit-shipment" onclick="abrirEdicaoEnvio('${envio.id_envio}')">Editar</button>
                </td>
            `;
            corpo.appendChild(tr);
        });

    if (!corpo.children.length) {
        corpo.innerHTML = '<tr><td colspan="8">Nenhum envio encontrado.</td></tr>';
    }
}

function obterEnviosVisiveis() {
    const termo = document.getElementById('busca-envio').value.toLowerCase().trim();
    const filtroStatus = document.getElementById('filtro-status').value;

    return enviosTaloes
        .map(envio => montarEnvioTabela(envio))
        .filter(envio => {
            const textoBusca = `${envio.id_envio} ${envio.lojaTexto} ${envio.data_hora_envio}`.toLowerCase();
            const passaBusca = textoBusca.includes(termo);
            const passaStatus = !filtroStatus || envio.status === filtroStatus;
            return passaBusca && passaStatus;
        });
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
    const analise = montarAnaliseLoja(envio.cod_loja);
    const prioridade = analise.prioridade || normalizarPrioridadeTexto(envio.prioridade_ia) || "Pendente";

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
        score_prioridade: analise.score_prioridade || 0,
        classePrioridade: classePrioridade(prioridade)
    };
}

function renderizarSugestaoIA() {
    document.getElementById('texto-sugestao-ia').innerText = formatarMensagemResumoIA();
}

function buscarAnaliseIA(codLoja) {
    return analisesIA.find(analise => analise.codigo_loja === codLoja) || {};
}

function montarAnaliseLoja(codLoja) {
    const loja = buscarLoja(codLoja);
    const analise = buscarAnaliseIA(codLoja);
    if (analise.prioridade) {
        return {
            ...analise,
            prioridade: normalizarPrioridadeTexto(analise.prioridade, analise.classe_css),
            quantidade_minima: analise.quantidade_minima || loja?.quantidade_minima,
            quantidade_sugerida: analise.quantidade_sugerida || calcularQuantidadeSugerida(loja)
        };
    }

    return calcularPrioridadePorEstoque(loja);
}

function calcularPrioridadePorEstoque(loja) {
    if (!loja) return {};
    const atual = Number(loja['Quantidade atual'] ?? loja.quantidade_atual ?? 0);
    const minimo = Number(loja.quantidade_minima || 0);
    const recomendado = Number(loja.quantidade_recomendada || Math.max(minimo * 3, 1));
    let prioridade = 'Cheio';
    let score = 10;

    if (atual <= minimo) {
        prioridade = 'Crítico';
        score = 100;
    } else if (atual < recomendado) {
        prioridade = 'Alerta';
        score = 80;
    } else if (atual <= recomendado * 1.15) {
        prioridade = 'Na média';
        score = 50;
    }

    return {
        codigo_loja: loja.codigo_loja,
        nome_loja: loja.nome_da_loja,
        uf: loja.uf,
        estoque_atual: atual,
        quantidade_minima: minimo,
        quantidade_sugerida: calcularQuantidadeSugerida(loja),
        prioridade,
        classe_css: classePrioridade(prioridade),
        score_prioridade: score,
        mensagem: `Estoque atual ${atual}. Mínimo ${minimo}. Recomendado ${recomendado}. Prioridade ${prioridade}.`
    };
}

function calcularQuantidadeSugerida(loja) {
    if (!loja) return 0;
    const atual = Number(loja['Quantidade atual'] ?? loja.quantidade_atual ?? 0);
    const minimo = Number(loja.quantidade_minima || 0);
    const recomendado = Number(loja.quantidade_recomendada || Math.max(minimo * 3, 1));
    if (atual <= minimo) return Math.max(recomendado - atual + minimo, minimo);
    if (atual < recomendado) return Math.max(recomendado - atual, Math.ceil(minimo / 2));
    if (atual <= recomendado * 1.15) return Math.ceil(recomendado * 0.15);
    return 0;
}

function normalizarPrioridadeTexto(prioridade, classe = '') {
    const valor = normalizarTextoPrioridade(prioridade || classe);
    if (valor.includes('crit') || valor.includes('prioridade') || valor.includes('alta')) return 'Crítico';
    if (valor.includes('alert') || valor.includes('baixo')) return 'Alerta';
    if (valor.includes('média') || valor.includes('media')) return 'Na média';
    if (valor.includes('cheio') || valor.includes('baixa')) return 'Cheio';
    return prioridade || '';
}

function classePrioridade(prioridade) {
    const valor = normalizarTextoPrioridade(prioridade);
    if (valor.includes('crit')) return 'critico';
    if (valor.includes('alert')) return 'alerta';
    if (valor.includes('média') || valor.includes('media')) return 'media';
    if (valor.includes('cheio')) return 'cheio';
    return "pendente";
}

function normalizarTextoPrioridade(valor) {
    return String(valor || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function formatarMensagemResumoIA() {
    const criticasBase = obterLojasCriticasParaSugestao();
    const criticas = criticasBase.slice(0, 8);
    const data = new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).format(new Date());

    if (!criticasBase.length) {
        return [
            `Análise concluída em ${data}`,
            'Nenhuma loja em estado crítico no momento.',
            'Não há reposição urgente recomendada pela IA.'
        ].join('\n');
    }

    const prioridadeMaxima = criticas.map(item => `${item.nome_loja} (${item.uf || '-'})`).join(', ');
    const ocultas = criticasBase.length > criticas.length
        ? `\n+ ${criticasBase.length - criticas.length} loja(s) crítica(s) fora da prévia.`
        : '';

    return [
        `Análise concluída em ${data}`,
        `Quantidade de lojas em estado crítico: ${criticasBase.length}`,
        `Reposição urgente: ${prioridadeMaxima}${ocultas}`
    ].join('\n');
}

function obterLojasCriticasParaSugestao() {
    return lojas
        .map(loja => {
            const analise = buscarAnaliseIA(loja.codigo_loja);
            const atual = Number(loja.quantidade_atual ?? loja['Quantidade atual'] ?? analise.estoque_atual ?? 0);
            const estado = calcularPrioridadePorEstoque({ ...loja, quantidade_atual: atual }).prioridade
                || normalizarPrioridadeTexto(analise.prioridade, analise.classe_css);

            return {
                codigo_loja: loja.codigo_loja,
                nome_loja: loja.nome_da_loja || analise.nome_loja,
                uf: loja.uf || analise.uf,
                estoque_atual: atual,
                prioridade: estado,
                score_prioridade: analise.score_prioridade || 0
            };
        })
        .filter(item => item.prioridade === 'Crítico')
        .sort((a, b) =>
            Number(a.estoque_atual || 0) - Number(b.estoque_atual || 0)
            || Number(b.score_prioridade || 0) - Number(a.score_prioridade || 0)
            || String(a.codigo_loja || '').localeCompare(String(b.codigo_loja || ''), 'pt-BR', { numeric: true })
        );
}

function exportarRelatorioEnvios() {
    const linhas = obterEnviosVisiveis();
    exportarCsvComHistorico({
        nome: 'Relatório de envios de talões',
        origem: 'Enviar Talões',
        arquivo: 'envios-taloes.csv',
        usuario: usuarioLogado,
        linhas,
        colunas: [
            ['data_hora_envio', 'Data / hora'],
            ['id_envio', 'Remessa'],
            ['lojaTexto', 'Loja'],
            ['quantidade_enviada', 'Qnt. enviada'],
            ['quantidade_recomendada', 'Recomendada'],
            ['quantidade_minima', 'Mínima'],
            ['status', 'Status']
        ]
    });
}

function exportarCsvComHistorico(config) {
    document.body.dataset.ultimoRelatorioExportado = config.nome || 'relatorio';
    registrarHistoricoRelatorio(config);
    if (window.OferteReports?.exportarCsv) {
        window.OferteReports.exportarCsv({ ...config, registrar: false });
        return;
    }

    const colunas = config.colunas || [];
    const cabecalho = colunas.map(([, titulo]) => escaparCsv(titulo)).join(';');
    const corpo = (config.linhas || []).map(linha =>
        colunas.map(([campo]) => escaparCsv(linha[campo])).join(';')
    );
    const blob = new Blob(['\uFEFF' + [cabecalho, ...corpo].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = config.arquivo || 'relatorio.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function registrarHistoricoRelatorio(config) {
    const historico = JSON.parse(localStorage.getItem('historicoRelatorios') || '[]');
    historico.unshift({
        id_relatorio: `REL-${Date.now()}`,
        nome_relatorio: config.nome,
        origem: config.origem,
        nome_usuario: config.usuario?.nome || 'Usuário',
        matricula_usuario: config.usuario?.matricula || '',
        data_hora: formatarDataHora(new Date()),
        data_hora_envio: formatarDataHora(new Date()),
        quantidade_linhas: (config.linhas || []).length,
        arquivo: config.arquivo || 'relatorio.csv',
        status: 'Exportado',
        linhas: config.linhas || []
    });
    localStorage.setItem('historicoRelatorios', JSON.stringify(historico.slice(0, 200)));
    document.body.dataset.totalHistoricoRelatorios = String(historico.length);
}

function escaparCsv(valor) {
    if (valor === null || valor === undefined) return '""';
    return `"${String(valor).replace(/"/g, '""')}"`;
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
