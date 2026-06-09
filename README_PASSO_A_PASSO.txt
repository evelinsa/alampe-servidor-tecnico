ALAMPE - SERVIDOR TÉCNICO

O que este servidor faz:
- Consulta Mercado Livre pelo backend, evitando bloqueio do navegador.
- Consulta aplicação de peças por Google Custom Search ou SerpAPI.
- Devolve os resultados para o Alampe sem sair do sistema.

COMO RODAR LOCALMENTE NO PC

1. Instale o Node.js.
2. Extraia esta pasta.
3. Abra o terminal dentro da pasta.
4. Rode:

   npm install
   npm start

5. Se aparecer "Servidor técnico Alampe rodando na porta 3001", está ok.
6. No Alampe, salve esta URL no campo URL do servidor técnico:

   http://localhost:3001

ATENÇÃO:
- Localhost funciona só no mesmo computador onde o servidor está rodando.
- Para usar no celular ou em outros computadores, hospede online.

COMO HOSPEDAR ONLINE

Use uma plataforma de Node.js, como Render, Railway ou similar.
Configuração:

Build command:
   npm install

Start command:
   npm start

Variáveis de ambiente:
   GOOGLE_API_KEY
   GOOGLE_CSE_ID
   SERPAPI_KEY (opcional)
   TRUSTED_DOMAINS (opcional)

Depois de publicado, copie a URL HTTPS gerada e cole no Alampe.
Exemplo:
   https://alampe-servidor-tecnico.onrender.com

TESTE RÁPIDO

Abra no navegador:

   SUA_URL/api/health

Se retornar algo como:

   {"ok":true,...}

está funcionando.

MERCADO LIVRE

Teste:
   SUA_URL/api/mercadolivre?q=farol%20gol%20g6

BUSCA TÉCNICA DE APLICAÇÃO

Teste:
   SUA_URL/api/aplicacao?q=farol%20gol%20g6

Se a busca técnica retornar erro pedindo GOOGLE_API_KEY/GOOGLE_CSE_ID ou SERPAPI_KEY, significa que ainda falta configurar a chave de busca.
