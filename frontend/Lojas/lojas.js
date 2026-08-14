const API_BASE = window.OFERTE_CONFIG?.API_BASE || 'http://localhost:8000';
const CHAVE_LOJAS_LOCAL = 'lojasJsonAtualizado';
const TEMPO_INATIVIDADE_MS = 10 * 60 * 1000;
const ITENS_POR_PAGINA_LOJAS = 10;
const tokenSessaoLojas = Math.random().toString(36).substring(2);

let timeoutInatividade;
let usuarioLogado = null;
let lojas = [];
let estoqueLojas = [];
let usuarios = [];
let funcionarios = [];
let paginaAtualLojas = 1;

document.addEventListener('DOMContentLoaded', async () => {
    iniciarSeguranca();
    await carregarLojas();
    await carregarFuncionarios();
    enriquecerLojasComFuncionarios();
    await carregarIndicadorIA();
    renderizarTabela();
    inicializarEventos();
});

function iniciarSeguranca() {
    usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
    if (!usuarioLogado || !window.OfertePermissions?.has('lojas')) {
        window.location.href = '../login/login.html';
        return;
    }

    document.getElementById('nome-admin').innerText = usuarioLogado.nome;

    sessionStorage.setItem('tokenSessaoLojasAtiva', tokenSessaoLojas);
    localStorage.setItem('tokenControleLojas', tokenSessaoLojas);

    window.addEventListener('storage', (e) => {
        if (e.key === 'tokenControleLojas' && e.newValue !== sessionStorage.getItem('tokenSessaoLojasAtiva')) {
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

async function carregarLojas() {
    const dadosApi = await apiGet('/api/lojas');
    if (dadosApi?.lojas) {
        lojas = dadosApi.lojas;
        const dadosEstoqueApi = await apiGet('/api/estoque');
        estoqueLojas = dadosEstoqueApi?.estoque_lojas || montarEstoqueAPartirDasLojas(lojas);
        aplicarEstoqueNasLojas();
        salvarLojasLocal();
        return;
    }

    const dadosLocais = JSON.parse(localStorage.getItem(CHAVE_LOJAS_LOCAL));
    if (dadosLocais?.lojas) {
        lojas = dadosLocais.lojas;
        estoqueLojas = dadosLocais.estoque_lojas || montarEstoqueAPartirDasLojas(lojas);
        aplicarEstoqueNasLojas();
        return;
    }

    const resposta = await fetch('../dados/lojas.json');
    const dados = await resposta.json();
    lojas = dados.lojas || [];
    estoqueLojas = dados.estoque_lojas || montarEstoqueAPartirDasLojas(lojas);
    aplicarEstoqueNasLojas();
    salvarLojasLocal();
}

async function carregarIndicadorIA() {
    const dadosApi = await apiGet('/api/ia/envio-taloes');
    let dadosIA = dadosApi;

    if (!dadosIA) {
        try {
            dadosIA = await (await fetch('../dados/ia_envio_taloes.json')).json();
        } catch (erro) {
            dadosIA = null;
        }
    }

    document.getElementById('insight-ia').innerText =
        formatarResumoIA(dadosIA) || 'Indicadores Python indisponíveis no momento.';
}

async function carregarFuncionarios() {
    const dadosApi = await apiGet('/api/usuarios');
    if (dadosApi?.usuarios) {
        usuarios = normalizarUsuarios(dadosApi.usuarios);
        salvarUsuariosLocal();
    } else {
        const dadosLocais = JSON.parse(localStorage.getItem('usuariosJsonAtualizado'));
        if (dadosLocais?.usuarios) {
            usuarios = normalizarUsuarios(dadosLocais.usuarios);
        } else {
            const resposta = await fetch('../dados/usuarios.json');
            const dados = await resposta.json();
            usuarios = normalizarUsuarios(dados.usuarios || []);
            salvarUsuariosLocal();
        }
    }

    funcionarios = usuarios.filter(user =>
        user.status !== 'Inativo' &&
        user.cargo !== 'administrador'
    );
}

function normalizarUsuarios(listaUsuarios) {
    return (listaUsuarios || []).map(user => ({
        matricula: user.matricula || "",
        nome: user.nome || "",
        email: user.email || "",
        cargo: user.cargo || "",
        loja: user.loja || "",
        lojaNome: user.lojaNome || extrairNomeLoja(user.loja),
        lojaUf: user.lojaUf || extrairUfLoja(user.loja),
        status: user.status || "Ativo",
        senha: user.senha,
        atribacoes: user.atribacoes || user.atribuicoes || ["dashboard"]
    }));
}

function enriquecerLojasComFuncionarios() {
    lojas = lojas.map(loja => {
        if (loja.funcionario_matricula) return loja;

        const funcionario = funcionarios.find(user => usuarioVinculadoALoja(user, loja));
        if (!funcionario) return loja;

        return aplicarFuncionarioNaLoja(loja, funcionario);
    });
}

function usuarioVinculadoALoja(user, loja) {
    const codigo = String(loja.codigo_loja || "").toUpperCase();
    const lojaUsuario = String(user.loja || "").toUpperCase();

    return Boolean(
        (codigo && lojaUsuario.includes(`COD: ${codigo}`)) ||
        (user.lojaNome === loja.nome_da_loja && String(user.lojaUf || "").toUpperCase() === String(loja.uf || "").toUpperCase())
    );
}

function aplicarFuncionarioNaLoja(loja, funcionario) {
    return {
        ...loja,
        funcionario_matricula: funcionario.matricula,
        funcionario_nome: funcionario.nome,
        funcionario_email: funcionario.email,
        funcionario_cargo: funcionario.cargo
    };
}

function popularSelectFuncionarios() {
    const select = document.getElementById('cad-funcionario');
    select.innerHTML = '<option value="">Sem funcionário atribuído</option>';

    funcionarios.forEach(funcionario => {
        const opt = document.createElement('option');
        opt.value = funcionario.matricula;
        opt.innerText = `${funcionario.nome} (${funcionario.matricula})`;
        select.appendChild(opt);
    });
}

function formatarResumoIA(dadosIA) {
    const resumo = dadosIA?.resumo;
    if (!resumo) return "";

    const dataAnalise = formatarDataHoraAnalise(dadosIA.gerado_em) || extrairDataResumo(resumo.mensagem);
    const analises = dadosIA.analises || [];
    const prioridadeMaxima = analises.reduce((maior, atual) => {
        const scoreAtual = Number(atual.score_prioridade || 0);
        const scoreMaior = Number(maior?.score_prioridade || -1);
        return scoreAtual > scoreMaior ? atual : maior;
    }, null);

    const linhas = [];
    if (dataAnalise) {
        linhas.push(`Análise concluída em ${dataAnalise}.`);
    }
    linhas.push(`${resumo.lojas_criticas || 0} loja(s) em estado CRÍTICO, ${resumo.lojas_baixas || 0} em estoque BAIXO, ${resumo.lojas_ok || 0} dentro do parâmetro.`);

    linhas.push(`${resumo.notificacoes_workplace || 0} notificacao(oes) Workplace simulada(s) para lojas em alerta.`);
    linhas.push(`${resumo.anomalias || 0} anomalia(s) de recebimento detectada(s).`);

    if (prioridadeMaxima) {
        linhas.push("");
        linhas.push(`Prioridade máxima: ${prioridadeMaxima.nome_loja} (${prioridadeMaxima.uf}) com score ${prioridadeMaxima.score_prioridade}/100.`);
    }

    return linhas.join("\n");
}

function formatarDataHoraAnalise(valor) {
    if (!valor) return "";
    const match = String(valor).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (!match) return "";
    const [, ano, mes, dia, hora, minuto] = match;
    return `${dia}/${mes}/${ano} ${hora}:${minuto}`;
}

function extrairDataResumo(mensagem = "") {
    const match = mensagem.match(/em\s+(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2})/);
    return match ? match[1] : "";
}

function inicializarEventos() {
    const modal = document.getElementById('modal-cadastro');

    document.getElementById('btn-abrir-cadastro').addEventListener('click', () => {
        document.getElementById('form-cadastro-loja').reset();
        popularSelectFuncionarios();
        modal.style.display = 'flex';
    });

    document.getElementById('btn-fechar-modal').addEventListener('click', () => {
        modal.style.display = 'none';
        document.getElementById('form-cadastro-loja').reset();
    });

    document.getElementById('form-cadastro-loja').addEventListener('submit', async (e) => {
        e.preventDefault();
        await cadastrarLoja();
    });

    document.getElementById('busca-loja').addEventListener('input', () => {
        paginaAtualLojas = 1;
        renderizarTabela();
    });
    document.getElementById('btn-exportar-lojas')?.addEventListener('click', exportarRelatorioLojas);
}

async function cadastrarLoja() {
    const funcionarioSelecionado = buscarFuncionarioSelecionado();
    const novaLoja = {
        codigo_loja: document.getElementById('cad-codigo').value.trim().toUpperCase(),
        nome_da_loja: document.getElementById('cad-nome').value.trim(),
        uf: document.getElementById('cad-uf').value.trim().toUpperCase(),
        funcionario_matricula: funcionarioSelecionado?.matricula || "",
        funcionario_nome: funcionarioSelecionado?.nome || "",
        funcionario_email: funcionarioSelecionado?.email || "",
        funcionario_cargo: funcionarioSelecionado?.cargo || "",
        quantidade_minima: Number(document.getElementById('cad-estoque-minimo').value || 0),
        quantidade_recomendada: Number(document.getElementById('cad-estoque-recomendado').value || 0),
        quantidade_atual: Number(document.getElementById('cad-estoque-inicial').value || 0)
    };

    if (novaLoja.uf.length !== 2) {
        alert('Informe a UF com 2 letras.');
        return;
    }

    if (novaLoja.quantidade_recomendada < novaLoja.quantidade_minima) {
        alert('O estoque recomendado deve ser maior ou igual ao estoque minimo.');
        return;
    }

    if (lojas.some(loja => loja.codigo_loja.toUpperCase() === novaLoja.codigo_loja)) {
        alert('Já existe uma loja com esse código.');
        return;
    }

    const respostaApi = await apiPost('/api/lojas', novaLoja);
    if (respostaApi?.loja) {
        lojas.push(respostaApi.loja);
        vincularFuncionarioLocalmente(respostaApi.loja);
    } else {
        const lojaLocal = {
            ...novaLoja,
            data_cadastro: new Date().toISOString().slice(0, 10),
            "Quantidade atual": novaLoja.quantidade_atual
        };
        lojas.push(lojaLocal);
        estoqueLojas.push({
            codigo_loja: lojaLocal.codigo_loja,
            quantidade_atual: lojaLocal.quantidade_atual,
            atualizado_em: formatarDataHoraStorage(new Date())
        });
        vincularFuncionarioLocalmente(lojaLocal);
        salvarLojasLocal();
    }

    document.getElementById('modal-cadastro').style.display = 'none';
    document.getElementById('form-cadastro-loja').reset();
    renderizarTabela();
    alert('Loja cadastrada com sucesso.');
}

function renderizarTabela() {
    const corpo = document.getElementById('tabela-lojas-corpo');
    const lojasFiltradas = obterLojasVisiveis();
    const totalPaginas = Math.max(Math.ceil(lojasFiltradas.length / ITENS_POR_PAGINA_LOJAS), 1);
    paginaAtualLojas = Math.min(Math.max(paginaAtualLojas, 1), totalPaginas);
    const inicio = (paginaAtualLojas - 1) * ITENS_POR_PAGINA_LOJAS;
    const lojasPagina = lojasFiltradas.slice(inicio, inicio + ITENS_POR_PAGINA_LOJAS);

    corpo.innerHTML = "";
    document.getElementById('total-lojas').innerText = lojas.length;

    lojasPagina.forEach(loja => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${loja.codigo_loja}</strong></td>
            <td>${loja.nome_da_loja}</td>
            <td>${loja.uf}</td>
            <td>${loja.funcionario_nome || "-"}</td>
            <td>${loja.quantidade_minima ?? "-"}</td>
            <td>${loja.quantidade_recomendada ?? "-"}</td>
            <td>${loja["Quantidade atual"] ?? loja.quantidade_atual ?? "-"}</td>
            <td>${formatarData(loja.data_cadastro)}</td>
        `;
        corpo.appendChild(tr);
    });

    if (!corpo.children.length) {
        corpo.innerHTML = '<tr><td colspan="8">Nenhuma loja encontrada.</td></tr>';
    }

    renderizarPaginacaoLojas(lojasFiltradas.length, totalPaginas);
}

function renderizarPaginacaoLojas(totalItens, totalPaginas) {
    const paginacao = document.getElementById('paginacao-lojas');
    if (!paginacao) return;

    paginacao.innerHTML = '';
    if (totalItens <= ITENS_POR_PAGINA_LOJAS) {
        paginacao.hidden = true;
        return;
    }

    paginacao.hidden = false;
    paginacao.appendChild(criarBotaoPaginacao('‹', paginaAtualLojas - 1, paginaAtualLojas === 1, 'Página anterior'));

    paginasVisiveis(totalPaginas).forEach(item => {
        if (item === '...') {
            const span = document.createElement('span');
            span.className = 'pagination-ellipsis';
            span.textContent = '...';
            paginacao.appendChild(span);
            return;
        }

        const botao = criarBotaoPaginacao(String(item), item, false, `Página ${item}`);
        if (item === paginaAtualLojas) botao.classList.add('active');
        paginacao.appendChild(botao);
    });

    paginacao.appendChild(criarBotaoPaginacao('›', paginaAtualLojas + 1, paginaAtualLojas === totalPaginas, 'Próxima página'));
}

function criarBotaoPaginacao(texto, pagina, desabilitado, rotulo) {
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'pagination-btn';
    botao.textContent = texto;
    botao.disabled = desabilitado;
    botao.setAttribute('aria-label', rotulo);
    botao.addEventListener('click', () => {
        paginaAtualLojas = pagina;
        renderizarTabela();
    });
    return botao;
}

function paginasVisiveis(totalPaginas) {
    if (totalPaginas <= 6) {
        return Array.from({ length: totalPaginas }, (_item, index) => index + 1);
    }

    if (paginaAtualLojas <= 4) {
        return [1, 2, 3, 4, '...', totalPaginas];
    }

    if (paginaAtualLojas >= totalPaginas - 3) {
        return [1, '...', totalPaginas - 3, totalPaginas - 2, totalPaginas - 1, totalPaginas];
    }

    return [1, '...', paginaAtualLojas - 1, paginaAtualLojas, paginaAtualLojas + 1, '...', totalPaginas];
}

function obterLojasVisiveis() {
    const termo = document.getElementById('busca-loja').value.toLowerCase().trim();
    return lojas.filter(loja => {
        const texto = `${loja.codigo_loja} ${loja.nome_da_loja} ${loja.uf}`.toLowerCase();
        return texto.includes(termo);
    });
}

function exportarRelatorioLojas() {
    const linhasPadrao = obterLojasVisiveis().map(loja =>
        window.OferteReports?.normalizarLinhaRelatorioEstoque
            ? window.OferteReports.normalizarLinhaRelatorioEstoque(loja, usuarioLogado, {
                quantidade_enviada_estoque: loja['Quantidade atual'] ?? loja.quantidade_atual ?? '-',
                quantidade_recomendada: loja.quantidade_recomendada ?? '-',
                quantidade_minima: loja.quantidade_minima ?? '-',
                status_prioridade_loja: statusPrioridadeLoja(loja),
                divergencia: '-'
            })
            : loja
    );

    window.OferteReports?.exportarCsv({
        nome: 'Relatorio de lojas',
        origem: 'Lojas',
        arquivo: 'lojas.csv',
        usuario: usuarioLogado,
        linhas: linhasPadrao,
        colunas: window.OferteReports?.colunasRelatorioEstoque?.() || []
    });
    return;

    const linhas = obterLojasVisiveis().map(loja => ({
        codigo_loja: loja.codigo_loja,
        nome_da_loja: loja.nome_da_loja,
        uf: loja.uf,
        funcionario_nome: loja.funcionario_nome || '-',
        quantidade_minima: loja.quantidade_minima ?? '-',
        quantidade_recomendada: loja.quantidade_recomendada ?? '-',
        quantidade_atual: loja['Quantidade atual'] ?? loja.quantidade_atual ?? '-',
        data_cadastro: formatarData(loja.data_cadastro)
    }));

    window.OferteReports?.exportarCsv({
        nome: 'Relatório de lojas',
        origem: 'Lojas',
        arquivo: 'lojas.csv',
        usuario: usuarioLogado,
        linhas,
        colunas: [
            ['codigo_loja', 'Código da loja'],
            ['nome_da_loja', 'Nome'],
            ['uf', 'UF'],
            ['funcionario_nome', 'Funcionário'],
            ['quantidade_minima', 'Quantidade mínima'],
            ['quantidade_recomendada', 'Quantidade recomendada'],
            ['quantidade_atual', 'Quantidade atual'],
            ['data_cadastro', 'Data de cadastro']
        ]
    });
}

function salvarLojasLocal() {
    localStorage.setItem(CHAVE_LOJAS_LOCAL, JSON.stringify({ lojas, estoque_lojas: estoqueLojas }));
}

function statusPrioridadeLoja(loja) {
    const atual = Number(loja['Quantidade atual'] ?? loja.quantidade_atual ?? 0);
    const minimo = Number(loja.quantidade_minima ?? 0);
    const recomendado = Number(loja.quantidade_recomendada ?? Math.max(minimo * 3, 1));
    if (atual <= minimo) return 'Alerta';
    if (atual < recomendado) return 'Atencao';
    return 'Acima da media';
}

function montarEstoqueAPartirDasLojas(lista) {
    return (lista || []).map(loja => ({
        codigo_loja: loja.codigo_loja,
        quantidade_atual: Number(loja["Quantidade atual"] ?? loja.quantidade_atual ?? 0),
        atualizado_em: loja.atualizado_em || ""
    }));
}

function aplicarEstoqueNasLojas() {
    const estoquePorLoja = Object.fromEntries(
        estoqueLojas.map(item => [String(item.codigo_loja || "").toUpperCase(), Number(item.quantidade_atual || 0)])
    );
    lojas = lojas.map(loja => {
        const codigo = String(loja.codigo_loja || "").toUpperCase();
        if (!(codigo in estoquePorLoja)) return loja;
        return {
            ...loja,
            "Quantidade atual": estoquePorLoja[codigo],
            quantidade_atual: estoquePorLoja[codigo]
        };
    });
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

function salvarUsuariosLocal() {
    const dadosAtuais = JSON.parse(localStorage.getItem('usuariosJsonAtualizado') || '{}');
    localStorage.setItem('usuariosJsonAtualizado', JSON.stringify({
        ...dadosAtuais,
        usuarios
    }));
}

function buscarFuncionarioSelecionado() {
    const matricula = document.getElementById('cad-funcionario').value;
    if (!matricula) return null;
    return funcionarios.find(funcionario => funcionario.matricula === matricula) || null;
}

function vincularFuncionarioLocalmente(loja) {
    if (!loja.funcionario_matricula) return;

    usuarios = usuarios.map(user => {
        if (user.matricula !== loja.funcionario_matricula) return user;
        return {
            ...user,
            loja: `${loja.nome_da_loja} - ${loja.uf} (Cod: ${loja.codigo_loja})`,
            lojaNome: loja.nome_da_loja,
            lojaUf: loja.uf
        };
    });
    funcionarios = funcionarios.map(user => (
        user.matricula === loja.funcionario_matricula
            ? {
                ...user,
                loja: `${loja.nome_da_loja} - ${loja.uf} (Cod: ${loja.codigo_loja})`,
                lojaNome: loja.nome_da_loja,
                lojaUf: loja.uf
            }
            : user
    ));
    salvarUsuariosLocal();
}

function extrairNomeLoja(loja) {
    if (!loja) return "";
    return loja.split(" - ")[0].trim();
}

function extrairUfLoja(loja) {
    if (!loja) return "";
    const resultado = loja.match(/-\s*([A-Z]{2})\s*\(/);
    return resultado ? resultado[1] : "";
}

function formatarData(valor) {
    if (!valor) return '-';
    const [ano, mes, dia] = valor.split('-');
    if (!ano || !mes || !dia) return valor;
    return `${dia}/${mes}/${ano}`;
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
