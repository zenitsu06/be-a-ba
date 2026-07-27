# ininciando os servidores
cd "C:\Users\kaua\Downloads\be-a-ba\backend-node" npm run dev
cd "C:\Users\kaua\Downloads\be-a-ba\ia" uvicorn app.main:app --reload

# testes da chave api do OpenRouter
cd "C:\Users\kaua\Downloads\be-a-ba\ia" após isso verificar se o arquivo está dentro da pasta "ia" colocando: dir -Force (Esse comando é opcional, é apenas verificar o arquivo na pasta)
Get-Content .env depois python teste_llm.py

## Arquitetura

```text
React -> Node.js -> PostgreSQL
                  -> schema oferteganhe: dados operacionais
                  -> schema ia: calculos, historico e insights

FastAPI (Python) -> Analytics -> LLM -> ML futuro
```

Fluxo principal para economia de tokens:

```text
Node calcula indicador -> FastAPI recebe calculos -> gera hash -> busca insight salvo
                                          -> se nao existir, chama LLM e armazena
Node acessa insight ja pensado pela IA
```

## Teste da LLM

1. Crie um `.env` a partir do `.env.example`.
2. Preencha `OPENROUTER_API_KEY`.
3. Execute:

```bash
python teste_llm.py
```

O teste valida autenticacao, comunicacao com OpenRouter, resposta textual e contagem de tokens de entrada, saida e total.

## API local

```bash
uvicorn app.main:app --reload
```

Endpoints iniciais:

- `GET /health`
- `GET /semantic-layer/indicadores`
- `POST /llm/teste`
- `POST /insights/analisar-calculos`
- `GET /analytics/resumo`
- `GET /analytics/estoque-lojas`
- `POST /analytics/insight-executivo`

Exemplo do endpoint de insights:

```json
{
  "indicador": "Gap para minimo",
  "periodo_inicio": "2026-07-01",
  "periodo_fim": "2026-07-19",
  "origem": "node",
  "filtros": {
    "loja_id": 1
  },
  "calculos": {
    "quantidade_atual": 10,
    "quantidade_minima": 20,
    "gap": -10
  }
}
```

Na primeira chamada, a LLM gera e armazena o insight. Em chamadas futuras com os mesmos calculos, a resposta volta com `cache_hit: true`.

## Analytics funcional

A camada agora consegue ler o banco operacional em modo analitico por `POSTGRES_READONLY_DSN` e calcular KPIs oficiais sem usar LLM.

Exemplos:

```bash
curl "http://127.0.0.1:8001/analytics/resumo"
curl "http://127.0.0.1:8001/analytics/estoque-lojas"
```

O endpoint `POST /analytics/insight-executivo` calcula os KPIs, monta um payload agregado e usa a LLM apenas para gerar a explicacao executiva. Como ele envia dados agregados para a OpenRouter, use conscientemente:

```json
{
  "periodo_inicio": "2026-07-01",
  "periodo_fim": "2026-07-24",
  "forcar_nova_analise": false
}
```

## Banco de Dados

O schema `ia` guarda o historico inteligente. Se `IA_DATABASE_DSN` estiver configurado, a camada usa PostgreSQL. Sem essa variavel, ela usa armazenamento em memoria para desenvolvimento local.

O schema `oferteganhe` continua sendo a fonte operacional e deve ser acessado somente com credencial de leitura.

## Roadmap

- Fase 1: infraestrutura, configuracao, Semantic Layer e endpoint analitico.
- Fase 2: analytics e historico de insights.
- Fase 3: IA generativa sobre calculos oficiais.
- Fase 4: Machine Learning.
- Fase 5: RAG, pgvector e agentes controlados.

## Fontes oficiais

A chamada HTTP usa o endpoint de chat completions da OpenRouter:

- https://openrouter.ai/docs/quickstart
- https://openrouter.ai/docs/api/reference/overview
