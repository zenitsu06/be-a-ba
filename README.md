### 1. Backend Node.js

```powershell
cd "C:\Users\kaua\Downloads\be-a-ba\backend-node"
npm run dev
```

Quando estiver funcionando, o terminal deve mostrar algo parecido com:

```text
Backend Node rodando em http://localhost:8000
Frontend: http://localhost:8000/login/login.html
```

Depois acesse:

```text
http://localhost:8000/login/login.html
```

### 2. Camada de IA em Python

Em outro terminal:

```powershell
cd "C:\Users\kaua\Downloads\be-a-ba\ia"
python -m uvicorn app.main:app --reload --port 8001
```

Tambem funciona se o comando `uvicorn` estiver instalado no PATH:

```powershell
uvicorn app.main:app --reload --port 8001
```

Importante: o backend Node deve ficar na porta `8000` e a IA deve ficar na porta `8001`. Se os dois forem iniciados na mesma porta, um servico ocupa o lugar do outro e as requisicoes podem retornar `404 Not Found` ou nao chegar no backend correto.

## Configuracao Dos Ambientes

### Backend Node.js

O backend Node le o arquivo:

```text
C:\Users\kaua\Downloads\be-a-ba\backend-node\.env
```

Variaveis mais importantes:

```env
PORT=8000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=oferte_e_ganhe
DB_USER=postgres
DB_PASSWORD=sua_senha_do_postgres
IA_SERVICE_URL=http://127.0.0.1:8001
```

O backend usa essas informacoes para abrir conexao com o PostgreSQL e para chamar a camada de IA quando necessario.

### Camada de IA

A IA le o arquivo:

```text
C:\Users\kaua\Downloads\be-a-ba\ia\.env
```

Variaveis principais:

```env
OPENROUTER_API_KEY=sua_chave_do_openrouter
OPENROUTER_MODEL=openrouter/auto
OPENROUTER_SITE_URL=http://localhost
OPENROUTER_APP_TITLE=be-a-ba-camada-ia
POSTGRES_READONLY_DSN=postgresql://usuario:senha@localhost:5432/oferte_e_ganhe
IA_DATABASE_DSN=postgresql://usuario:senha@localhost:5432/oferte_e_ganhe
INSIGHT_CACHE_ENABLED=true
LLM_MAX_TOKENS=450
LLM_TEMPERATURE=0.2
```

`POSTGRES_READONLY_DSN` e usado pela IA para consultar dados operacionais do banco em modo analitico. `IA_DATABASE_DSN` e usado para guardar historico/cache dos insights gerados.

## Comandos De Teste

### Testar se o backend Node e o banco estao funcionando

```powershell
Invoke-RestMethod -Method Get -Uri "http://localhost:8000/api/health"
```

Resposta esperada:

```json
{
  "ok": true,
  "sistema": "Oferte e Ganhe",
  "banco": {
    "available": true,
    "database": "oferte_e_ganhe"
  }
}
```

### Testar login no backend

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:8000/api/auth/login" `
  -ContentType "application/json" `
  -Body '{"matricula":"QQ1003","senha":"123456"}'
```

Esse teste valida se a rota de login esta chegando no backend e se a senha esta sendo conferida contra o hash salvo no PostgreSQL.

### Testar se a IA esta online

```powershell
Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:8001/health"
```

### Testar a chave da API do OpenRouter

Entre na pasta da IA:

```powershell
cd "C:\Users\kaua\Downloads\be-a-ba\ia"
```

Opcionalmente, veja se o arquivo `.env` existe:

```powershell
dir -Force
```

Opcionalmente, confira o conteudo do `.env` sem compartilhar a chave em prints publicos:

```powershell
Get-Content .env
```

Execute o teste:

```powershell
python teste_llm.py
```

Esse arquivo serve para testar somente a comunicacao com o OpenRouter. Ele carrega a chave `OPENROUTER_API_KEY`, envia uma pergunta curta para o modelo configurado e mostra se a resposta voltou com sucesso. Tambem mostra a contagem de tokens de entrada, saida e total.

### Rodar testes automatizados da camada de IA

```powershell
cd "C:\Users\kaua\Downloads\be-a-ba\ia"
python -m pytest
```

### Checar sintaxe do backend Node

```powershell
cd "C:\Users\kaua\Downloads\be-a-ba"
& "C:\Program Files\nodejs\node.exe" --check ".\login\login.js"
```

Para checar os arquivos do backend:

```powershell
Get-ChildItem ".\backend-node\src" -Recurse -File -Filter *.js | ForEach-Object {
  & "C:\Program Files\nodejs\node.exe" --check $_.FullName
}
```

## Tecnologias Utilizadas

- HTML, CSS e JavaScript: interface web do sistema.
- Node.js: runtime do backend principal.
- Express: framework HTTP usado para criar as rotas REST.
- PostgreSQL: banco de dados relacional onde ficam usuarios, lojas, estoque, envios, recebimentos, manutencoes, historico e relatorios.
- pg: biblioteca Node.js usada para conectar o Express ao PostgreSQL.
- dotenv: leitura de variaveis de ambiente nos arquivos `.env`.
- bcrypt/crypt: protecao de senhas por hash. No login, a senha digitada e comparada com o hash salvo no banco.
- FastAPI: framework Python usado para a camada de IA.
- Uvicorn: servidor ASGI que executa a API FastAPI.
- Pydantic: validacao e padronizacao dos dados recebidos e retornados pela IA.
- psycopg: conexao da camada Python com o PostgreSQL.
- OpenRouter: provedor usado para acessar modelos de linguagem.
- pytest: testes automatizados da camada de IA.

## Estrutura Do Projeto

```text
administrador/      Telas administrativas e dashboard
EnvioTaloes/        Tela de envio e edicao de remessas
GerenciarPerfis/    Gerenciamento de usuarios, perfis e vinculos
gestor/             Dashboard e relatorios gerenciais
login/              Tela de login e recuperacao de senha
Lojas/              Cadastro e manutencao de lojas
Recebimento/        Tela de recebimento de taloes
relatorios/         Arquivos exportados
shared/             Configuracoes, estilos e scripts compartilhados
dados/              Arquivos auxiliares e resultados gerados
backend-node/       Backend principal em Node.js/Express
ia/                 Camada analitica e IA em Python/FastAPI
python/             Script legado de IA para envio de taloes
```

## Arquitetura Geral

Fluxo principal do sistema:

```text
Frontend HTML/CSS/JS
        |
        v
Backend Node.js / Express - porta 8000
        |
        v
PostgreSQL
        |
        v
Camada IA Python / FastAPI - porta 8001
        |
        v
OpenRouter / LLM
```

O backend Node e o centro operacional do sistema. Ele recebe as requisicoes do frontend e do Insomnia, valida dados, executa regras de negocio e grava ou consulta informacoes no PostgreSQL.

A camada de IA fica separada porque ela tem uma responsabilidade diferente: gerar analises, respostas executivas e insights a partir de calculos oficiais. Ela nao substitui o backend Node e nao deve ser usada como banco principal.

### Fluxo de uma requisicao no Node

Exemplo com login:

```text
POST /api/auth/login
        |
        v
auth.routes.js recebe matricula e senha
        |
        v
services.authenticate aplica regra de negocio
        |
        v
repository.findUserForAuth executa SQL
        |
        v
PostgreSQL compara senha com senha_hash
        |
        v
Backend retorna usuario autenticado
```

Esse padrao se repete nos outros modulos:

```text
Rota HTTP -> Service -> Repository -> PostgreSQL -> Service -> Resposta JSON
```

### Modulos de rotas do backend

As rotas sao agrupadas por modulo:

```text
/api/health
/api/auth
/api/usuarios
/api/perfis
/api/usuarios-perfis
/api/lojas
/api/estoque
/api/envios
/api/recebimentos
/api/historico
/api/manutencoes
/api/dashboard
/api/ia
/api/relatorios
/api/anomalias
/api/notificacoes/workplace
/api/chatbot
```

Exemplos:

```http
GET    /api/usuarios
GET    /api/usuarios/QQ1003
POST   /api/usuarios
PUT    /api/usuarios/QQ1003
DELETE /api/usuarios/QQ1003

GET    /api/lojas
POST   /api/lojas
PUT    /api/lojas/39
DELETE /api/lojas/39

POST   /api/envios
POST   /api/recebimentos
GET    /api/historico
GET    /api/relatorios/estoque
```

### Conexao com o banco de dados

A conexao fica em `backend-node/src/database/conexao.js`.

O arquivo cria um `Pool` do PostgreSQL usando as variaveis do `.env`. O `Pool` permite reaproveitar conexoes em vez de abrir uma nova conexao para cada requisicao.

Funcoes importantes:

- `query(text, params)`: executa SQL parametrizado.
- `withTransaction(callback)`: executa varias operacoes dentro de uma transacao.
- `databaseHealth()`: testa se o banco esta disponivel.
- `closePool()`: encerra o pool.

O uso de parametros, como `$1`, `$2`, evita montar SQL por concatenacao e reduz risco de SQL Injection.

## Banco De Dados

O PostgreSQL guarda os dados oficiais do sistema. Exemplos de entidades usadas pelo projeto:

- `usuarios`: usuarios do sistema, matricula, email, cargo, status e senha em hash.
- `perfis`: perfis de acesso.
- `usuarios_perfis`: vinculo entre usuario e perfil.
- `lojas`: lojas cadastradas.
- `estoque_lojas`: estoque atual, minimo e recomendado por loja.
- `envios_taloes`: registros de envio de taloes.
- `recebimentos_taloes`: registros de recebimento.
- `historico_taloes`: movimentacoes e auditoria.
- `manutencoes_taloes`: correcoes e manutencoes.
- `anomalias_recebimento`: divergencias e problemas identificados.

Tambem existem views usadas para facilitar consultas:

- `public.vw_lojas_api`
- `public.vw_estoque_alertas`

Essas views ajudam o backend e a IA a buscar dados prontos para exibicao e analise.

## Camada De IA

A camada de IA fica em:

```text
C:\Users\kaua\Downloads\be-a-ba\ia
```

Ela roda separada do backend Node:

```text
Node.js:  http://localhost:8000
IA:       http://127.0.0.1:8001
```

Responsabilidades da IA:

- Consultar indicadores analiticos do banco.
- Gerar resumo operacional.
- Gerar insight executivo.
- Responder perguntas do chatbot analitico.
- Usar OpenRouter somente quando precisa de explicacao em linguagem natural.
- Guardar/cachear insights para evitar chamadas repetidas ao modelo.

### Endpoints principais da IA

```http
GET  /health
GET  /semantic-layer/indicadores
POST /llm/teste
POST /insights/analisar-calculos
GET  /analytics/resumo
GET  /analytics/estoque-lojas
POST /analytics/insight-executivo
POST /chat/perguntar
```

## Economia De Tokens

A economia de tokens acontece por quatro motivos principais.

1. A IA nao recebe o banco inteiro.

O backend Node ou a camada analytics calculam primeiro os indicadores importantes. A IA recebe apenas um JSON resumido com numeros, filtros e periodo.

2. A IA nao recalcula dados oficiais.

O prompt orienta o modelo a analisar somente os calculos recebidos. Assim, o modelo nao precisa gastar tokens lendo muitos registros nem tentando refazer formulas.

3. O prompt e compacto.

O arquivo `app/llm/prompts.py` usa `json.dumps` com separadores compactos para reduzir o tamanho do JSON enviado ao modelo.

4. Existe cache por hash.

Antes de chamar o OpenRouter, a IA cria um hash dos calculos recebidos. Se os mesmos calculos ja foram analisados antes, o sistema retorna o insight salvo e marca `cache_hit: true`.

Fluxo do cache:

```text
Calculos oficiais
        |
        v
Gera calculo_hash
        |
        v
Procura insight salvo
        |
        +-- encontrou -> retorna cache_hit: true sem gastar tokens
        |
        +-- nao encontrou -> chama OpenRouter, salva resultado e retorna cache_hit: false
```

## Relacao Entre Backend Node E IA

O backend Node e responsavel pela operacao do sistema: usuarios, lojas, estoque, envio, recebimento, historico e relatorios.

A IA e responsavel pela interpretacao analitica: ela transforma calculos ja confiaveis em explicacoes mais faceis de entender.

Exemplo:

```text
Node consulta estoque e movimentacoes
        |
        v
Node ou Analytics calcula KPIs
        |
        v
IA recebe JSON com os KPIs
        |
        v
IA gera resumo/recomendacao
        |
        v
Frontend exibe a resposta para o usuario
```

Isso e importante para a apresentacao: a IA nao e a fonte da verdade. A fonte da verdade e o PostgreSQL. A IA apenas interpreta dados calculados pelo sistema.

## Logica Dos Arquivos Da IA

### `app/main.py`

Cria a aplicacao FastAPI, define titulo/versao e registra os grupos de rotas:

- `health`
- `semantic_layer`
- `llm`
- `insights`
- `analytics`
- `chat`

Tambem fecha pools de conexao quando a aplicacao encerra.

### `app/core/config.py`

Centraliza as configuracoes lidas do `.env`, como:

- chave do OpenRouter;
- modelo usado;
- DSN do banco operacional;
- DSN do banco/historico da IA;
- limite de tokens;
- temperatura do modelo;
- habilitacao do cache.

### `app/core/database.py`

Cria pools de conexao com PostgreSQL:

- `get_analytics_pool()`: usado para ler dados operacionais.
- `get_ia_pool()`: usado para salvar historico/cache dos insights.

Se uma DSN nao estiver configurada, a camada correspondente nao abre conexao.

### `app/api/dependencies.py`

Monta as dependencias da API. Ele cria repositorios, cliente OpenRouter e services. Isso evita repetir criacao de objetos em cada rota.

### `app/api/health.py`

Endpoint simples para validar se a camada de IA esta no ar.

### `app/api/semantic_layer.py`

Expoe os indicadores definidos em:

```text
semantic_layer/indicadores.json
```

A Semantic Layer documenta quais indicadores existem, como devem ser interpretados e qual o significado deles.

### `app/api/llm.py`

Expoe endpoint de teste direto da LLM. E util para validar se a chave do OpenRouter e o modelo configurado estao funcionando.

### `app/api/insights.py`

Recebe calculos em JSON e chama o `InsightService`. Essa rota e usada quando o sistema ja tem os numeros prontos e quer apenas uma analise textual.

### `app/api/analytics.py`

Expoe endpoints que calculam KPIs a partir do banco:

- resumo operacional;
- estoque por loja;
- insight executivo.

### `app/api/chat.py`

Recebe perguntas do usuario e usa o `AnalyticsService` para responder com base nos KPIs calculados.

### `app/services/analytics_service.py`

Contem a regra analitica. Ele consulta dados no `AnalyticsRepository`, calcula KPIs, identifica intencoes de perguntas e decide quando precisa chamar a IA generativa.

Exemplos de respostas que podem ser calculadas sem LLM:

- total de lojas;
- estoque atual de uma loja;
- funcionarios por loja;
- total enviado;
- total recebido;
- divergencias;
- anomalias abertas.

Quando a pergunta exige uma explicacao executiva, ele chama o `InsightService`.

### `app/services/insight_service.py`

Coordena a geracao de insights:

1. recebe os calculos;
2. monta o payload usado no hash;
3. consulta o cache;
4. busca metadados da Semantic Layer;
5. monta o prompt;
6. chama o OpenRouter;
7. salva o insight;
8. retorna resposta padronizada.

### `app/repositories/analytics_repository.py`

Executa SQL de leitura no banco operacional. Ele busca informacoes de estoque, lojas, envios, recebimentos, manutencoes e anomalias.

### `app/repositories/insight_repository.py`

Responsavel pelo armazenamento dos insights.

Se `IA_DATABASE_DSN` estiver configurado, usa PostgreSQL. Se nao estiver configurado, usa memoria local para desenvolvimento.

### `app/repositories/semantic_repository.py`

Le o arquivo `semantic_layer/indicadores.json` e permite buscar a definicao de um indicador pelo nome.

### `app/llm/openrouter_client.py`

Faz a chamada HTTP para:

```text
https://openrouter.ai/api/v1/chat/completions
```

Ele envia o prompt, recebe a resposta, captura erros do provedor e retorna tambem informacoes de tokens usados.

### `app/llm/prompts.py`

Monta o prompt enviado para a LLM. O prompt pede resposta curta, JSON valido e uso exclusivo dos calculos oficiais recebidos.

### `app/analytics/fingerprints.py`

Gera o hash dos calculos. Esse hash e a chave do cache.

### `app/schemas/`

Define os formatos dos dados recebidos e retornados pela API usando Pydantic. Isso ajuda a validar requisicoes e manter respostas padronizadas.

### `teste_llm.py`

Script de teste manual da chave OpenRouter. Ele nao inicia o backend e nao substitui o servidor da IA. Ele serve apenas para confirmar que a comunicacao com a LLM esta operacional.

## Arquivo `ia_envio_taloes.json`

O arquivo:

```text
dados/ia_envio_taloes.json
```

guarda um resultado gerado por rotina de IA/script legado. Ele funciona como uma saida materializada: o sistema pode ler esse JSON para exibir analises ja geradas.

Quando os dados das lojas mudam no banco, esse arquivo nao muda sozinho. Ele so e atualizado quando a rotina que gera esse JSON e executada novamente, por exemplo por uma rota de recalculo ou script especifico.

## Insomnia

As requisicoes HTTP devem apontar para:

```text
http://localhost:8000/api
```

Exemplo de login:

```http
POST http://localhost:8000/api/auth/login
Content-Type: application/json

{
  "matricula": "QQ1003",
  "senha": "123456"
}
```

Exemplo de consulta:

```http
GET http://localhost:8000/api/usuarios
```

Exemplo de atualizacao:

```http
PUT http://localhost:8000/api/usuarios/QQ1003
Content-Type: application/json

{
  "nome": "Kaua Sousa",
  "email": "kauasousa@verdecard.com.br",
  "cargo": "administrador",
  "status": "Ativo"
}
```

## Resumo Para Apresentacao

Uma forma simples de explicar o projeto:

> O Oferte e Ganhe e um sistema de gestao de taloes. O frontend envia requisicoes para um backend Node.js. O backend aplica as regras de negocio e grava os dados no PostgreSQL. A camada de IA em Python roda separada e usa os dados ja calculados para gerar insights, evitando enviar dados brutos desnecessarios para a LLM. Assim, o banco continua sendo a fonte da verdade e a IA atua como apoio analitico.

