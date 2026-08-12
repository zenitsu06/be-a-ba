(function () {
    const estadoPaginas = {};
    const ITENS_PADRAO = 10;

    function pagina(chave, linhas, opcoes = {}) {
        const itensPorPagina = opcoes.itensPorPagina || ITENS_PADRAO;
        const totalItens = linhas.length;
        const totalPaginas = Math.max(Math.ceil(totalItens / itensPorPagina), 1);
        const atual = Math.min(Math.max(estadoPaginas[chave] || 1, 1), totalPaginas);
        estadoPaginas[chave] = atual;
        const inicio = (atual - 1) * itensPorPagina;

        return {
            itens: linhas.slice(inicio, inicio + itensPorPagina),
            paginaAtual: atual,
            totalPaginas,
            totalItens,
            itensPorPagina
        };
    }

    function resetar(chave) {
        estadoPaginas[chave] = 1;
    }

    function renderizar(containerId, chave, estado, aoMudarPagina) {
        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = '';
        if (estado.totalItens <= estado.itensPorPagina) {
            container.hidden = true;
            return;
        }

        container.hidden = false;
        container.appendChild(criarBotao('‹', estado.paginaAtual - 1, estado.paginaAtual === 1, 'Página anterior'));

        paginasVisiveis(estado.paginaAtual, estado.totalPaginas).forEach(item => {
            if (item === '...') {
                const span = document.createElement('span');
                span.className = 'pagination-ellipsis';
                span.textContent = '...';
                container.appendChild(span);
                return;
            }

            const botao = criarBotao(String(item), item, false, `Página ${item}`);
            if (item === estado.paginaAtual) botao.classList.add('active');
            container.appendChild(botao);
        });

        container.appendChild(criarBotao('›', estado.paginaAtual + 1, estado.paginaAtual === estado.totalPaginas, 'Próxima página'));

        function criarBotao(texto, paginaDestino, desabilitado, rotulo) {
            const botao = document.createElement('button');
            botao.type = 'button';
            botao.className = 'pagination-btn';
            botao.textContent = texto;
            botao.disabled = desabilitado;
            botao.setAttribute('aria-label', rotulo);
            botao.addEventListener('click', () => {
                estadoPaginas[chave] = paginaDestino;
                aoMudarPagina();
            });
            return botao;
        }
    }

    function paginasVisiveis(atual, total) {
        if (total <= 6) return Array.from({ length: total }, (_item, index) => index + 1);
        if (atual <= 4) return [1, 2, 3, 4, '...', total];
        if (atual >= total - 3) return [1, '...', total - 3, total - 2, total - 1, total];
        return [1, '...', atual - 1, atual, atual + 1, '...', total];
    }

    window.OfertePagination = {
        pagina,
        renderizar,
        resetar
    };
})();
