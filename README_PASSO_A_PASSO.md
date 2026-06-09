# Alampe Servidor Técnico

Rotas:
- `/` mostra status e rotas disponíveis.
- `/api/health` verifica se o servidor está online.
- `/api/mercadolivre?q=farol%20gol%20g6` consulta preços do Mercado Livre com fallback.
- `/api/aplicacao?q=farol%20gol%20g6` busca aplicação em fontes externas.

## Render
Build Command:
```
npm install
```
Start Command:
```
npm start
```

## Variáveis opcionais para busca técnica mais estável
Para busca de aplicação via Google oficial:
- `GOOGLE_API_KEY`
- `GOOGLE_CSE_ID`

Ou via SerpAPI:
- `SERPAPI_KEY`

Sem essas chaves, o servidor usa fallback via DuckDuckGo, que pode funcionar, mas é menos estável.
