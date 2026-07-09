# Backend Node.js - Oferte e Ganhe

Backend oficial do projeto em Express/Node.js, mantendo as rotas `/api/...` usadas pelo frontend.
Python permanece apenas em `../python/ia_envio_taloes.py` para executar a IA.

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
```

Se o seu Postgres local nao usa senha, defina:

```env
DB_ALLOW_EMPTY_PASSWORD=1
```

## Rodar

```powershell
npm.cmd start
```

Ou em modo desenvolvimento:

```powershell
npm.cmd run dev
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
