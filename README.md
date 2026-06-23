# Oferte e Ganhe

Sistema web para controle de envio, recebimento, estoque e relatorios de taloes.

## Como rodar

Frontend pelo Go Live:

```text
http://localhost:5502/login/login.html
```

Backend Python:

```powershell
cd "C:\Users\kaua\OneDrive\Documentos\be-a-ba"
python backend\server.py
```

Se o Windows usar o launcher do Python:

```powershell
py backend\server.py
```

## Estrutura

```text
administrador/      Dashboard administrativo
EnvioTaloes/        Tela de envio e edicao de remessas
GerenciarPerfis/    Cadastro e controle de usuarios
gestor/             Dashboard e relatorios gerenciais
login/              Autenticacao e recuperacao de senha
Lojas/              Cadastro de lojas e vinculo com funcionarios
usuario/            Tela do lojista para recebimento e estoque
shared/             CSS/JS compartilhados entre telas
backend/            Servidor Python, rotas, servicos e armazenamento JSON
dados/              Base local JSON usada pelo prototipo
python/             Scripts obrigatorios de IA em Python
relatorios/         CSVs exportados pelo backend
```

## Arquivos compartilhados

- `shared/ui-refresh.css`: tema visual global branco/verde.
- `shared/app-config.js`: configuracao central do frontend, incluindo URL do backend.
- `shared/chatbot.js`: assistente conversacional conectado ao backend Python.

Para trocar a URL do backend sem editar os scripts, execute no console do navegador:

```javascript
localStorage.setItem('oferteApiBase', 'http://localhost:8000')
```
