

## Arquitetura em camadas

Fluxo principal:

```text
Frontend -> routes/controllers -> services -> repositories -> PostgreSQL
```

Estrutura:

```text
src/
  config/          variaveis, CORS, caminhos e configuracoes globais
  database/        conexao com PostgreSQL e transacoes
  middlewares/     async route, 404 e tratamento central de erro
  repositories/    comandos SQL e acesso ao banco
  routes/          controllers HTTP e HUB de rotas
  services/        regras de negocio
  utils/           normalizadores, CSV, AppError e helpers
  server.js        montagem do Express e inicializacao
```

O arquivo `server.js` da raiz do `backend-node` foi mantido como bootstrap para preservar:

```powershell
npm start
```

## Configurar

Copie `.env.example` para `.env` e preencha a senha do PostgreSQL:

```powershell
copy .env.example .env
```

Exemplo:

```env
PORT=8000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=Oferte_e_ganhe
DB_USER=postgres
DB_PASSWORD=sua_senha
DB_POOL_MAX=5
PYTHON_BIN=C:\Users\kaua\AppData\Local\Programs\Python\Python313\python.exe
OPENROUTER_API_KEY=
OPENROUTER_MODEL=
```

Se o seu Postgres local nao usa senha, defina:

```env
DB_ALLOW_EMPTY_PASSWORD=1
```

## Rodar

```powershell
npm.cmd run dev
```

Ou em modo normal:

```powershell
npm.cmd start
```

Depois acesse:

```text
http://localhost:8000/login/login.html
```

## Rotas importantes

- `GET /api/health`
- `GET /api/lojas`
- `GET /api/lojas/duplicadas`
- `GET /api/usuarios`
- `POST /api/login`
- `GET /api/envios`
- `POST /api/envios`
- `GET /api/recebimentos`
- `POST /api/recebimentos`
- `POST /api/ia/envio-taloes/recalcular`

## OpenRouter

A estrutura ja esta preparada para receber `OPENROUTER_API_KEY` e `OPENROUTER_MODEL` pelo `.env`. O token nao foi colocado no codigo porque ele precisa ficar protegido e sera informado depois.
