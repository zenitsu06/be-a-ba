# Backend Python - Oferte e Ganhe

Backend sem dependencias externas, usando apenas a biblioteca padrao do Python.

## Estrutura

```text
backend/
  config.py     # Configuracoes por ambiente: host, porta, CORS e limite de body
  routes.py     # Tabela central de rotas GET/POST e respostas JSON/CSV
  server.py     # Servidor HTTP, leitura de body e entrega de respostas
  services.py   # Regras de negocio: usuarios, lojas, envios, IA e relatorios
  storage.py    # Caminhos, leitura/escrita atomica e criacao dos JSONs base
```

Essa separacao deixa o servidor preparado para crescer: novas rotas entram em
`routes.py`, novas regras entram em `services.py`, e configuracoes de ambiente
ficam em `config.py`.

## Rodar

```bash
python backend/server.py
```

Depois acesse:

```text
http://localhost:8000/login/login.html
```

## Configuracao por ambiente

Voce pode trocar a porta sem editar o codigo:

```powershell
$env:OFERTE_BACKEND_PORT="8001"
python backend\server.py
```

Variaveis aceitas:

- `OFERTE_BACKEND_HOST`
- `OFERTE_BACKEND_PORT`
- `OFERTE_BACKEND_MAX_BODY_BYTES`
- `OFERTE_BACKEND_ALLOW_ORIGIN`

## Rotas principais

- `POST /api/login`
- `GET /api/usuarios`
- `POST /api/usuarios`
- `POST /api/usuarios/status`
- `GET /api/lojas`
- `POST /api/lojas`
- `GET /api/estoque`
- `GET /api/envios`
- `POST /api/envios`
- `GET /api/recebimentos`
- `POST /api/recebimentos`
- `GET /api/ia/envio-taloes`
- `POST /api/ia/envio-taloes/recalcular`
- `GET /api/relatorios/usuarios.csv`
- `GET /api/relatorios/lojas.csv`
- `GET /api/relatorios/envios.csv`
- `GET /api/relatorios/recebimentos.csv`
- `GET /api/relatorios/estoque.csv`
- `GET /api/relatorios/gestor.csv`
- `GET /api/relatorios/relatorios_enviados.csv`
- `GET /api/relatorios/enviados`
- `POST /api/relatorios/enviar`
- `POST /api/chatbot`

## Observacao

O script `python/ia_envio_taloes.py` continua sendo a fonte da simulacao de IA
para RF11, RF11-IA e RF12-IA. O backend apenas executa esse script e entrega o
JSON gerado para o frontend.
