const CODIGO_VERIFICACAO_FIXO = '123456';
const API_BASE = window.OFERTE_CONFIG?.API_BASE || 'http://localhost:8000';
const REQUEST_TIMEOUT_MS = window.OFERTE_CONFIG?.REQUEST_TIMEOUT_MS || 3500;
const CHAVE_USUARIOS_LOCAL = 'usuariosJsonAtualizado';

let matriculaEmRecuperacao = '';
const modalOverlay = document.getElementById('modal-reset');
const passo1 = document.getElementById('passo-1');
const passo2 = document.getElementById('passo-2');
const passo3 = document.getElementById('passo-3');

async function carregarDadosLogin() {
    const dadosLocais = JSON.parse(localStorage.getItem(CHAVE_USUARIOS_LOCAL));
    if (dadosLocais && Array.isArray(dadosLocais.usuarios)) {
        return {
            usuarios: dadosLocais.usuarios,
            perfis: normalizarPerfis(dadosLocais.perfis || [])
        };
    }

    const resposta = await fetch('../dados/usuarios.json');
    const dados = await resposta.json();
    return {
        usuarios: Array.isArray(dados) ? dados : dados.usuarios,
        perfis: normalizarPerfis(dados.perfis || [])
    };
}

async function apiRequest(route, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        const response = await fetch(`${API_BASE}${route}`, {
            ...options,
            signal: controller.signal,
            headers: {
                ...(options.body ? { 'Content-Type': 'application/json' } : {}),
                ...(options.headers || {})
            }
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.erro || data.message || 'Erro na API.');
        }
        return data;
    } finally {
        clearTimeout(timeout);
    }
}

async function autenticarNoBackend(matricula, senha) {
    const data = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ matricula, senha })
    });
    return data.usuario;
}

function registrarUsuarioLogado(usuario, perfis = []) {
    if ((usuario.status || 'Ativo') === 'Inativo') {
        alert('Usuario inativo. Acesso bloqueado.');
        return;
    }

    const atribacoes = obterAtribuicoesUsuario(usuario, perfis);

    localStorage.setItem('usuarioLogado', JSON.stringify({
        nome: usuario.nome,
        matricula: usuario.matricula,
        cargo: usuario.cargo,
        email: usuario.email,
        loja: usuario.loja,
        lojaNome: usuario.lojaNome,
        lojaUf: usuario.lojaUf,
        status: usuario.status,
        atribacoes
    }));

    switch (usuario.cargo) {
        case 'administrador':
            window.location.href = '../administrador/dashboard.html';
            break;
        case 'gestor':
            window.location.href = '../gestor/dashboard.html';
            break;
        case 'lojista':
            window.location.href = '../usuario/usuario.html';
            break;
        default:
            window.location.href = destinoInicialPorAtribuicoes(atribacoes);
    }
}

document.getElementById('form-login').addEventListener('submit', async function(e) {
    e.preventDefault();

    const matriculaInserida = document.getElementById('login-matricula').value.trim();
    const senhaInserida = document.getElementById('login-senha').value;

    try {
        const usuarioApi = await autenticarNoBackend(matriculaInserida, senhaInserida);
        registrarUsuarioLogado(usuarioApi, []);
        return;
    } catch (erroApi) {
        console.warn('Login via API falhou, tentando fallback local:', erroApi);
    }

    try {
        const dadosLogin = await carregarDadosLogin();
        const usuarioValidado = dadosLogin.usuarios.find(usuario => {
            return usuario.matricula.trim().toUpperCase() === matriculaInserida.toUpperCase()
                && senhaInserida === usuario.senha;
        });

        if (!usuarioValidado) {
            alert('Matricula ou senha incorretas.');
            return;
        }

        registrarUsuarioLogado(usuarioValidado, dadosLogin.perfis);
    } catch (erroLocal) {
        console.error('Erro ao carregar dados:', erroLocal);
        alert(`Nao foi possivel autenticar. Verifique se o backend esta rodando em ${API_BASE}.`);
    }
});

document.getElementById('btn-resetar').addEventListener('click', () => {
    modalOverlay.style.display = 'flex';
    mudarParaPasso(passo1);
});

document.querySelectorAll('.modal-close').forEach(botao => {
    botao.addEventListener('click', fecharModais);
});

modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) fecharModais();
});

function fecharModais() {
    modalOverlay.style.display = 'none';
    document.getElementById('reset-matricula').value = '';
    document.getElementById('reset-codigo').value = '';
    document.getElementById('reset-nova-senha').value = '';
    document.getElementById('reset-confirmar-senha').value = '';
}

function mudarParaPasso(passoAtivo) {
    passo1.classList.remove('active');
    passo2.classList.remove('active');
    passo3.classList.remove('active');
    passoAtivo.classList.add('active');
}

document.getElementById('btn-passo1').addEventListener('click', async () => {
    const matriculaInput = document.getElementById('reset-matricula').value.trim();
    if (!matriculaInput) {
        alert('Por favor, preencha o campo de matricula.');
        return;
    }

    try {
        const data = await apiRequest(`/api/usuarios/${encodeURIComponent(matriculaInput)}`);
        const usuario = data.usuario;
        matriculaEmRecuperacao = matriculaInput.toUpperCase();

        await apiRequest('/api/auth/recuperar-senha', {
            method: 'POST',
            body: JSON.stringify({ matricula: matriculaEmRecuperacao, email: usuario.email })
        });

        document.getElementById('lbl-email-destino').innerText = `Codigo enviado para o seguinte email, ${usuario.email}`;
        mudarParaPasso(passo2);
    } catch (erro) {
        console.error('Erro ao validar matricula:', erro);
        alert('Nao foi possivel localizar a matricula. Verifique se o backend esta ativo.');
    }
});

document.getElementById('btn-passo2').addEventListener('click', () => {
    const codigoInput = document.getElementById('reset-codigo').value.trim();

    if (codigoInput === CODIGO_VERIFICACAO_FIXO) {
        mudarParaPasso(passo3);
    } else {
        alert('Codigo de verificacao incorreto. Use o codigo padrao do prototipo: 123456');
    }
});

document.getElementById('btn-passo3').addEventListener('click', async () => {
    const novaSenha = document.getElementById('reset-nova-senha').value;
    const confirmarSenha = document.getElementById('reset-confirmar-senha').value;

    if (!novaSenha || !confirmarSenha) {
        alert('Preencha ambos os campos de senha.');
        return;
    }

    if (novaSenha !== confirmarSenha) {
        alert('As senhas nao conferem. Tente novamente.');
        return;
    }

    try {
        await apiRequest('/api/auth/redefinir-senha', {
            method: 'POST',
            body: JSON.stringify({
                matricula: matriculaEmRecuperacao,
                nova_senha: novaSenha
            })
        });

        localStorage.removeItem(`novaSenha_${matriculaEmRecuperacao}`);
        alert('Senha alterada com sucesso! Voce ja pode realizar o login.');
        fecharModais();
    } catch (erro) {
        console.error('Erro ao redefinir senha:', erro);
        alert('Nao foi possivel alterar a senha no banco. Verifique se o backend esta rodando.');
    }
});

function normalizarPerfis(perfis) {
    const padrao = [
        { nome_perfil: 'Administrador', cargo: 'administrador', atribacoes: ['dashboard', 'gerenciar-perfis', 'enviar-taloes', 'recebimentos', 'relatorios', 'lojas', 'ia'] },
        { nome_perfil: 'Gestor', cargo: 'gestor', atribacoes: ['dashboard', 'relatorios', 'ia'] },
        { nome_perfil: 'Lojista', cargo: 'lojista', atribacoes: ['dashboard'] }
    ];
    const mapa = new Map();

    [...padrao, ...(perfis || [])].forEach(perfil => {
        const cargo = normalizarCargo(perfil.cargo || perfil.nome_perfil);
        const atribacoes = normalizarAtribuicoes(perfil.atribacoes || perfil.atribuicoes || atribuirAcessosPadrao(cargo));
        if (cargo === 'administrador' && !atribacoes.includes('recebimentos')) atribacoes.push('recebimentos');
        mapa.set(cargo, {
            ...perfil,
            cargo,
            atribacoes
        });
    });

    return Array.from(mapa.values());
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

function normalizarAtribuicoes(atribuicoes) {
    return Array.from(new Set(['dashboard', ...(atribuicoes || [])])).filter(Boolean);
}

function atribuirAcessosPadrao(cargo) {
    if (cargo === 'administrador') {
        return ['dashboard', 'gerenciar-perfis', 'enviar-taloes', 'recebimentos', 'relatorios', 'lojas', 'ia'];
    }
    if (cargo === 'gestor') {
        return ['dashboard', 'relatorios', 'ia'];
    }
    return ['dashboard'];
}

function obterAtribuicoesUsuario(usuario, perfis) {
    const cargo = normalizarCargo(usuario.cargo);
    const perfil = perfis.find(item => item.cargo === cargo);
    return normalizarAtribuicoes(perfil?.atribacoes || usuario.atribacoes || usuario.atribuicoes || atribuirAcessosPadrao(cargo));
}

function destinoInicialPorAtribuicoes(atribacoes) {
    const rotas = {
        'gerenciar-perfis': '../GerenciarPerfis/perfis.html',
        'enviar-taloes': '../EnvioTaloes/envio.html',
        recebimentos: '../Recebimento/recebimento.html',
        relatorios: '../gestor/relatorios.html',
        lojas: '../Lojas/lojas.html',
        dashboard: '../administrador/dashboard.html'
    };

    const primeira = ['gerenciar-perfis', 'enviar-taloes', 'recebimentos', 'relatorios', 'lojas', 'dashboard']
        .find(item => atribacoes.includes(item));
    return rotas[primeira || 'dashboard'];
}
