const TEMPO_INATIVIDADE_MS = 10 * 60 * 1000; 
let timeoutInatividade;
const tokenSessao = Math.random().toString(36).substring(2);

// Dicionário de mock para preencher meses anteriores (Conforme regra 4)
const recebidos_taloes_mock = [1200, 1500, 1100, 1800, 1400]; // Jan a Mai

// Dicionário base de Lojas Mockadas para gerar o Gráfico Pizza e Lista de Risco
const lojasMock = [
    { nome: "Filial Centro", uf: "RS", estoqueAtual: 45, media: 150 }, // Abaixo (Risco)
    { nome: "Filial Norte", uf: "SC", estoqueAtual: 160, media: 150 }, // OK
    { nome: "Filial Sul", uf: "PR", estoqueAtual: 30, media: 100 }     // Abaixo (Risco)
];

document.addEventListener('DOMContentLoaded', () => {
    iniciarSeguranca();
    carregarDadosLojista();
    renderizarGraficosELojas();
});

// --- SISTEMA DE SEGURANÇA ---
function iniciarSeguranca() {
    const usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado'));
    if (!usuarioLogado || !['administrador', 'gestor'].includes(usuarioLogado.cargo)) {
        window.location.href = '../login/login.html';
        return;
    }
    
    document.getElementById('nome-admin').innerText = usuarioLogado.nome;

    // Proteção contra múltiplos logins (Verifica se o token desta aba é o oficial)
    sessionStorage.setItem('tokenSessaoAtiva', tokenSessao);
    localStorage.setItem('tokenControleAdmin', tokenSessao);

    window.addEventListener('storage', (e) => {
        if (e.key === 'tokenControleAdmin' && e.newValue !== sessionStorage.getItem('tokenSessaoAtiva')) {
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

// --- PROCESSAMENTO DE DADOS ---
function carregarDadosLojista() {
    const historico = JSON.parse(localStorage.getItem('historicoRecebimento')) || [];
    
    // Simulacao inicial para que os cards regionais tenham leitura administrativa.
    const totaisUF = { RS: 420, SC: 260, PR: 190, MS: 145, SP: 310 };
    let totalJunho = Object.values(totaisUF).reduce((soma, valor) => soma + valor, 0);

    historico.forEach(item => {
        if (item.status === "Recebido") {
            // Soma para o gráfico de barras (Mês Atual - Junho)
            totalJunho += parseInt(item.recebidos);

            // Simulação de distribuição por UF (Como o JSON atual não salva UF no histórico diretamente, 
            // no sistema real você atrelaria o código da remessa à UF. Aqui fazemos um rateio simulado para o protótipo dar vida aos cards)
            // Se o histórico tivesse item.uf, seria: totaisUF[item.uf] += parseInt(item.recebidos);
            // Para o protótipo, vamos jogar tudo no RS temporariamente pois a loja mockada era Quero-Quero RS:
            totaisUF['RS'] += parseInt(item.recebidos);
        }
    });

    // Atualiza os Cards
    document.getElementById('val-RS').innerText = totaisUF.RS;
    document.getElementById('val-SC').innerText = totaisUF.SC;
    document.getElementById('val-PR').innerText = totaisUF.PR;
    document.getElementById('val-MS').innerText = totaisUF.MS;
    document.getElementById('val-SP').innerText = totaisUF.SP;

    // Atualiza o array de dados do gráfico inserindo Junho na posição 5 (Índice 5 = Mês 6)
    window.dadosGraficoBarras = [...recebidos_taloes_mock, totalJunho, 0, 0, 0, 0, 0, 0];
}

function renderizarGraficosELojas() {
    // 1. Gráfico de Barras (Recebimentos)
    const ctxBar = document.getElementById('barChart').getContext('2d');
    new Chart(ctxBar, {
        type: 'bar',
        data: {
            labels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'],
            datasets: [{
                label: 'Talões Recebidos',
                data: window.dadosGraficoBarras,
                backgroundColor: '#00b087',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } }
        }
    });

    // 2. Processa Lojas em Risco e Gráfico de Pizza
    let lojasAbaixo = 0;
    let lojasOk = 0;
    const listaRisco = document.getElementById('lista-risco');
    listaRisco.innerHTML = '';

    lojasMock.forEach(loja => {
        if (loja.estoqueAtual < loja.media) {
            lojasAbaixo++;
            listaRisco.innerHTML += `
                <li>
                    <span><strong>${loja.nome}</strong> (${loja.uf})</span>
                    <span>${loja.estoqueAtual} / ${loja.media}</span>
                </li>`;
        } else {
            lojasOk++;
        }
    });

    if (lojasAbaixo === 0) {
        listaRisco.innerHTML = '<li class="empty-state">Nenhuma loja em risco no momento.</li>';
    }

    // 3. Gráfico de Pizza (Estoque Geral)
    const ctxPie = document.getElementById('pieChart').getContext('2d');
    new Chart(ctxPie, {
        type: 'doughnut',
        data: {
            labels: ['Abaixo da Média (Risco)', 'Estoque OK'],
            datasets: [{
                data: [lojasAbaixo, lojasOk],
                backgroundColor: ['#d9534f', '#00b087'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '65%',
            plugins: { legend: { position: 'bottom' } }
        }
    });
}
