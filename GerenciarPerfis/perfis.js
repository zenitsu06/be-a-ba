const CHAVE_USUARIOS_LOCAL = 'usuariosJsonAtualizado';
const CHAVE_LOJAS_LOCAL = 'lojasJsonAtualizado';
const API_BASE = window.OFERTE_CONFIG?.API_BASE || 'http://localhost:8000';
const PERFIS_PADRAO = [
    {
        id_perfil: 1,
        nome_perfil: 'Administrador',
        cargo: 'administrador',
        descricao: 'Acesso completo ao sistema',
        atribacoes: ['dashboard', 'gerenciar-perfis', 'enviar-taloes', 'relatorios', 'lojas', 'ia']
    },
    {
        id_perfil: 2,
        nome_perfil: 'Gestor',
        cargo: 'gestor',
        descricao: 'Fiscaliza estoque, relatórios e indicadores de IA',
        atribacoes: ['dashboard', 'relatorios', 'ia']
    },
    {
        id_perfil: 3,
        nome_perfil: 'Lojista',
        cargo: 'lojista',
        descricao: 'Acesso ao recebimento de talões',
        atribacoes: ['dashboard']
    }
];
const PERFIS_BASE_CARGOS = new Set(['administrador', 'gestor', 'lojista']);

let lojasRegistradas = [];
let listaUsuarios = [];
let perfisUsuarios = [];
let matriculaEmEdicao = null;
let usuariosVisiveis = [];

document.addEventListener('DOMContentLoaded', async () => {
    if (!validarAcessoPerfis()) return;
    await carregarDadosIniciais();
    atualizarCardsMetricas();
    renderizarTabelaUsuarios();
    popularSelectCargos();
    popularSelectLojas();
    renderizarListaPerfis();
    inicializarEventosModal();
});

function validarAcessoPerfis() {
    const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado') || 'null');
    if (!usuarioLogado || !window.OfertePermissions?.has('gerenciar-perfis')) {
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

async function carregarDadosIniciais() {
    const dadosApi = await apiGet('/api/usuarios');

    if (dadosApi?.usuarios) {
        listaUsuarios = normalizarUsuarios(dadosApi.usuarios);
        const perfisApi = await apiGet('/api/perfis');
        perfisUsuarios = normalizarPerfis(perfisApi?.perfis || []);
        salvarUsuariosJson();
    } else {
        const dadosLocais = JSON.parse(localStorage.getItem(CHAVE_USUARIOS_LOCAL));

        if (dadosLocais && Array.isArray(dadosLocais.usuarios)) {
            listaUsuarios = normalizarUsuarios(dadosLocais.usuarios);
            perfisUsuarios = normalizarPerfis(dadosLocais.perfis || []);
        } else {
            const respostaUsuarios = await fetch('../dados/usuarios.json');
            const dadosUsuarios = await respostaUsuarios.json();
            listaUsuarios = normalizarUsuarios(Array.isArray(dadosUsuarios) ? dadosUsuarios : dadosUsuarios.usuarios);
            perfisUsuarios = normalizarPerfis(dadosUsuarios.perfis || []);
            salvarUsuariosJson();
        }
    }

    try {
        const dadosApi = await apiGet('/api/lojas');
        let lojasFonte = dadosApi?.lojas;

        if (!lojasFonte) {
            const dadosLocais = JSON.parse(localStorage.getItem(CHAVE_LOJAS_LOCAL));
            lojasFonte = dadosLocais?.lojas;
        }

        if (!lojasFonte) {
            const respostaLojas = await fetch('../dados/lojas.json');
            const dadosLojas = await respostaLojas.json();
            lojasFonte = dadosLojas.lojas || [];
        }

        lojasRegistradas = lojasFonte.map(loja => ({
            codigo: loja.codigo_loja,
            nome: loja.nome_da_loja,
            uf: loja.uf,
            texto: `${loja.nome_da_loja} - ${loja.uf} (Cod: ${loja.codigo_loja})`
        }));
    } catch (erro) {
        lojasRegistradas = [
            { codigo: "689", nome: "Quero-quero", uf: "RS", texto: "Quero-quero - RS (Cod: 689)" },
            { codigo: "102", nome: "Filial Centro", uf: "SC", texto: "Filial Centro - SC (Cod: 102)" },
            { codigo: "405", nome: "Filial Norte", uf: "PR", texto: "Filial Norte - PR (Cod: 405)" }
        ];
    }
}

function normalizarUsuarios(usuarios) {
    return (usuarios || []).map(user => ({
        matricula: user.matricula,
        nome: user.nome,
        email: user.email,
        senha: user.senha || "123456",
        cargo: user.cargo,
        loja: user.loja || "",
        lojaNome: user.lojaNome || extrairNomeLoja(user.loja),
        lojaUf: user.lojaUf || extrairUfLoja(user.loja),
        status: user.status || "Ativo",
        atribacoes: user.atribacoes || user.atribuicoes || atribuirAcessosPadrao(user.cargo)
    }));
}

function normalizarPerfis(perfis) {
    const perfisFonte = Array.isArray(perfis) && perfis.length ? perfis : PERFIS_PADRAO;
    const porCargo = new Map();

    [...PERFIS_PADRAO, ...perfisFonte].forEach((perfil, index) => {
        const cargo = normalizarCargo(perfil.cargo || perfil.nome_perfil || perfil.nome || `perfil-${index + 1}`);
        porCargo.set(cargo, {
            id_perfil: perfil.id_perfil || index + 1,
            nome_perfil: perfil.nome_perfil || perfil.nome || formatarCargo(cargo),
            cargo,
            descricao: perfil.descricao || '',
            atribacoes: normalizarAtribuicoes(perfil.atribacoes || perfil.atribuicoes || atribuirAcessosPadrao(cargo))
        });
    });

    return Array.from(porCargo.values());
}

function normalizarCargo(valor) {
    return String(valor || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function formatarCargo(cargo) {
    return String(cargo || '')
        .split('-')
        .filter(Boolean)
        .map(parte => parte.charAt(0).toUpperCase() + parte.slice(1))
        .join(' ');
}

function normalizarAtribuicoes(atribuicoes) {
    const lista = Array.from(new Set(['dashboard', ...(atribuicoes || [])]));
    return lista.filter(Boolean);
}

function atribuirAcessosPadrao(cargo) {
    if (cargo === 'administrador') {
        return ["dashboard", "gerenciar-perfis", "enviar-taloes", "relatorios", "lojas", "ia"];
    }
    if (cargo === 'gestor') {
        return ["dashboard", "relatorios", "ia"];
    }
    return ["dashboard"];
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

function atualizarCardsMetricas() {
    const total = listaUsuarios.length;
    const ativos = listaUsuarios.filter(u => u.status === "Ativo").length;
    const inativos = total - ativos;

    document.getElementById('total-funcionarios').innerText = total;
    document.getElementById('ativos-funcionarios').innerText = ativos;
    document.getElementById('inativos-funcionarios').innerText = inativos;
}

function renderizarTabelaUsuarios(usuariosFiltrados = listaUsuarios) {
    const corpo = document.getElementById('tabela-usuarios-corpo');
    corpo.innerHTML = "";
    usuariosVisiveis = usuariosFiltrados;

    usuariosFiltrados.forEach(user => {
        const tr = document.createElement('tr');
        const badgeClass = user.status === "Ativo" ? "ativo" : "inativo";
        const btnClass = user.status === "Ativo" ? "to-inativar" : "to-ativar";
        const btnTexto = user.status === "Ativo" ? "Inativar" : "Ativar";

        tr.innerHTML = `
            <td><strong>${user.matricula}</strong></td>
            <td>${user.nome}</td>
            <td style="text-transform: capitalize;">${user.cargo}</td>
            <td>${user.loja || "-"}</td>
            <td><span class="badge-status ${badgeClass}">${user.status}</span></td>
            <td>
                <div class="action-buttons">
                    <button class="btn-action-status btn-action-edit" onclick="abrirEdicaoUsuario('${user.matricula}')">
                        Editar
                    </button>
                    <button class="btn-action-status ${btnClass}" onclick="alternarStatusUsuario('${user.matricula}')">
                        ${btnTexto}
                    </button>
                </div>
            </td>
        `;
        corpo.appendChild(tr);
    });
}

function popularSelectLojas() {
    const select = document.getElementById('cad-loja');
    select.innerHTML = '<option value="">Selecione a filial...</option>';

    const matriz = document.createElement('option');
    matriz.value = "Matriz Central";
    matriz.innerText = "Matriz Central";
    matriz.dataset.nome = "Matriz Central";
    matriz.dataset.uf = "";
    select.appendChild(matriz);

    lojasRegistradas.forEach(loja => {
        const opt = document.createElement('option');
        opt.value = loja.texto;
        opt.innerText = loja.texto;
        opt.dataset.nome = loja.nome;
        opt.dataset.uf = loja.uf;
        select.appendChild(opt);
    });
}

function popularSelectCargos() {
    const select = document.getElementById('cad-cargo');
    const valorAtual = select.value;
    select.innerHTML = '<option value="">Selecione o cargo...</option>';

    perfisUsuarios.forEach(perfil => {
        const opt = document.createElement('option');
        opt.value = perfil.cargo;
        opt.innerText = perfil.nome_perfil;
        select.appendChild(opt);
    });

    if (valorAtual && perfisUsuarios.some(perfil => perfil.cargo === valorAtual)) {
        select.value = valorAtual;
    }
}

function renderizarListaPerfis() {
    const lista = document.getElementById('lista-perfis-existentes');
    if (!lista) return;

    lista.innerHTML = '';
    perfisUsuarios.forEach(perfil => {
        const emUso = perfilEmUso(perfil.cargo);
        const protegido = PERFIS_BASE_CARGOS.has(perfil.cargo);
        const botaoDesabilitado = emUso || protegido;
        const motivo = protegido
            ? 'Perfil base'
            : emUso
                ? 'Em uso por usuario'
                : 'Pode ser excluido';

        const row = document.createElement('div');
        row.className = 'profile-existing-row';
        row.innerHTML = `
            <div>
                <strong>${perfil.nome_perfil}</strong>
                <small>${perfil.cargo} - ${motivo}</small>
            </div>
            <button class="btn-profile-delete" type="button" ${botaoDesabilitado ? 'disabled' : ''} onclick="excluirPerfil('${perfil.cargo}')">
                Excluir
            </button>
        `;
        lista.appendChild(row);
    });
}

function perfilEmUso(cargo) {
    return listaUsuarios.some(user => normalizarCargo(user.cargo) === cargo);
}

function buscarPerfilPorCargo(cargo) {
    return perfisUsuarios.find(perfil => perfil.cargo === cargo) || null;
}

async function excluirPerfil(cargo) {
    const perfil = buscarPerfilPorCargo(cargo);
    if (!perfil) return;
    if (PERFIS_BASE_CARGOS.has(cargo)) {
        alert('Perfis base do sistema nao podem ser excluidos.');
        return;
    }
    if (perfilEmUso(cargo)) {
        alert('Esse perfil esta vinculado a usuarios. Altere o cargo desses usuarios antes de excluir.');
        return;
    }
    if (!confirm(`Excluir o perfil "${perfil.nome_perfil}"?`)) return;

    const respostaApi = await apiPost('/api/perfis/excluir', { cargo });
    if (respostaApi === null) {
        console.warn('Backend indisponivel. Excluindo perfil apenas localmente.');
    }

    perfisUsuarios = perfisUsuarios.filter(item => item.cargo !== cargo);
    salvarUsuariosJson();
    popularSelectCargos();
    renderizarListaPerfis();
    alert('Perfil excluido com sucesso.');
}

async function alternarStatusUsuario(matricula) {
    const usuario = listaUsuarios.find(user => user.matricula === matricula);
    if (!usuario) return;

    const novoStatus = usuario.status === "Ativo" ? "Inativo" : "Ativo";
    const respostaApi = await apiPost('/api/usuarios/status', { matricula, status: novoStatus });

    listaUsuarios = listaUsuarios.map(user => {
        if (user.matricula !== matricula) return user;
        return {
            ...user,
            ...(respostaApi?.usuario || {}),
            status: respostaApi?.usuario?.status || novoStatus
        };
    });

    salvarDadosERefrescar();
}

function abrirEdicaoUsuario(matricula) {
    const usuario = listaUsuarios.find(user => user.matricula === matricula);
    if (!usuario) return;

    matriculaEmEdicao = matricula;
    document.getElementById('modal-titulo').innerText = "Editar Usuário";
    document.getElementById('btn-salvar-usuario').innerText = "Salvar Alterações";
    document.getElementById('cad-matricula').value = usuario.matricula;
    document.getElementById('cad-nome').value = usuario.nome;
    document.getElementById('cad-email').value = usuario.email;
    document.getElementById('cad-senha').value = usuario.senha;
    document.getElementById('cad-cargo').value = usuario.cargo;
    document.getElementById('cad-loja').value = usuario.loja;

    document.querySelectorAll('input[name="atribuicao"]').forEach(chk => {
        chk.checked = (usuario.atribacoes || []).includes(chk.value);
    });

    atualizarVisibilidadeAtribuicoes(usuario.cargo);
    document.getElementById('modal-cadastro').style.display = 'flex';
}

function inicializarEventosModal() {
    const modal = document.getElementById('modal-cadastro');
    const modalPerfil = document.getElementById('modal-perfil');
    const btnAbrir = document.getElementById('btn-abrir-cadastro');
    const btnFechar = document.getElementById('btn-fechar-modal');
    const btnAbrirPerfil = document.getElementById('btn-abrir-perfil');
    const btnFecharPerfil = document.getElementById('btn-fechar-modal-perfil');
    const cargoSelect = document.getElementById('cad-cargo');

    btnAbrir.addEventListener('click', () => {
        prepararFormularioCadastro();
        modal.style.display = 'flex';
    });

    btnFechar.addEventListener('click', () => {
        fecharModalCadastro();
    });

    btnAbrirPerfil.addEventListener('click', () => {
        prepararFormularioPerfil();
        renderizarListaPerfis();
        modalPerfil.style.display = 'flex';
    });

    btnFecharPerfil.addEventListener('click', () => {
        fecharModalPerfil();
    });

    cargoSelect.addEventListener('change', (e) => {
        aplicarAtribuicoesDoCargo(e.target.value);
        atualizarVisibilidadeAtribuicoes(e.target.value);
    });

    document.getElementById('form-cadastro-usuario').addEventListener('submit', async (e) => {
        e.preventDefault();
        await salvarUsuarioDoFormulario();
    });

    document.getElementById('form-cadastro-perfil').addEventListener('submit', async (e) => {
        e.preventDefault();
        await salvarPerfilDoFormulario();
    });

    document.getElementById('busca-usuario').addEventListener('input', (e) => {
        const termo = e.target.value.toLowerCase().trim();
        const resultado = listaUsuarios.filter(u =>
            u.nome.toLowerCase().includes(termo) ||
            u.matricula.toLowerCase().includes(termo)
        );
        renderizarTabelaUsuarios(resultado);
    });

    document.getElementById('btn-exportar-usuarios')?.addEventListener('click', exportarRelatorioUsuarios);
}

function prepararFormularioCadastro() {
    matriculaEmEdicao = null;
    document.getElementById('modal-titulo').innerText = "Cadastrar Novo Usuário";
    document.getElementById('btn-salvar-usuario').innerText = "Concluir Cadastro";
    document.getElementById('form-cadastro-usuario').reset();
    document.getElementById('cad-matricula').value = gerarNovaMatriculaUnica();
    atualizarVisibilidadeAtribuicoes("");
}

function prepararFormularioPerfil() {
    document.getElementById('form-cadastro-perfil').reset();
    document.querySelectorAll('input[name="perfil-atribuicao"]').forEach(chk => {
        chk.checked = chk.value === 'dashboard';
    });
}

function fecharModalCadastro() {
    document.getElementById('modal-cadastro').style.display = 'none';
    document.getElementById('form-cadastro-usuario').reset();
    matriculaEmEdicao = null;
    atualizarVisibilidadeAtribuicoes("");
}

function fecharModalPerfil() {
    document.getElementById('modal-perfil').style.display = 'none';
    document.getElementById('form-cadastro-perfil').reset();
}

function atualizarVisibilidadeAtribuicoes(cargo) {
    const blocoAtribuicoes = document.getElementById('bloco-atribacoes');
    blocoAtribuicoes.style.display = cargo === 'lojista' ? 'none' : 'flex';
}

function aplicarAtribuicoesDoCargo(cargo) {
    const perfil = buscarPerfilPorCargo(cargo);
    const atribacoes = perfil?.atribacoes || atribuirAcessosPadrao(cargo);

    document.querySelectorAll('input[name="atribuicao"]').forEach(chk => {
        chk.checked = atribacoes.includes(chk.value);
    });
}

async function salvarPerfilDoFormulario() {
    const nome = document.getElementById('perfil-nome').value.trim();
    const cargo = normalizarCargo(document.getElementById('perfil-cargo').value);
    const atribacoes = normalizarAtribuicoes(
        Array.from(document.querySelectorAll('input[name="perfil-atribuicao"]:checked')).map(chk => chk.value)
    );

    if (!nome || !cargo) {
        alert('Informe nome e cargo para criar o perfil.');
        return;
    }

    const perfil = {
        id_perfil: buscarPerfilPorCargo(cargo)?.id_perfil || gerarNovoIdPerfil(),
        nome_perfil: nome,
        cargo,
        descricao: `Perfil ${nome}`,
        atribacoes
    };

    const respostaApi = await apiPost('/api/perfis', perfil);
    const perfilPersistido = normalizarPerfis([respostaApi?.perfil || perfil])[0];

    perfisUsuarios = normalizarPerfis([
        ...perfisUsuarios.filter(item => item.cargo !== perfilPersistido.cargo),
        perfilPersistido
    ]);

    salvarUsuariosJson();
    popularSelectCargos();
    renderizarListaPerfis();
    fecharModalPerfil();
    alert('Perfil criado com sucesso.');
}

function gerarNovoIdPerfil() {
    return perfisUsuarios.reduce((maior, perfil) => Math.max(maior, Number(perfil.id_perfil || 0)), 0) + 1;
}

async function salvarUsuarioDoFormulario() {
    const cargoSelect = document.getElementById('cad-cargo');
    const lojaSelect = document.getElementById('cad-loja');
    const lojaSelecionada = lojaSelect.options[lojaSelect.selectedIndex];
    const atribuicoesSelecionadas = ['dashboard'];

    if (cargoSelect.value !== 'lojista') {
        document.querySelectorAll('input[name="atribuicao"]:checked').forEach(chk => {
            atribuicoesSelecionadas.push(chk.value);
        });
    }

    const usuarioAtual = matriculaEmEdicao
        ? listaUsuarios.find(user => user.matricula === matriculaEmEdicao)
        : null;

    const usuarioFormulario = {
        matricula: document.getElementById('cad-matricula').value,
        nome: document.getElementById('cad-nome').value.trim(),
        email: document.getElementById('cad-email').value.trim(),
        senha: document.getElementById('cad-senha').value,
        cargo: cargoSelect.value,
        loja: lojaSelect.value,
        lojaNome: lojaSelecionada.dataset.nome || extrairNomeLoja(lojaSelect.value),
        lojaUf: lojaSelecionada.dataset.uf || extrairUfLoja(lojaSelect.value),
        status: usuarioAtual?.status || "Ativo",
        atribacoes: atribuicoesSelecionadas
    };

    const respostaApi = await apiPost('/api/usuarios', usuarioFormulario);
    const usuarioPersistido = normalizarUsuarios([respostaApi?.usuario || usuarioFormulario])[0];

    if (matriculaEmEdicao) {
        listaUsuarios = listaUsuarios.map(user => {
            if (user.matricula !== matriculaEmEdicao) return user;
            return { ...user, ...usuarioPersistido, status: user.status };
        });
    } else {
        listaUsuarios.push(usuarioPersistido);
    }

    salvarDadosERefrescar();
    fecharModalCadastro();
}

function gerarNovaMatriculaUnica() {
    let matriculaGerada = "";
    let existe = true;

    while (existe) {
        const numAleatorio = Math.floor(1000 + Math.random() * 9000);
        matriculaGerada = `QQ${numAleatorio}`;
        existe = listaUsuarios.some(u => u.matricula === matriculaGerada);
    }
    return matriculaGerada;
}

function salvarUsuariosJson() {
    localStorage.setItem(CHAVE_USUARIOS_LOCAL, JSON.stringify({
        usuarios: listaUsuarios,
        perfis: perfisUsuarios
    }));
}

function salvarDadosERefrescar() {
    salvarUsuariosJson();
    localStorage.setItem('bancoUsuarios', JSON.stringify(listaUsuarios));
    atualizarCardsMetricas();
    renderizarTabelaUsuarios();
}

function exportarRelatorioUsuarios() {
    const linhas = (usuariosVisiveis.length ? usuariosVisiveis : listaUsuarios).map(user => ({
        matricula: user.matricula,
        nome: user.nome,
        email: user.email,
        cargo: user.cargo,
        loja: user.loja || '-',
        status: user.status,
        atribacoes: (user.atribacoes || []).join(', ')
    }));

    const usuario = JSON.parse(localStorage.getItem('usuarioLogado') || 'null');
    window.OferteReports?.exportarCsv({
        nome: 'Relatório de usuários',
        origem: 'Gerenciar Perfis',
        arquivo: 'usuarios.csv',
        usuario,
        linhas,
        colunas: [
            ['matricula', 'Matrícula'],
            ['nome', 'Nome'],
            ['email', 'E-mail'],
            ['cargo', 'Cargo'],
            ['loja', 'Loja vinculada'],
            ['status', 'Status'],
            ['atribacoes', 'Atribuições']
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
