(function () {
    const API_BASE = window.OFERTE_CONFIG?.API_BASE || 'http://localhost:8000';
    const CHAT_STORAGE_KEY = 'oferteChatbotHistorico';

    prepararLimpezaNoLogout();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', criarChatbot);
    } else {
        criarChatbot();
    }

    function criarChatbot() {
        if (document.querySelector('.chatbot-fab')) return;

        const botao = document.createElement('button');
        botao.className = 'chatbot-fab';
        botao.type = 'button';
        botao.textContent = 'IA';
        botao.setAttribute('aria-label', 'Abrir assistente');

        const painel = document.createElement('section');
        painel.className = 'chatbot-panel';
        painel.setAttribute('aria-label', 'Assistente conversacional');
        painel.innerHTML = `
            <div class="chatbot-header">
                <strong>Assistente Verdecard</strong>
                <button class="chatbot-close" type="button" aria-label="Fechar assistente">&times;</button>
            </div>
            <div class="chatbot-messages"></div>
            <form class="chatbot-form">
                <input class="chatbot-input" type="text" maxlength="280" autocomplete="off" placeholder="Pergunte sobre estoque, lojas, envios ou recebimentos">
                <button class="chatbot-send" type="submit">Enviar</button>
            </form>
        `;

        document.body.appendChild(botao);
        document.body.appendChild(painel);

        const mensagens = painel.querySelector('.chatbot-messages');
        const formulario = painel.querySelector('.chatbot-form');
        const input = painel.querySelector('.chatbot-input');
        const enviar = painel.querySelector('.chatbot-send');

        carregarHistorico(mensagens);

        formulario.addEventListener('submit', (event) => {
            event.preventDefault();
            enviarPergunta(input.value, mensagens, input, enviar);
        });

        botao.addEventListener('click', () => {
            painel.classList.toggle('open');
            if (!mensagens.children.length) {
                adicionarMensagem(
                    mensagens,
                    'Ola. Digite sua pergunta para consultar os indicadores calculados pela IA.',
                    'bot'
                );
            }
            if (painel.classList.contains('open')) input.focus();
        });

        painel.querySelector('.chatbot-close').addEventListener('click', () => {
            painel.classList.remove('open');
        });
    }

    async function enviarPergunta(valor, mensagens, input, enviar) {
        const pergunta = String(valor || '').trim();
        if (!pergunta) return;

        adicionarMensagem(mensagens, pergunta, 'user');
        input.value = '';
        input.disabled = true;
        enviar.disabled = true;

        const carregando = adicionarMensagem(mensagens, 'Analisando pergunta...', 'bot', false);
        carregando.classList.add('loading');

        const resposta = await responderPerguntaIA(pergunta);
        carregando.classList.remove('loading');
        carregando.textContent = resposta || 'Nao consegui consultar a camada de IA agora. Verifique se o backend Node e a FastAPI da IA estao ativos.';
        mensagens.scrollTop = mensagens.scrollHeight;
        salvarHistorico(mensagens);

        input.disabled = false;
        enviar.disabled = false;
        input.focus();
    }

    function adicionarMensagem(container, texto, tipo, persistir = true) {
        const mensagem = document.createElement('div');
        mensagem.className = `chatbot-message ${tipo}`;
        mensagem.textContent = texto;
        container.appendChild(mensagem);
        container.scrollTop = container.scrollHeight;
        if (persistir) salvarHistorico(container);
        return mensagem;
    }

    function carregarHistorico(container) {
        const historico = lerHistorico();
        historico.forEach(item => {
            if (!item?.texto || !['bot', 'user'].includes(item.tipo)) return;
            adicionarMensagem(container, item.texto, item.tipo, false);
        });
    }

    function lerHistorico() {
        try {
            const historico = JSON.parse(localStorage.getItem(CHAT_STORAGE_KEY) || '[]');
            return Array.isArray(historico) ? historico : [];
        } catch (erro) {
            return [];
        }
    }

    function salvarHistorico(container) {
        const mensagens = Array.from(container.querySelectorAll('.chatbot-message:not(.loading)'))
            .map(item => ({
                tipo: item.classList.contains('user') ? 'user' : 'bot',
                texto: item.textContent || ''
            }))
            .filter(item => item.texto.trim());
        localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(mensagens.slice(-30)));
    }

    function prepararLimpezaNoLogout() {
        if (window.__OFERTE_CHATBOT_STORAGE_PATCHED__) return;
        window.__OFERTE_CHATBOT_STORAGE_PATCHED__ = true;

        const removerOriginal = localStorage.removeItem.bind(localStorage);
        localStorage.removeItem = function removerComHistorico(key) {
            if (key === 'usuarioLogado') removerOriginal(CHAT_STORAGE_KEY);
            return removerOriginal(key);
        };

        const limparOriginal = localStorage.clear.bind(localStorage);
        localStorage.clear = function limparComHistorico() {
            removerOriginal(CHAT_STORAGE_KEY);
            return limparOriginal();
        };
    }

    async function responderPerguntaIA(pergunta) {
        try {
            const response = await fetch(`${API_BASE}/api/chatbot`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pergunta })
            });
            if (!response.ok) return "";
            const data = await response.json();
            return data.resposta || "";
        } catch (erro) {
            return "";
        }
    }
})();
