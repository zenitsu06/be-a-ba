# Oferte e Ganhe

Sistema web para controle de envio, recebimento, estoque e relatorios de taloes.

## Como rodar

Aplicacao completa pelo backend Node:

```powershell
cd "C:\Users\kaua\Downloads\be-a-ba\backend-node"
npm.cmd start
```

Depois acesse:

```text
http://localhost:8000/login/login.html
```

Antes de rodar pela primeira vez, copie o arquivo de ambiente e configure a senha do PostgreSQL:

```powershell
copy .env.example .env
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
backend-node/       Backend Node.js/Express conectado ao PostgreSQL
dados/              Arquivos auxiliares gerados pela IA e fallback local
python/             IA em Python para RF11, RF11-IA e RF12-IA
relatorios/         CSVs exportados pelo backend Node
```

## Arquivos compartilhados

- `shared/ui-refresh.css`: tema visual global branco/verde.
- `shared/app-config.js`: configuracao central do frontend, incluindo URL do backend.
- `shared/chatbot.js`: assistente conversacional conectado ao backend Node.

Para trocar a URL do backend sem editar os scripts, execute no console do navegador:

```javascript
localStorage.setItem('oferteApiBase', 'http://localhost:8000')
```
