# Documentacao tecnica do projeto be-a-ba

Este documento explica a estrutura completa do projeto `be-a-ba`, desde o frontend ate o backend Node.js, os scripts Python, a camada separada de IA e os bancos PostgreSQL.

## Visao geral

O sistema `Oferte e Ganhe` controla lojas, usuarios, perfis, estoque, envio de taloes, recebimento de taloes, manutencoes, relatorios e analises de IA.

A arquitetura planejada cita `React -> Node.js -> PostgreSQL`, mas a implementacao atual do frontend esta em HTML, CSS e JavaScript puro, servido pelo backend Express. O backend Node.js e a fonte oficial das rotas `/api/...`; o PostgreSQL guarda os dados operacionais; a pasta `python/` possui uma IA operacional/simulada para estoque e envio de taloes; e a pasta `ia/` contem a nova camada Python/FastAPI preparada para insights com LLM e historico em banco separado.

Fluxo macro:

```text
Usuario no navegador
  -> paginas HTML/CSS/JS
  -> fetch para http://localhost:8000/api/...
  -> Express/Node.js
  -> services
  -> repositories
  -> PostgreSQL operacional: banco oferte_e_ganhe, schema public

Camada IA nova:
  Node/Analytics calcula indicadores
  -> FastAPI em ia/
  -> banco PostgreSQL IA, schema ia
  -> OpenRouter/LLM quando necessario
  -> cache historico de insights
```

## Como rodar

Aplicacao principal:

```powershell
cd "C:\Users\kaua\Downloads\be-a-ba"
npm start
```

Ou direto pelo backend:

```powershell
cd "C:\Users\kaua\Downloads\be-a-ba\backend-node"
npm start
```

Depois acesse:

```text
http://localhost:8000/login/login.html
```

Camada IA FastAPI:

```powershell
cd "C:\Users\kaua\Downloads\be-a-ba\ia"
uvicorn app.main:app --reload
```

Depois acesse:

```text
http://127.0.0.1:8000/docs
```

Observacao: se o backend Node tambem estiver usando a porta `8000`, a API da IA deve subir em outra porta, por exemplo:

```powershell
uvicorn app.main:app --reload --port 8001
```

## Estrutura da raiz

```text
be-a-ba/
  administrador/
  backend-node/
  dados/
  EnvioTaloes/
  GerenciarPerfis/
  gestor/
  ia/
  login/
  Lojas/
  node_modules/
  python/
  Recebimento/
  relatorios/
  shared/
  usuario/
  index.html
  package.json
  package-lock.json
  README.md
```

### `index.html`

Arquivo inicial simples do projeto. O fluxo real de uso normalmente entra em `login/login.html`.

### `package.json`

Arquivo Node da raiz. Define scripts para iniciar o backend:

- `npm start`: chama `npm --prefix backend-node start`.
- `npm run dev`: chama `npm --prefix backend-node run dev`.

Tambem lista dependencias como `express`, `pg`, `cors`, `dotenv` e `bcrypt`.

### `package-lock.json`

Trava as versoes exatas das dependencias Node instaladas.

### `.gitignore`

Define arquivos/pastas ignorados pelo Git.

### `README.md`

Resumo rapido do projeto, como rodar e estrutura principal.

## Frontend

O frontend atual e composto por paginas estaticas HTML, CSS e JS. Cada modulo possui normalmente tres arquivos:

- `.html`: estrutura visual da pagina.
- `.css`: estilo especifico da pagina.
- `.js`: logica de tela, chamadas `fetch`, leitura de `localStorage`, montagem de tabelas e validacoes.

Todas as paginas usam configuracoes e estilos compartilhados da pasta `shared/`.

### `shared/`

Arquivos compartilhados entre telas.

#### `shared/app-config.js`

Define a base da API:

```javascript
window.OFERTE_CONFIG = {
  API_BASE: window.OFERTE_API_BASE || savedApiBase || 'http://localhost:8000',
  REQUEST_TIMEOUT_MS: 1200
};
```

As telas usam `API_BASE` para montar chamadas como:

```text
http://localhost:8000/api/lojas
```

Tambem permite trocar a URL pelo navegador:

```javascript
localStorage.setItem('oferteApiBase', 'http://localhost:8000')
```

#### `shared/ui-refresh.css`

Tema visual global, cores, tabelas, botoes, layout, avatar e padroes visuais compartilhados.

#### `shared/permissions.js`

Centraliza validacoes de usuario logado e permissoes de acesso. Usa `localStorage.usuarioLogado` para saber quem esta autenticado e redireciona para login quando necessario.

#### `shared/chatbot.js`

Cria o botao flutuante `IA`, abre o painel de assistente e envia perguntas para:

```text
POST /api/chatbot
```

Se a API falhar, usa fallback lendo dados locais e JSON de IA.

#### `shared/chatbot.css`

Estilo do assistente conversacional.

#### `shared/report-utils.js`

Helpers para historico local de relatorios.

## Telas do frontend

### `login/`

Responsavel por autenticacao e recuperacao de senha.

- `login.html`: formulario de login e recuperacao.
- `login.css`: estilos da tela.
- `login.js`: carrega usuarios, valida credenciais, salva `usuarioLogado` no `localStorage` e redireciona conforme cargo/permissoes.

Fluxo de login:

```text
Usuario digita matricula/senha
  -> login.js busca usuarios
  -> valida credenciais
  -> salva usuarioLogado no localStorage
  -> redireciona:
      administrador -> administrador/dashboard.html
      gestor -> gestor/dashboard.html
      lojista -> usuario/usuario.html
```

Observacao: a tela ainda possui fallback local por JSON/localStorage. O backend tambem tem rota oficial de login em `/api/auth/login` e rota compatível `/api/login`.

### `administrador/`

Dashboard administrativo.

- `dashboard.html`: pagina do administrador.
- `dashboard.css`: estilos da tela.
- `dashboard.js`: carrega usuario logado, consulta lojas, estoque e IA, monta indicadores e graficos/resumos.

Principais chamadas:

- `GET /api/lojas`
- `GET /api/estoque`
- `GET /api/ia/envio-taloes`

### `gestor/`

Area gerencial.

- `dashboard.html`: dashboard do gestor.
- `gestor.css`: estilos do dashboard.
- `gestor.js`: carrega lojas, estoque, envios, recebimentos e IA; calcula indicadores para gestao.
- `relatorios.html`: tela de relatorios.
- `relatorios.js`: gera relatorios, consulta endpoints de relatorios, exporta/mostra historico.

Principais chamadas:

- `GET /api/lojas`
- `GET /api/estoque`
- `GET /api/envios`
- `GET /api/recebimentos`
- `GET /api/ia/envio-taloes`
- `GET /api/relatorios/:tipo`
- `POST /api/relatorios/enviar`

### `usuario/`

Tela do lojista/usuario operacional.

- `usuario.html`: interface do usuario.
- `usuario.css`: estilos.
- `usuario.js`: valida usuario logado, carrega loja vinculada, envios, recebimentos e estoque. Permite visualizar dados da loja e registrar/acompanhar recebimentos conforme fluxo.

Principais chamadas:

- `GET /api/lojas`
- `GET /api/estoque`
- `GET /api/envios`
- `GET /api/recebimentos`

### `EnvioTaloes/`

Tela de envio de taloes.

- `envio.html`: formulario/listagem de envios.
- `envio.css`: estilos.
- `envio.js`: carrega lojas, envios e analises IA; monta sugestoes de envio, ranking e permite registrar/editar remessas.

Principais chamadas:

- `GET /api/lojas`
- `GET /api/envios`
- `GET /api/recebimentos`
- `GET /api/ia/envio-taloes`
- `POST /api/envios`
- `POST /api/envios/editar`

Quando uma remessa e criada, o frontend envia dados para o backend. O backend valida loja, usuario, quantidade, aplica insights calculados e salva em `envios_taloes`.

### `Recebimento/`

Tela de recebimento de taloes.

- `recebimento.html`: formulario/listagem de recebimentos.
- `recebimento.css`: estilos.
- `recebimento.js`: carrega envios, recebimentos, lojas e IA; registra recebimentos e atualiza dados locais/fallback.

Principais chamadas:

- `GET /api/envios`
- `GET /api/recebimentos`
- `GET /api/lojas`
- `GET /api/ia/envio-taloes`
- `POST /api/recebimentos`

Quando um recebimento e salvo, o backend cria ou atualiza o recebimento, marca a remessa como recebida e ajusta o estoque da loja.

### `Lojas/`

Cadastro e gestao de lojas.

- `lojas.html`: tela de lojas.
- `lojas.css`: estilos.
- `lojas.js`: lista lojas, carrega estoque, funcionarios e IA; permite cadastrar/editar lojas e vincular funcionario.

Principais chamadas:

- `GET /api/lojas`
- `GET /api/estoque`
- `GET /api/ia/envio-taloes`
- `GET /api/usuarios`
- `POST /api/lojas`
- `PUT /api/lojas/:codigo`
- `DELETE /api/lojas/:codigo`

### `GerenciarPerfis/`

Gerenciamento de usuarios, cargos, perfis e atribuicoes.

- `perfis.html`: interface de usuarios/perfis.
- `perfis.css`: estilos.
- `perfis.js`: carrega usuarios, perfis e lojas; permite criar, editar, inativar usuarios e manter permissoes.

Principais chamadas:

- `GET /api/usuarios`
- `GET /api/perfis`
- `GET /api/lojas`
- `POST /api/usuarios`
- `PUT /api/usuarios/:matricula`
- `DELETE /api/usuarios/:matricula`
- `POST /api/usuarios/status`

### `dados/`

Arquivos JSON auxiliares usados como fallback ou cache local:

- `usuarios.json`: usuarios base/fallback.
- `lojas.json`: lojas e estoque base/fallback.
- `taloes.json`: envios/recebimentos base/fallback.
- `ia_envio_taloes.json`: resultado gerado pela IA Python antiga.

Quando a API esta indisponivel, algumas telas tentam carregar esses arquivos ou dados salvos no `localStorage`.

### `relatorios/`

Pasta destinada a CSVs e arquivos exportados pelo backend/fluxo de relatorios.

## Backend Node.js

O backend fica em:

```text
backend-node/
```

Ele usa Express, PostgreSQL via `pg`, variaveis de ambiente com `dotenv`, CORS e middlewares de erro.

Fluxo interno:

```text
HTTP /api/...
  -> routes
  -> services
  -> repositories
  -> database/conexao.js
  -> PostgreSQL
  -> normalizers
  -> JSON de resposta
```

### `backend-node/server.js`

Bootstrap da raiz do backend. Mantem compatibilidade com `npm start` e carrega `src/server.js`.

### `backend-node/src/server.js`

Monta a aplicacao Express:

- habilita CORS;
- habilita JSON no body;
- registra todas as rotas em `/api`;
- serve arquivos estaticos da raiz do projeto;
- registra handlers de 404 e erro.

Como ele serve arquivos estaticos, a URL abaixo funciona pelo proprio backend:

```text
http://localhost:8000/login/login.html
```

### `backend-node/src/config/env.js`

Centraliza configuracoes:

- porta do backend;
- CORS;
- limite de body;
- conexao PostgreSQL;
- caminho do projeto;
- caminho do script Python antigo;
- caminho do JSON de saida da IA;
- configuracao OpenRouter do backend antigo.

Carrega `backend-node/.env`.

### `backend-node/src/database/conexao.js`

Cria o pool PostgreSQL com `pg.Pool`.

Funcoes principais:

- `query(text, params)`: executa SQL simples.
- `withTransaction(callback)`: abre transacao, executa callback, faz `COMMIT` ou `ROLLBACK`.
- `databaseHealth()`: testa conexao.
- `closePool()`: encerra pool.

Tambem valida se a senha do banco foi configurada.

### `backend-node/src/routes/`

Controllers HTTP. Cada arquivo recebe request/response e chama `services`.

Rotas principais:

- `health.routes.js`: `GET /api/health`.
- `auth.routes.js`: login/logout/me/recuperacao.
- `usuarios.routes.js`: usuarios e rota compativel `/api/login`.
- `perfis.routes.js`: CRUD de perfis.
- `usuarios-perfis.routes.js`: vinculo usuario-perfil.
- `lojas.routes.js`: CRUD/listagem de lojas.
- `estoque.routes.js`: estoque por loja.
- `envios.routes.js`: envios de taloes.
- `recebimentos.routes.js`: recebimentos de taloes.
- `historico.routes.js`: historico geral/por loja/por usuario.
- `manutencoes.routes.js`: manutencoes de taloes.
- `dashboard.routes.js`: resumos para dashboards.
- `ia.routes.js`: IA antiga, anomalias, notificacoes e chatbot.
- `relatorios.routes.js`: relatorios, CSV, exportacao e envio.
- `index.js`: junta todas as rotas em um unico router.

### `backend-node/src/services/index.js`

Camada de regras de negocio. Ela valida entrada, decide regras operacionais e chama o repository.

Exemplos:

- `authenticate`: valida matricula/senha e bloqueia usuario inativo.
- `saveUser`: cria/atualiza usuario, normaliza cargo e vincula perfil.
- `saveStore`: cria/atualiza loja, estoque inicial e funcionario vinculado.
- `createShipment`: valida loja/usuario/quantidade, consulta analise IA e cria remessa.
- `createReceipt`: salva recebimento dentro de transacao, marca envio como recebido e ajusta estoque.
- `readAiAnalysis`: le analise de IA do JSON ou do banco e monta fallback.
- `runAiAnalysis`: executa `python/ia_envio_taloes.py`.
- `dashboardSummary`: calcula resumo para dashboard.
- `reportRows`: monta dados dos relatorios.
- `answerChatbot`: responde perguntas simples do assistente.

### `backend-node/src/repositories/oferte.repository.js`

Camada de acesso ao banco. Contem SQL puro para:

- usuarios;
- perfis;
- permissoes;
- lojas;
- estoque;
- envios;
- recebimentos;
- manutencoes;
- historico;
- dashboards;
- anomalias;
- notificacoes;
- relatorios.

Essa camada nao deveria conter regra de negocio complexa; sua funcao e buscar, inserir, atualizar ou excluir dados no PostgreSQL.

### `backend-node/src/utils/`

Arquivos auxiliares:

- `AppError.js`: erro controlado com status HTTP.
- `normalizers.js`: normaliza formato de usuario, perfil, loja, envio e recebimento antes de devolver ao frontend.
- `files.js`: leitura de JSON.
- `csv.js`: conversao de dados para CSV.

### `backend-node/src/middlewares/`

- `async-route.js`: envolve rotas async e encaminha erros para o Express.
- `error-handler.js`: converte erros em JSON padronizado. Para `/api`, 404 vira `{ erro: 'Rota nao encontrada.' }`.

## Fluxo de uma requisicao do frontend

Exemplo: a tela de lojas chama `GET /api/lojas`.

```text
1. Usuario abre Lojas/lojas.html.
2. O navegador carrega Lojas/lojas.js.
3. O JS le window.OFERTE_CONFIG.API_BASE.
4. O JS executa fetch("http://localhost:8000/api/lojas").
5. O Express recebe a requisicao em backend-node/src/server.js.
6. Como a rota comeca com /api, ela entra em routes/index.js.
7. routes/index.js encaminha para lojas.routes.js.
8. lojas.routes.js chama service.listStores().
9. services/index.js chama repository.listStores().
10. oferte.repository.js executa SELECT na view public.vw_lojas_api.
11. database/conexao.js usa o pool PostgreSQL e retorna rows.
12. services normaliza os dados com normalizeStore().
13. lojas.routes.js envia JSON para o navegador.
14. lojas.js recebe JSON e renderiza tabela/cards na tela.
15. Se a API falhar, a tela tenta fallback em localStorage ou dados/lojas.json.
```

Exemplo: criacao de envio de taloes.

```text
1. Usuario preenche formulario em EnvioTaloes/envio.html.
2. envio.js envia POST /api/envios com cod_loja, matricula e quantidade.
3. envios.routes.js chama service.createShipment().
4. createShipment valida campos obrigatorios.
5. Busca a loja em repository.findStoreForShipment().
6. Le analise IA atual em readAiAnalysis().
7. Gera codigo ENV-ANO-SEQUENCIA se necessario.
8. Salva em public.envios_taloes.
9. Retorna o envio normalizado pela view public.vw_envios_api.
10. Frontend atualiza a tela.
```

Exemplo: registro de recebimento.

```text
1. Usuario registra recebimento em Recebimento/recebimento.html.
2. recebimento.js envia POST /api/recebimentos.
3. recebimentos.routes.js chama service.createReceipt().
4. O service abre transacao.
5. Busca envio interno por codigo.
6. Calcula divergencia entre quantidade enviada e recebida.
7. Insere ou atualiza public.recebimentos_taloes.
8. Marca public.envios_taloes como Recebido.
9. Garante linha em public.estoque_lojas.
10. Soma ao estoque a diferenca recebida.
11. Faz COMMIT.
12. Tenta executar a IA Python antiga para atualizar alertas.
13. Retorna o recebimento normalizado.
```

Exemplo: chatbot.

```text
1. shared/chatbot.js cria botao IA no frontend.
2. Usuario escolhe uma pergunta.
3. O JS envia POST /api/chatbot.
4. ia.routes.js chama service.answerChatbot().
5. O service identifica a pergunta por palavras-chave.
6. Para estoque minimo, consulta readAiAnalysis().
7. Para total da semana, consulta totalShipmentsBetween().
8. Retorna { resposta: "..." }.
9. O painel mostra a resposta.
```

## Banco de Dados operacional

Banco principal:

```text
oferte_e_ganhe
schema public
```

Principais tabelas:

- `usuarios`: usuarios do sistema, senha hash, cargo, loja vinculada e status.
- `perfis`: perfis/cargos existentes.
- `perfis_permissoes`: permissoes por perfil.
- `usuarios_perfis`: vinculo entre usuario e perfil.
- `lojas`: cadastro das lojas.
- `estoque_lojas`: estoque atual por loja.
- `envios_taloes`: remessas de taloes enviadas.
- `recebimentos_taloes`: recebimentos registrados por loja/remessa.
- `manutencoes_taloes`: manutencoes ou ajustes relacionados a envios.
- `analises_ia_envios`: resultados da IA antiga sobre envios/estoque.
- `anomalias_recebimento`: divergencias e anomalias detectadas.
- `notificacoes_workplace`: notificacoes simuladas para Workplace.
- `relatorios_enviados`: historico de relatorios enviados.
- `relatorios_exportados`: historico de exportacoes.

Principais views:

- `vw_usuarios_api`: formato pronto para usuarios no backend.
- `vw_perfis_api`: perfis com atribuicoes agregadas.
- `vw_lojas_api`: lojas com estoque e funcionario vinculado.
- `vw_envios_api`: envios em formato de API, com codigo de envio.
- `vw_recebimentos_api`: recebimentos em formato de API.
- `vw_estoque_alertas`: estoque classificado por status.
- `vw_lojas_estoque_baixo`: lojas abaixo do minimo.
- `vw_recebimentos_resumo`: resumo envio x recebimento.
- `vw_remessas_pendentes`: remessas ainda nao recebidas.

Relacionamentos logicos principais:

```text
usuarios.matricula
  -> envios_taloes.matricula_usuario
  -> recebimentos_taloes.matricula_usuario
  -> manutencoes_taloes.matricula_usuario
  -> usuarios_perfis.matricula_usuario

lojas.cod_loja
  -> estoque_lojas.cod_loja
  -> envios_taloes.cod_loja
  -> recebimentos_taloes.cod_loja
  -> analises_ia_envios.cod_loja
  -> anomalias_recebimento.cod_loja
  -> notificacoes_workplace.cod_loja

envios_taloes.id_envio
  -> recebimentos_taloes.id_envio
  -> manutencoes_taloes.id_envio
```

## IA antiga em `python/`

Arquivo principal:

```text
python/ia_envio_taloes.py
```

Essa IA calcula alertas e previsoes simuladas/deterministicas de estoque:

- RF11: alerta automatico de estoque baixo.
- RF11-IA: previsao preditiva de estoque por loja.
- RF12-IA: ranking inteligente de prioridade de envio.

Fontes de dados:

1. Tenta conectar no PostgreSQL operacional usando `backend-node/.env`.
2. Se nao conseguir, usa JSONs de `dados/`.

Saidas:

- Gera `dados/ia_envio_taloes.json`.
- Tenta salvar resultados em:
  - `public.analises_ia_envios`;
  - `public.anomalias_recebimento`;
  - `public.notificacoes_workplace`.

O backend Node chama esse script em `runAiAnalysis()` quando e necessario recalcular analises, por exemplo apos atualizacao de estoque ou recebimento.

## Nova camada IA em `ia/`

A pasta `ia/` e uma camada separada em FastAPI. Ela foi criada para futuramente ser integrada ao fluxo principal com menor consumo de tokens.

Objetivo:

```text
Node calcula indicadores oficiais
  -> IA recebe os calculos
  -> IA gera hash dos calculos
  -> se ja existir insight, retorna do historico
  -> se nao existir, chama OpenRouter/LLM
  -> salva insight no banco IA
```

Estrutura:

```text
ia/
  app/
    api/
    core/
    repositories/
    services/
    analytics/
    schemas/
    llm/
    utils/
  semantic_layer/
  sql/
  scripts/
  tests/
  README.md
  requirements.txt
  teste_llm.py
```

### `ia/app/main.py`

Monta a API FastAPI e inclui os routers:

- health;
- Semantic Layer;
- LLM;
- insights.

### `ia/app/api/`

Endpoints HTTP da camada IA:

- `health.py`: `GET /health`.
- `semantic_layer.py`: `GET /semantic-layer/indicadores`.
- `llm.py`: `POST /llm/teste`.
- `insights.py`: `POST /insights/analisar-calculos`.
- `dependencies.py`: injeta repositories e services.

### `ia/app/core/`

Configuracao e banco:

- `config.py`: carrega `.env` da pasta `ia`.
- `database.py`: cria pool PostgreSQL para o banco `IA`.

### `ia/app/repositories/`

Acesso a dados:

- `semantic_repository.py`: le o catalogo JSON da Semantic Layer.
- `insight_repository.py`: busca e salva insights no PostgreSQL `IA`; se nao houver DSN, usa memoria local.

### `ia/app/services/`

Regras da camada IA:

- `insight_service.py`: gera hash do calculo, verifica cache, monta prompt e chama LLM apenas quando necessario.

### `ia/app/analytics/`

Funcoes analiticas auxiliares:

- `fingerprints.py`: gera hash SHA-256 canonico dos calculos recebidos.

### `ia/app/schemas/`

Modelos Pydantic para validar entrada e saida:

- `insights.py`: payload de calculos, resposta de insight e uso de tokens.
- `llm.py`: request de teste LLM.
- `semantic.py`: formato de indicador.

### `ia/app/llm/`

Integracao com OpenRouter:

- `openrouter_client.py`: cliente HTTP, tratamento de erro, parsing de resposta e tokens.
- `prompts.py`: prompt que instrui a LLM a analisar somente calculos oficiais.

### `ia/semantic_layer/indicadores.json`

Catalogo oficial de 27 indicadores. Centraliza nome, formula/definicao, fonte, nivel, uso e status inicial.

### `ia/sql/001_schema_ia.sql`

Script do schema `ia` no banco `IA`.

### `ia/teste_llm.py`

Teste simples de comunicacao com OpenRouter. Retorna texto, modelo usado e tokens.

### `ia/scripts/check_openrouter_key.py`

Utilitario para validar chave OpenRouter.

### `ia/tests/`

Testes automatizados:

- valida Semantic Layer;
- valida cache de insights.

## Banco da IA

Banco:

```text
IA
schema ia
```

Principais tabelas:

- `ia.indicadores`: catalogo oficial da Semantic Layer.
- `ia.resultados_indicadores`: resultados historicos de indicadores.
- `ia.calculos_analytics`: calculos recebidos do Node/Analytics, com `calculo_hash`.
- `ia.insights_historico`: historico/cache de insights gerados pela LLM.
- `ia.modelos_llm`: modelos disponiveis.
- `ia.prompts`: prompts versionados.
- `ia.consultas_ia`: perguntas/consultas feitas a IA.
- `ia.execucoes_llm`: tokens, custo, status e tempo de execucao.
- `ia.insights`: insights e recomendacoes.
- `ia.feedback_respostas`: avaliacao de usuarios.
- `ia.logs_ia`: auditoria tecnica.

Tabela mais importante para economia de tokens:

```text
ia.calculos_analytics.calculo_hash
  -> ia.insights_historico.calculo_hash
```

Se o mesmo calculo chegar novamente, a IA retorna o insight salvo e evita nova chamada para LLM.

## Exemplo de fluxo futuro com a nova IA

```text
1. Frontend pede dashboard ao Node.
2. Node consulta PostgreSQL operacional.
3. Node calcula indicadores oficiais: gap, total enviado, taxa de recebimento etc.
4. Node envia os calculos para FastAPI:
   POST /insights/analisar-calculos
5. FastAPI gera hash do payload.
6. FastAPI busca o hash em ia.insights_historico.
7. Se encontrou, retorna cache_hit=true.
8. Se nao encontrou, monta prompt compacto e chama OpenRouter.
9. A resposta vira insight estruturado.
10. FastAPI salva calculo e insight no banco IA.
11. Node recebe insight e entrega ao frontend.
12. Frontend exibe o insight sem saber se veio do cache ou da LLM.
```

## Como os dados se mantem consistentes

- O frontend nao acessa banco diretamente.
- O frontend chama rotas `/api/...`.
- O backend valida dados antes de salvar.
- Escritas importantes passam por services.
- Operacoes com mais de uma tabela usam transacao.
- O banco operacional mantem views para padronizar respostas.
- A IA antiga pode recalcular alertas apos mudancas de estoque/recebimento.
- A IA nova deve analisar calculos oficiais, nao reinventar formulas.

## Pontos de atencao

- O login do frontend ainda usa fallback local; o backend ja possui rotas oficiais de autenticacao.
- A nova camada `ia/` ainda esta separada da chamada direta do Node; ela ja esta pronta para ser integrada.
- A API Node e a API FastAPI nao devem usar a mesma porta ao mesmo tempo.
- Segredos devem ficar apenas em `.env`, nunca no codigo.
- A camada IA deve receber dados agregados/anonimizados sempre que possivel.
- O consumo real de taloes ainda e uma lacuna de dados: envio e recebimento representam logistica, nao uso efetivo.

## Mapa rapido de responsabilidades

```text
Frontend
  Mostra telas, coleta input, chama API, renderiza resposta.

Backend Node
  Serve frontend, recebe /api, valida regras, conversa com PostgreSQL.

PostgreSQL operacional
  Guarda usuarios, lojas, estoque, envios, recebimentos, relatorios e views.

Python antigo
  Calcula alertas/ranking de envio e salva JSON/tabelas operacionais.

FastAPI IA nova
  Recebe calculos oficiais, gera insights com LLM e reaproveita historico.

Banco IA
  Guarda Semantic Layer, calculos, prompts, execucoes, tokens, insights e logs.
```

