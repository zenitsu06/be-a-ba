(function () {
    const DEFAULT_PERMISSIONS = {
        administrador: ['dashboard', 'gerenciar-perfis', 'enviar-taloes', 'recebimentos', 'relatorios', 'lojas', 'ia'],
        gestor: ['dashboard', 'relatorios', 'ia'],
        lojista: ['dashboard']
    };

    function normalizarCargo(valor) {
        return String(valor || '')
            .trim()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
    }

    function usuarioAtual() {
        try {
            return JSON.parse(localStorage.getItem('usuarioLogado') || 'null');
        } catch (erro) {
            return null;
        }
    }

    function atribuicoesUsuario() {
        const usuario = usuarioAtual();
        if (!usuario) return [];

        const cargo = normalizarCargo(usuario.cargo);
        const atribuicoesSalvas = usuario.atribacoes || usuario.atribuicoes || [];
        const permissoes = new Set([
            'dashboard',
            ...(DEFAULT_PERMISSIONS[cargo] || []),
            ...(Array.isArray(atribuicoesSalvas) ? atribuicoesSalvas : [])
        ]);

        if (cargo === 'administrador') permissoes.add('recebimentos');
        return Array.from(permissoes);
    }

    function temPermissao(permissao) {
        return atribuicoesUsuario().includes(permissao);
    }

    function inferirPermissao(link) {
        const texto = link.textContent.trim().toLowerCase();
        const href = link.getAttribute('href') || '';

        if (link.dataset.permission) return link.dataset.permission;
        if (texto.includes('dashboard')) return 'dashboard';
        if (texto.includes('gerenciar')) return 'gerenciar-perfis';
        if (texto.includes('enviar') || href.includes('EnvioTaloes')) return 'enviar-taloes';
        if (texto.includes('recebimento') || href.includes('Recebimento')) return 'recebimentos';
        if (texto.includes('relatório') || texto.includes('relatorios') || href.includes('relatorios')) return 'relatorios';
        if (texto.includes('lojas') || href.includes('Lojas')) return 'lojas';
        return '';
    }

    function aplicarSidebar() {
        const permissoes = atribuicoesUsuario();
        document.querySelectorAll('.sidebar-menu a, .manager-nav a').forEach(link => {
            const permissao = inferirPermissao(link);
            if (!permissao) return;
            link.style.display = permissoes.includes(permissao) ? '' : 'none';
        });

        setTimeout(() => {
            if (permissoes.includes('ia')) return;
            document.querySelectorAll('.chatbot-fab, .chatbot-panel').forEach(item => {
                item.style.display = 'none';
            });
        }, 80);
    }

    function inicializarMenuMobile() {
        const sidebar = document.querySelector('.sidebar:not(.report-sidebar)');
        const header = document.querySelector('.admin-header');

        if (!sidebar || !header || document.querySelector('.mobile-sidebar-toggle')) return;

        if (!sidebar.id) sidebar.id = 'app-sidebar';

        const botao = document.createElement('button');
        botao.type = 'button';
        botao.className = 'mobile-sidebar-toggle';
        botao.setAttribute('aria-label', 'Abrir menu');
        botao.setAttribute('aria-controls', sidebar.id);
        botao.setAttribute('aria-expanded', 'false');
        botao.innerHTML = '<span></span><span></span><span></span>';
        header.insertBefore(botao, header.firstElementChild);

        const overlay = document.createElement('div');
        overlay.className = 'sidebar-overlay';
        overlay.hidden = true;
        document.body.appendChild(overlay);

        function alternarMenu(aberto) {
            document.body.classList.toggle('sidebar-open', aberto);
            botao.setAttribute('aria-expanded', String(aberto));
            botao.setAttribute('aria-label', aberto ? 'Fechar menu' : 'Abrir menu');
            overlay.hidden = !aberto;
        }

        botao.addEventListener('click', () => {
            alternarMenu(!document.body.classList.contains('sidebar-open'));
        });

        overlay.addEventListener('click', () => alternarMenu(false));

        sidebar.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => alternarMenu(false));
        });

        window.addEventListener('keydown', (evento) => {
            if (evento.key === 'Escape') alternarMenu(false);
        });

        window.addEventListener('resize', () => {
            if (window.matchMedia('(min-width: 901px)').matches) {
                alternarMenu(false);
            }
        });
    }

    function exigir(permissao, fallback = '../login/login.html') {
        const usuario = usuarioAtual();
        if (!usuario || !temPermissao(permissao)) {
            window.location.href = fallback;
            return false;
        }
        return true;
    }

    window.OfertePermissions = {
        apply: aplicarSidebar,
        getAllowed: atribuicoesUsuario,
        has: temPermissao,
        require: exigir
    };

    document.addEventListener('DOMContentLoaded', () => {
        aplicarSidebar();
        inicializarMenuMobile();
    });
})();
