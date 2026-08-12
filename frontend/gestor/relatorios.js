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
let relatorioSelecionadoLinhas = [];

const COLUNAS_RELATORIOS = {
    historico_relatorios: [
        ['data_hora', 'Data / hora'],
        ['nome_relatorio', 'Relatório'],
        ['origem', 'Origem'],
        ['nome_usuario', 'Usuário'],
        ['quantidade_linhas', 'Registros'],
        ['arquivo', 'Arquivo'],
        ['status', 'Status']
    ],
    gestor: [
        ['data_hora_envio', 'Data / hora'],
        ['id_envio', 'Remessa'],
        ['lojaTexto', 'Loja'],
        ['quantidade_enviada', 'Qnt. enviada'],
        ['quantidade_recomendada', 'Recomendada'],
        ['quantidade_minima', 'Minima'],
        ['prioridade_ia', 'Prioridade'],
        ['divergencia', 'Divergencia']
    ],
    relatorios_enviados: [
        ['nome', 'Nome'],
        ['data_hora_envio', 'Data / hora'],
        ['id_envio', 'Remessa'],
        ['lojaTexto', 'Loja'],
        ['quantidade_enviada', 'Qnt. enviada'],
        ['quantidade_recomendada', 'Recomendada'],
        ['quantidade_minima', 'Minima'],
        ['prioridade_ia', 'Prioridade'],
        ['divergencia', 'Divergencia']
    ],
    usuarios: [
        ['matricula', 'Matricula'],
        ['nome', 'Nome'],
        ['email', 'E-mail'],
        ['cargo', 'Cargo'],
        ['loja', 'Loja'],
        ['status', 'Status']
    ],
    perfis: [
        ['nome_perfil', 'Perfil'],
        ['cargo', 'Cargo'],
        ['descricao', 'Descricao'],
        ['atribacoes', 'Atribuicoes']
    ],
    manutencao_taloes: [
        ['data_hora', 'Data / hora'],
        ['remessa', 'Remessa'],
        ['loja', 'Loja'],
        ['quantidade_enviada', 'Qnt. enviada'],
        ['status', 'Status'],
        ['prioridade', 'Prioridade'],
        ['atualizado_em', 'Atualizado em']
    ],
    gestao_recebimento: [
        ['data_hora_recebimento', 'Recebido em'],
        ['recebimento', 'Recebimento'],
        ['remessa', 'Remessa'],
        ['loja', 'Loja'],
        ['quantidade_recebida', 'Qnt. recebida'],
        ['quantidade_divergencia', 'Divergencia'],
        ['observacao', 'Observacao']
    ],
    gestao_estoque: [
        ['codigo_loja', 'Cod. loja'],
        ['loja', 'Loja'],
        ['uf', 'UF'],
        ['quantidade_atual', 'Atual'],
        ['quantidade_minima', 'Minima'],
        ['quantidade_recomendada', 'Recomendada'],
        ['prioridade', 'Prioridade'],
        ['taxa_conversao_historica', 'Conversao simulada'],
        ['anomalias', 'Anomalias']
    ],
    anomalias: [
        ['tipo', 'Tipo'],
        ['codigo_loja', 'Cod. loja'],
        ['loja', 'Loja'],
        ['severidade', 'Severidade'],
        ['descricao', 'Descricao'],
        ['recomendacao', 'Recomendacao']
    ],
    notificacoes_workplace: [
        ['canal', 'Canal'],
        ['destino', 'Destino'],
        ['codigo_loja', 'Cod. loja'],
        ['loja', 'Loja'],
        ['nivel', 'Nivel'],
        ['status', 'Status'],
        ['mensagem', 'Mensagem'],
        ['enviado_em', 'Enviado em']
    ]
};

document.addEventListener('DOMContentLoaded', async () => {
    iniciarRelatorios();
    await carregarDadosRelatorios();
    inicializarEventosRelatorios();
    await carregarRelatorioSelecionado(obterTipoRelatorioAtual());
    renderizarRelatorios();
});

function iniciarRelatorios() {
    usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
    if (!usuarioLogado || !window.OfertePermissions?.has('relatorios')) {
        window.location.href = '../login/login.html';
        return;
    }

    configurarSidebarPorPerfil();
    const nomeTopo = document.getElementById('nome-relatorio-usuario');
    if (nomeTopo) nomeTopo.innerText = usuarioLogado.nome || 'Usuário';
    document.getElementById('btn-sair-relatorios')?.addEventListener('click', sair);
}

function configurarSidebarPorPerfil() {
    const sidebarAdmin = document.getElementById('sidebar-admin');
    const sidebarGestor = document.getElementById('sidebar-gestor');
    const colNome = document.getElementById('col-nome-relatorio');
    const btnEnviar = document.getElementById('btn-enviar-admin');
    const tipoWrapper = document.getElementById('tipo-relatorio-wrapper');
    const tipoSelect = document.getElementById('tipo-relatorio');

    if (usuarioLogado.cargo !== 'gestor') {
        document.body.classList.add('admin-report');
        document.body.classList.remove('manager-report');
        sidebarAdmin.style.display = 'flex';
        sidebarGestor.style.display = 'none';
        colNome.style.display = '';
        btnEnviar.style.display = 'none';
        tipoWrapper.style.display = 'flex';
        tipoSelect.value = 'historico_relatorios';
        return;
    }

    document.body.classList.add('manager-report');
    document.body.classList.remove('admin-report');
    sidebarAdmin.style.display = 'none';
    sidebarGestor.style.display = 'flex';
    colNome.style.display = 'none';
    btnEnviar.style.display = '';
    tipoWrapper.style.display = 'none';
    tipoSelect.value = 'historico_relatorios';
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

async function carregarRelatorioSelecionado(tipo) {
    if (tipo === 'historico_relatorios') {
        relatorioSelecionadoLinhas = montarHistoricoRelatorios();
        return;
    }

    if (usuarioLogado.cargo !== 'administrador' && tipo !== 'gestor') {
        relatorioSelecionadoLinhas = montarHistoricoRelatorios();
        return;
    }

    const respostaApi = await apiGet(`/api/relatorios/${tipo}`);
    if (respostaApi?.linhas) {
        relatorioSelecionadoLinhas = respostaApi.linhas.map(linha => normalizarLinhaRelatorio(tipo, linha));
        return;
    }

    relatorioSelecionadoLinhas = await montarLinhasRelatorioLocal(tipo);
}

async function montarLinhasRelatorioLocal(tipo) {
    if (tipo === 'historico_relatorios') return montarHistoricoRelatorios();
    if (tipo === 'gestor') return montarLinhasRelatorio();
    if (tipo === 'relatorios_enviados') return relatoriosEnviados.map(linha => normalizarLinhaRelatorio(tipo, linha));

    if (tipo === 'usuarios' || tipo === 'perfis') {
        const locais = JSON.parse(localStorage.getItem('usuariosJsonAtualizado') || 'null');
        const dados = locais || await fetchJson('../dados/usuarios.json', { usuarios: [], perfis: [] });
        return tipo === 'usuarios'
            ? (dados.usuarios || [])
            : (dados.perfis || []).map(perfil => ({
                ...perfil,
                atribacoes: (perfil.atribacoes || perfil.atribuicoes || []).join(', ')
            }));
    }

    if (tipo === 'manutencao_taloes') return montarLinhasRelatorio().map(linha => ({
        data_hora: linha.data_hora_envio,
        remessa: linha.id_envio,
        loja: linha.lojaTexto,
        quantidade_enviada: linha.quantidade_enviada,
        status: linha.status,
        prioridade: linha.prioridade_ia,
        atualizado_em: linha.atualizado_em || ''
    }));

    if (tipo === 'gestao_recebimento') {
        const enviosPorId = Object.fromEntries(enviosTaloes.map(envio => [envio.id_envio, envio]));
        return recebimentosTaloes.map(recebimento => {
            const envio = enviosPorId[recebimento.id_envio] || {};
            return {
                data_hora_recebimento: recebimento.data_hora_recebimento,
                recebimento: recebimento.id_recebimento,
                remessa: recebimento.id_envio,
                loja: envio.loja_nome || recebimento.cod_loja,
                quantidade_recebida: recebimento.quantidade_recebida,
                quantidade_divergencia: recebimento.quantidade_divergencia,
                observacao: recebimento.observacao
            };
        });
    }

    if (tipo === 'gestao_estoque') {
        return lojas.map(loja => {
            const analise = analisesIA.find(item => item.codigo_loja === loja.codigo_loja) || {};
            return {
                codigo_loja: loja.codigo_loja,
                loja: loja.nome_da_loja,
                uf: loja.uf,
                quantidade_atual: loja.quantidade_atual ?? loja['Quantidade atual'],
                quantidade_minima: loja.quantidade_minima,
                quantidade_recomendada: loja.quantidade_recomendada,
                prioridade: analise.prioridade || '-',
                taxa_conversao_historica: analise.taxa_conversao_historica || '-',
                anomalias: '-'
            };
        });
    }

    if (tipo === 'anomalias') {
        const dadosIA = await apiGet('/api/ia/envio-taloes') || await fetchJson('../dados/ia_envio_taloes.json', {});
        return dadosIA.anomalias_recebimento || [];
    }

    if (tipo === 'notificacoes_workplace') {
        const dadosIA = await apiGet('/api/ia/envio-taloes') || await fetchJson('../dados/ia_envio_taloes.json', {});
        return dadosIA.notificacoes_workplace || [];
    }

    return [];
}

function obterTipoRelatorioAtual() {
    return document.getElementById('tipo-relatorio')?.value || 'historico_relatorios';
}

function normalizarLinhaRelatorio(tipo, linha) {
    if (tipo === 'gestor' || tipo === 'relatorios_enviados') {
        return normalizarRelatorioEnviado(linha);
    }
    return linha;
}

function montarHistoricoRelatorios() {
    const historicoLocal = listarHistoricoRelatoriosLocal();
    const enviados = relatoriosEnviados.map(linha => ({
        id_relatorio: linha.id_relatorio || `ENVIADO-${linha.enviado_em || linha.data_hora_envio || ''}-${linha.id_envio || ''}`,
        data_hora: linha.enviado_em || linha.data_hora_envio || '',
        data_hora_envio: linha.enviado_em || linha.data_hora_envio || '',
        nome_relatorio: 'Relatório enviado ao administrador',
        origem: 'Gestor',
        nome_usuario: linha.nome || linha.nome_usuario || 'Gestor',
        quantidade_linhas: 1,
        arquivo: 'relatorios_enviados.csv',
        status: 'Enviado'
    }));

    const combinados = [...historicoLocal, ...enviados];
    const porId = new Map();
    combinados.forEach(item => {
        const id = item.id_relatorio || `${item.nome_relatorio}-${item.data_hora}-${item.origem}`;
        if (!porId.has(id)) porId.set(id, item);
    });

    return Array.from(porId.values()).sort((a, b) =>
        String(b.data_hora || b.data_hora_envio || '').localeCompare(String(a.data_hora || a.data_hora_envio || ''))
    );
}

function listarHistoricoRelatoriosLocal() {
    const viaUtilitario = window.OferteReports?.listarHistorico ? window.OferteReports.listarHistorico() : [];
    if (viaUtilitario.length) return viaUtilitario;
    try {
        return JSON.parse(localStorage.getItem('historicoRelatorios') || '[]');
    } catch (erro) {
        return [];
    }
}

function inicializarEventosRelatorios() {
    document.getElementById('busca-relatorio').addEventListener('input', resetarERenderizarRelatorios);
    document.getElementById('data-inicial').addEventListener('change', resetarERenderizarRelatorios);
    document.getElementById('data-final').addEventListener('change', resetarERenderizarRelatorios);
    document.getElementById('tipo-relatorio').addEventListener('change', async (event) => {
        await carregarRelatorioSelecionado(event.target.value);
        window.OfertePagination?.resetar('relatorios');
        renderizarRelatorios();
    });
    document.getElementById('btn-exportar-csv').addEventListener('click', exportarCsvPython);
    document.getElementById('btn-enviar-admin').addEventListener('click', enviarRelatorioParaAdmin);
}

function resetarERenderizarRelatorios() {
    window.OfertePagination?.resetar('relatorios');
    renderizarRelatorios();
}

function renderizarRelatorios() {
    const corpo = document.getElementById('tabela-relatorios-corpo');
    const tipo = obterTipoRelatorioAtual();
    const colunas = COLUNAS_RELATORIOS[tipo] || COLUNAS_RELATORIOS.gestor;
    const linhas = filtrarLinhas(relatorioSelecionadoLinhas);
    const pagina = window.OfertePagination?.pagina('relatorios', linhas) || {
        itens: linhas,
        totalItens: linhas.length,
        itensPorPagina: linhas.length || 1,
        totalPaginas: 1,
        paginaAtual: 1
    };

    renderizarCabecalhoRelatorio(colunas);
    corpo.innerHTML = '';

    pagina.itens.forEach(linha => {
        const tr = document.createElement('tr');
        tr.innerHTML = colunas
            .map(([campo]) => `<td>${formatarValorRelatorio(linha[campo], campo)}</td>`)
            .join('');
        corpo.appendChild(tr);
    });

    if (!linhas.length) {
        corpo.innerHTML = `<tr><td colspan="${colunas.length}">Nenhum registro encontrado.</td></tr>`;
    }

    window.OfertePagination?.renderizar('paginacao-relatorios', 'relatorios', pagina, renderizarRelatorios);
}

function renderizarCabecalhoRelatorio(colunas) {
    const cabecalho = document.getElementById('cabecalho-relatorios');
    cabecalho.innerHTML = colunas.map(([, titulo]) => `<th>${titulo}</th>`).join('');
}

function formatarValorRelatorio(valor, campo) {
    if (Array.isArray(valor)) return valor.join(', ');
    if (valor === null || valor === undefined || valor === '') return '-';
    if (campo.includes('data') || campo.includes('enviado') || campo.includes('atualizado')) {
        return formatarDataTabela(valor);
    }
    return valor;
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
        const texto = Object.values(linha).join(' ').toLowerCase();
        const data = obterDataISO(
            linha.data_hora_envio ||
            linha.data_hora ||
            linha.data_hora_recebimento ||
            linha.enviado_em ||
            linha.atualizado_em ||
            linha.data_cadastro
        );
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

    window.OferteReports?.registrarRelatorio({
        nome: 'Relatório enviado ao administrador',
        origem: 'Relatórios',
        arquivo: 'relatorio-enviado-admin.csv',
        usuario: usuarioLogado,
        linhas: payload.linhas,
        colunas: COLUNAS_RELATORIOS.gestor,
        status: 'Enviado'
    });

    alert('Relatorio enviado para o administrador.');
}

async function exportarCsvPython() {
    const tipo = obterTipoRelatorioAtual();
    const colunas = COLUNAS_RELATORIOS[tipo] || COLUNAS_RELATORIOS.historico_relatorios;
    const linhas = filtrarLinhas(relatorioSelecionadoLinhas);

    window.OferteReports?.exportarCsv({
        nome: tipo === 'historico_relatorios' ? 'Histórico de relatórios' : `Relatório ${tipo}`,
        origem: 'Relatórios',
        arquivo: `${tipo}.csv`,
        usuario: usuarioLogado,
        linhas,
        colunas,
        registrar: tipo !== 'historico_relatorios'
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
