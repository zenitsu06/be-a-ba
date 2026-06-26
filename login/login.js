
const CODIGO_VERIFICACAO_FIXO = "123456";

let matriculaEmRecuperacao = "";
const modalOverlay = document.getElementById('modal-reset');
const passo1 = document.getElementById('passo-1');
const passo2 = document.getElementById('passo-2');
const passo3 = document.getElementById('passo-3');
const CHAVE_USUARIOS_LOCAL = 'usuariosJsonAtualizado';

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

async function carregarUsuarios() {
    return (await carregarDadosLogin()).usuarios;
}

document.getElementById('form-login').addEventListener('submit', async function(e) {
    e.preventDefault();

    const matriculaInserida = document.getElementById('login-matricula').value.trim();
    const senhaInserida = document.getElementById('login-senha').value;

    try {
        const dadosLogin = await carregarDadosLogin();
        const listaUsuarios = dadosLogin.usuarios;
        
        // Verifica se há alguma senha modificada localmente no LocalStorage
        const senhaAlteradaLocalmente = localStorage.getItem(`novaSenha_${matriculaInserida}`);

        const usuarioValidado = listaUsuarios.find(u => {
            const senhaCorreta = senhaAlteradaLocalmente ? senhaAlteradaLocalmente : u.senha;
            // Garante a verificação ignorando maiúsculas/minúsculas (Ex: qq1001 funciona como QQ1001)
            return u.matricula.trim().toUpperCase() === matriculaInserida.toUpperCase() && senhaInserida === senhaCorreta;
        });

        if (usuarioValidado) {
            if (usuarioValidado.status === "Inativo") {
                alert('Usuário inativo. Acesso bloqueado.');
                return;
            }

            const atribacoes = obterAtribuicoesUsuario(usuarioValidado, dadosLogin.perfis);

            localStorage.setItem('usuarioLogado', JSON.stringify({
                nome: usuarioValidado.nome,
                matricula: usuarioValidado.matricula,
                cargo: usuarioValidado.cargo,
                email: usuarioValidado.email,
                loja: usuarioValidado.loja,
                lojaNome: usuarioValidado.lojaNome,
                lojaUf: usuarioValidado.lojaUf,
                status: usuarioValidado.status,
                atribacoes
            }));

            // Redirecionamento baseado nos cargos do seu JSON
            switch (usuarioValidado.cargo) {
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
        } else {
            alert('Matrícula ou senha incorretas.');
        }

    } catch (erro) {
        console.error('Erro ao carregar dados:', erro);
        alert('Erro ao conectar. Verifique se o Live Server está ativo.');
    }
});

// --- LÓGICA DE NAVEGAÇÃO DOS POP-UPS ---

// Abrir o primeiro Pop-up ao clicar em Resetar
document.getElementById('btn-resetar').addEventListener('click', () => {
    modalOverlay.style.display = 'flex';
    mudarParaPasso(passo1);
});

// Fechar os modais ao clicar no 'X' ou fora do card
document.querySelectorAll('.modal-close').forEach(botao => {
    botao.addEventListener('click', fecharModais);
});
modalOverlay.addEventListener('click', (e) => {
    if(e.target === modalOverlay) fecharModais();
});

function fecharModais() {
    modalOverlay.style.display = 'none';
    // Limpa os inputs ao fechar
    document.getElementById('reset-matricula').value = "";
    document.getElementById('reset-codigo').value = "";
    document.getElementById('reset-nova-senha').value = "";
    document.getElementById('reset-confirmar-senha').value = "";
}

function mudarParaPasso(passoAtivo) {
    passo1.classList.remove('active');
    passo2.classList.remove('active');
    passo3.classList.remove('active');
    passoAtivo.classList.add('active');
}
// 1º PASSO: Valida a Matrícula contra o JSON
document.getElementById('btn-passo1').addEventListener('click', async () => {
    const matriculaInput = document.getElementById('reset-matricula').value.trim();
    if(!matriculaInput) {
        alert("Por favor, preencha o campo de matrícula.");
        return;
    }

    try {
        const listaUsuarios = await carregarUsuarios();
        
        // Log auxiliar para debugar no F12 do navegador
        console.log("Matrícula digitada:", matriculaInput);
        console.log("Lista carregada:", listaUsuarios);

        const usuario = listaUsuarios.find(u => u.matricula.trim().toUpperCase() === matriculaInput.toUpperCase());

        if(usuario) {
            matriculaEmRecuperacao = matriculaInput;
            // Atualiza dinamicamente o texto com o e-mail do JSON
            document.getElementById('lbl-email-destino').innerText = `Código enviado para o seguinte email, ${usuario.email}`;
            mudarParaPasso(passo2);
        } else {
            alert("Matrícula não localizada no sistema. Certifique-se de digitar exatamente como no cadastro (Ex: QQ1001).");
        }
    } catch (erro) {
        console.error("Erro ao validar matrícula:", erro);
        alert("Não foi possível carregar os dados. Certifique-se de que está abrindo o projeto através do 'Live Server'.");
    }
});

// 2º PASSO: Valida se o código confere com a variável mockada fixada
document.getElementById('btn-passo2').addEventListener('click', () => {
    const codigoInput = document.getElementById('reset-codigo').value.trim();

    if(codigoInput === CODIGO_VERIFICACAO_FIXO) {
        mudarParaPasso(passo3);
    } else {
        alert("Código de verificação incorreto! Utilize o código padrão do protótipo: 1234");
    }
});

// 3º PASSO: Salva a nova senha mockada vinculada à matrícula
document.getElementById('btn-passo3').addEventListener('click', () => {
    const novaSenha = document.getElementById('reset-nova-senha').value;
    const confirmarSenha = document.getElementById('reset-confirmar-senha').value;

    if(!novaSenha || !confirmarSenha) {
        alert("Preencha ambos os campos de senha.");
        return;
    }

    if(novaSenha !== confirmarSenha) {
        alert("As senhas não conferem. Tente novamente.");
        return;
    }

    // "Salva" de forma mockada no LocalStorage simulando o update do JSON
    localStorage.setItem(`novaSenha_${matriculaEmRecuperacao}`, novaSenha);
    
    alert("Senha alterada com sucesso! Você já pode realizar o login.");
    fecharModais();
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
