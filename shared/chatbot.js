(function () {
    const API_BASE = window.OFERTE_CONFIG?.API_BASE || 'http://localhost:8000';
    const perguntas = [
        'Quais lojas estão abaixo do estoque mínimo?',
        'Qual foi o total de talões enviados essa semana?'
    ];

    document.addEventListener('DOMContentLoaded', () => {
        criarChatbot();
    });

    function criarChatbot() {
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
            <div class="chatbot-suggestions"></div>
        `;

        document.body.appendChild(botao);
        document.body.appendChild(painel);

        const mensagens = painel.querySelector('.chatbot-messages');
        const sugestoes = painel.querySelector('.chatbot-suggestions');

        perguntas.forEach(pergunta => {
            const item = document.createElement('button');
            item.className = 'chatbot-question';
            item.type = 'button';
            item.textContent = pergunta;
            item.addEventListener('click', async () => {
                adicionarMensagem(mensagens, pergunta, 'user');
                adicionarMensagem(mensagens, await responderPergunta(pergunta), 'bot');
            });
            sugestoes.appendChild(item);
        });

        botao.addEventListener('click', () => {
            painel.classList.toggle('open');
            if (!mensagens.children.length) {
                adicionarMensagem(mensagens, 'Olá. Escolha uma pergunta pronta para consultar os indicadores do sistema.', 'bot');
            }
        });

        painel.querySelector('.chatbot-close').addEventListener('click', () => {
            painel.classList.remove('open');
        });
    }

    function adicionarMensagem(container, texto, tipo) {
        const mensagem = document.createElement('div');
        mensagem.className = `chatbot-message ${tipo}`;
        mensagem.textContent = texto;
        container.appendChild(mensagem);
        container.scrollTop = container.scrollHeight;
    }

    async function responderPergunta(pergunta) {
        const respostaPython = await responderPerguntaPython(pergunta);
        if (respostaPython) return respostaPython;

        if (pergunta.includes('abaixo do estoque mínimo')) {
            return listarLojasAbaixoMinimo();
        }

        if (pergunta.includes('total de talões enviados')) {
            return totalTaloesSemana();
        }

        return 'Ainda não tenho uma resposta simulada para essa pergunta.';
    }

    async function responderPerguntaPython(pergunta) {
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

    async function listarLojasAbaixoMinimo() {
        const [dadosLojas, dadosIA] = await Promise.all([
            carregarLojas(),
            carregarIA()
        ]);

        const alertasIA = dadosIA?.alertas || [];
        if (alertasIA.length) {
            const nomes = alertasIA.map(alerta => `${alerta.nome_loja} (${alerta.uf})`).join(', ');
            return `${alertasIA.length} loja(s) estão abaixo do estoque mínimo: ${nomes}.`;
        }

        const lojas = dadosLojas.lojas || [];
        const estoque = dadosLojas.estoque_lojas || [];
        const estoquePorLoja = Object.fromEntries(estoque.map(item => [item.codigo_loja, item.quantidade_atual]));
        const abaixo = lojas.filter(loja => Number(estoquePorLoja[loja.codigo_loja] ?? loja['Quantidade atual'] ?? 0) < Number(loja.quantidade_minima || 0));

        if (!abaixo.length) {
            return 'Nenhuma loja está abaixo do estoque mínimo no momento.';
        }

        return `${abaixo.length} loja(s) estão abaixo do estoque mínimo: ${abaixo.map(loja => `${loja.nome_da_loja} (${loja.uf})`).join(', ')}.`;
    }

    async function totalTaloesSemana() {
        const dados = await carregarTaloes();
        const envios = dados.envios_taloes || [];
        const inicioSemana = obterInicioSemana(new Date());
        const fimSemana = new Date(inicioSemana);
        fimSemana.setDate(fimSemana.getDate() + 7);

        const total = envios
            .filter(envio => {
                const data = parseDataEnvio(envio.data_hora_envio);
                return data && data >= inicioSemana && data < fimSemana;
            })
            .reduce((soma, envio) => soma + Number(envio.quantidade_enviada || 0), 0);

        return `O total simulado de talões enviados nesta semana é ${total}.`;
    }

    async function carregarLojas() {
        const api = await apiGet('/api/lojas');
        if (api?.lojas) {
            const estoque = await apiGet('/api/estoque');
            return {
                lojas: api.lojas,
                estoque_lojas: estoque?.estoque_lojas || []
            };
        }

        const local = JSON.parse(localStorage.getItem('lojasJsonAtualizado') || 'null');
        if (local?.lojas) return local;
        return fetchJson('../dados/lojas.json', { lojas: [], estoque_lojas: [] });
    }

    async function carregarTaloes() {
        const api = await apiGet('/api/envios');
        if (api?.envios_taloes) return api;

        const local = JSON.parse(localStorage.getItem('taloesJsonAtualizado') || 'null');
        if (local?.envios_taloes) return local;
        return fetchJson('../dados/taloes.json', { envios_taloes: [] });
    }

    async function carregarIA() {
        const api = await apiGet('/api/ia/envio-taloes');
        if (api?.resumo || api?.alertas) return api;
        return fetchJson('../dados/ia_envio_taloes.json', { alertas: [] });
    }

    async function apiGet(route) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 800);

        try {
            const response = await fetch(`${API_BASE}${route}`, { signal: controller.signal });
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

    function obterInicioSemana(data) {
        const inicio = new Date(data);
        const dia = inicio.getDay();
        const diferenca = dia === 0 ? -6 : 1 - dia;
        inicio.setDate(inicio.getDate() + diferenca);
        inicio.setHours(0, 0, 0, 0);
        return inicio;
    }

    function parseDataEnvio(valor) {
        if (!valor) return null;
        const normalizada = String(valor).replace(' ', 'T');
        const data = new Date(normalizada);
        return Number.isNaN(data.getTime()) ? null : data;
    }
})();
