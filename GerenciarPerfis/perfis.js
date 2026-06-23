const CHAVE_USUARIOS_LOCAL = 'usuariosJsonAtualizado';
const CHAVE_LOJAS_LOCAL = 'lojasJsonAtualizado';
const API_BASE = window.OFERTE_CONFIG?.API_BASE || 'http://localhost:8000';

let lojasRegistradas = [];
let listaUsuarios = [];
let perfisUsuarios = [];
let matriculaEmEdicao = null;

document.addEventListener('DOMContentLoaded', async () => {
    await carregarDadosIniciais();
    atualizarCardsMetricas();
    renderizarTabelaUsuarios();
    popularSelectLojas();
    inicializarEventosModal();
});

async function carregarDadosIniciais() {
    const dadosApi = await apiGet('/api/usuarios');

    if (dadosApi?.usuarios) {
        listaUsuarios = normalizarUsuarios(dadosApi.usuarios);
        const perfisApi = await apiGet('/api/perfis');
        perfisUsuarios = perfisApi?.perfis || [];
        salvarUsuariosJson();
    } else {
        const dadosLocais = JSON.parse(localStorage.getItem(CHAVE_USUARIOS_LOCAL));

        if (dadosLocais && Array.isArray(dadosLocais.usuarios)) {
            listaUsuarios = normalizarUsuarios(dadosLocais.usuarios);
            perfisUsuarios = dadosLocais.perfis || [];
        } else {
            const respostaUsuarios = await fetch('../dados/usuarios.json');
            const dadosUsuarios = await respostaUsuarios.json();
            listaUsuarios = normalizarUsuarios(Array.isArray(dadosUsuarios) ? dadosUsuarios : dadosUsuarios.usuarios);
            perfisUsuarios = dadosUsuarios.perfis || [];
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

function atribuirAcessosPadrao(cargo) {
    if (cargo === 'administrador') {
        return ["dashboard", "gerenciar-perfis", "enviar-taloes", "lojas"];
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
    const btnAbrir = document.getElementById('btn-abrir-cadastro');
    const btnFechar = document.getElementById('btn-fechar-modal');
    const cargoSelect = document.getElementById('cad-cargo');

    btnAbrir.addEventListener('click', () => {
        prepararFormularioCadastro();
        modal.style.display = 'flex';
    });

    btnFechar.addEventListener('click', () => {
        fecharModalCadastro();
    });

    cargoSelect.addEventListener('change', (e) => {
        atualizarVisibilidadeAtribuicoes(e.target.value);
    });

    document.getElementById('form-cadastro-usuario').addEventListener('submit', async (e) => {
        e.preventDefault();
        await salvarUsuarioDoFormulario();
    });

    document.getElementById('busca-usuario').addEventListener('input', (e) => {
        const termo = e.target.value.toLowerCase().trim();
        const resultado = listaUsuarios.filter(u =>
            u.nome.toLowerCase().includes(termo) ||
            u.matricula.toLowerCase().includes(termo)
        );
        renderizarTabelaUsuarios(resultado);
    });
}

function prepararFormularioCadastro() {
    matriculaEmEdicao = null;
    document.getElementById('modal-titulo').innerText = "Cadastrar Novo Usuário";
    document.getElementById('btn-salvar-usuario').innerText = "Concluir Cadastro";
    document.getElementById('form-cadastro-usuario').reset();
    document.getElementById('cad-matricula').value = gerarNovaMatriculaUnica();
    atualizarVisibilidadeAtribuicoes("");
}

function fecharModalCadastro() {
    document.getElementById('modal-cadastro').style.display = 'none';
    document.getElementById('form-cadastro-usuario').reset();
    matriculaEmEdicao = null;
    atualizarVisibilidadeAtribuicoes("");
}

function atualizarVisibilidadeAtribuicoes(cargo) {
    const blocoAtribuicoes = document.getElementById('bloco-atribacoes');
    blocoAtribuicoes.style.display = cargo === 'lojista' ? 'none' : 'flex';
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
