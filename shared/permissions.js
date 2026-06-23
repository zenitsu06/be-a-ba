(function () {
    const DEFAULT_PERMISSIONS = {
        administrador: ['dashboard', 'gerenciar-perfis', 'enviar-taloes', 'relatorios', 'lojas', 'ia'],
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
        return Array.from(new Set([
            'dashboard',
            ...((usuario.atribacoes || usuario.atribuicoes || DEFAULT_PERMISSIONS[cargo] || []) || [])
        ]));
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

    document.addEventListener('DOMContentLoaded', aplicarSidebar);
})();
