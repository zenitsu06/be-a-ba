(function () {
    const CHAVE_HISTORICO_RELATORIOS = 'historicoRelatorios';

    function listarHistorico() {
        try {
            return JSON.parse(localStorage.getItem(CHAVE_HISTORICO_RELATORIOS) || '[]');
        } catch (erro) {
            return [];
        }
    }

    function salvarHistorico(lista) {
        localStorage.setItem(CHAVE_HISTORICO_RELATORIOS, JSON.stringify(lista));
    }

    function formatarDataHora(data = new Date()) {
        const partes = new Intl.DateTimeFormat('pt-BR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        }).formatToParts(data);
        const mapa = Object.fromEntries(partes.map(parte => [parte.type, parte.value]));
        return `${mapa.year}-${mapa.month}-${mapa.day} ${mapa.hour}:${mapa.minute}:${mapa.second}`;
    }

    function dataHoje() {
        return formatarDataHora(new Date()).split(' ')[0];
    }

    function colunasRelatorioEstoque() {
        return [
            ['data', 'Data'],
            ['nome_usuario', 'Nome do usuario que gerou aquele relatorio'],
            ['matricula', 'Matricula'],
            ['quantidade_enviada_estoque', 'Quantidade enviada para o estoque daquela loja'],
            ['quantidade_recomendada', 'Quantidade recomendada'],
            ['quantidade_minima', 'Quantidade minima'],
            ['status_prioridade_loja', 'Status de prioridade daquela loja'],
            ['divergencia', 'Divergencia']
        ];
    }

    function primeiroValor(...valores) {
        const encontrado = valores.find(valor => valor !== null && valor !== undefined && valor !== '');
        return encontrado === undefined ? '-' : encontrado;
    }

    function normalizarLinhaRelatorioEstoque(linha = {}, usuario = {}, extras = {}) {
        return {
            data: primeiroValor(extras.data, dataHoje()),
            nome_usuario: primeiroValor(extras.nome_usuario, linha.nome_usuario, linha.nome, usuario?.nome, usuario?.nome_usuario, 'Usuario'),
            matricula: primeiroValor(extras.matricula, linha.matricula, linha.matricula_usuario, usuario?.matricula, usuario?.matricula_usuario, ''),
            quantidade_enviada_estoque: primeiroValor(
                extras.quantidade_enviada_estoque,
                linha.quantidade_enviada_estoque,
                linha.quantidade_enviada,
                linha.quantidadeEnviada,
                linha.quantidade_atual,
                linha.quantidadeAtual
            ),
            quantidade_recomendada: primeiroValor(
                extras.quantidade_recomendada,
                linha.quantidade_recomendada,
                linha.quantidadeRecomendada,
                linha.recomendada
            ),
            quantidade_minima: primeiroValor(
                extras.quantidade_minima,
                linha.quantidade_minima,
                linha.quantidadeMinima,
                linha.minima
            ),
            status_prioridade_loja: primeiroValor(
                extras.status_prioridade_loja,
                linha.status_prioridade_loja,
                linha.prioridade_ia,
                linha.prioridade,
                linha.statusTexto,
                linha.status
            ),
            divergencia: primeiroValor(
                extras.divergencia,
                linha.divergencia,
                linha.divergenciaTexto,
                linha.quantidade_divergencia,
                linha.quantidadeDivergencia
            )
        };
    }

    function normalizarColunas(colunas, linhas) {
        if (Array.isArray(colunas) && colunas.length) return colunas;
        const primeiraLinha = linhas.find(linha => linha && typeof linha === 'object') || {};
        return Object.keys(primeiraLinha).map(campo => [campo, campo]);
    }

    function valorCampo(linha, campo) {
        if (typeof campo === 'function') return campo(linha);
        return linha?.[campo];
    }

    function escaparCsv(valor) {
        if (valor === null || valor === undefined) return '';
        const texto = Array.isArray(valor) ? valor.join(', ') : String(valor);
        return `"${texto.replace(/"/g, '""')}"`;
    }

    function montarCsv(linhas, colunas) {
        const colunasNormalizadas = normalizarColunas(colunas, linhas);
        const cabecalho = colunasNormalizadas.map(([, titulo]) => escaparCsv(titulo)).join(';');
        const corpo = linhas.map(linha =>
            colunasNormalizadas.map(([campo]) => escaparCsv(valorCampo(linha, campo))).join(';')
        );
        return ['\uFEFF' + cabecalho, ...corpo].join('\n');
    }

    function baixarCsv(nomeArquivo, conteudo) {
        const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = nomeArquivo;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    }

    function normalizarArquivo(nome) {
        return String(nome || 'relatorio.csv')
            .trim()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9._-]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'relatorio.csv';
    }

    function registrarRelatorio({ nome, origem, arquivo, usuario, linhas = [], colunas = [], status = 'Gerado' }) {
        const agora = formatarDataHora(new Date());
        const registro = {
            id_relatorio: `REL-${Date.now()}`,
            nome_relatorio: nome || 'Relatório',
            origem: origem || 'Sistema',
            nome_usuario: usuario?.nome || usuario?.nome_usuario || 'Usuário',
            matricula_usuario: usuario?.matricula || usuario?.matricula_usuario || '',
            data_hora: agora,
            data_hora_envio: agora,
            quantidade_linhas: linhas.length,
            arquivo: arquivo || normalizarArquivo(`${nome || 'relatorio'}.csv`),
            status,
            colunas: normalizarColunas(colunas, linhas).map(([, titulo]) => titulo),
            linhas
        };

        const historico = listarHistorico();
        salvarHistorico([registro, ...historico].slice(0, 200));
        return registro;
    }

    function exportarCsv({ nome, origem, arquivo, usuario, linhas = [], colunas = [], registrar = true }) {
        const nomeArquivo = normalizarArquivo(arquivo || `${nome || 'relatorio'}.csv`);
        const csv = montarCsv(linhas, colunas);
        const registro = registrar
            ? registrarRelatorio({
                nome,
                origem,
                arquivo: nomeArquivo,
                usuario,
                linhas,
                colunas,
                status: 'Exportado'
            })
            : null;

        baixarCsv(nomeArquivo, csv);
        return registro;
    }

    window.OferteReports = {
        CHAVE_HISTORICO_RELATORIOS,
        exportarCsv,
        colunasRelatorioEstoque,
        normalizarLinhaRelatorioEstoque,
        registrarRelatorio,
        listarHistorico,
        montarCsv
    };
})();
