const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { buscarBaseTecnica, montarResposta } = require('./services/baseTecnica');
const { normalizarTexto } = require('./utils/normalizar');

const app = express();
const PORT = process.env.PORT || 10000;
const VERSION = '4.0.0-alampe-tecnico';
const cachePath = path.join(__dirname, 'banco', 'cache.json');

app.use(cors());
app.use(express.json({ limit: '2mb' }));

function lerCache() {
  try { return JSON.parse(fs.readFileSync(cachePath, 'utf8') || '{}'); } catch { return {}; }
}
function salvarCache(cache) {
  try { fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2)); } catch {}
}

app.get('/', (req, res) => {
  res.json({ ok: true, nome: 'Alampe Servidor Técnico', version: VERSION });
});

app.get('/api/health', (req, res) => {
  const cache = lerCache();
  res.json({
    ok: true,
    version: VERSION,
    modo: 'base-tecnica-propria',
    internetComoApoio: false,
    cacheItens: Object.keys(cache).length,
    atualizadoEm: new Date().toISOString()
  });
});

app.get('/api/aplicacao', (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.status(400).json({ ok: false, error: 'Informe q na consulta.' });

  const chave = normalizarTexto(q);
  const cache = lerCache();
  if (cache[chave]) {
    return res.json({ ...cache[chave], cache: true, consultadoEm: new Date().toISOString() });
  }

  const resultados = buscarBaseTecnica(q);
  const resposta = montarResposta(q, resultados);
  resposta.version = VERSION;
  resposta.cache = false;
  resposta.consultadoEm = new Date().toISOString();

  cache[chave] = resposta;
  salvarCache(cache);
  res.json(resposta);
});

app.post('/api/aplicacao', (req, res) => {
  const q = String(req.body?.q || req.body?.query || '').trim();
  if (!q) return res.status(400).json({ ok: false, error: 'Informe q ou query no body.' });
  const resultados = buscarBaseTecnica(q);
  const resposta = montarResposta(q, resultados);
  resposta.version = VERSION;
  resposta.consultadoEm = new Date().toISOString();
  res.json(resposta);
});

app.post('/api/base/aplicacao', (req, res) => {
  res.status(501).json({
    ok: false,
    message: 'Cadastro online de aplicações será liberado no V4.1. Nesta V4.0 edite banco/aplicacoes.json e faça deploy.'
  });
});

app.get('/api/mercadolivre', (req, res) => {
  res.json({ ok: true, version: VERSION, message: 'Comparador Mercado Livre permanece no ERP/integração atual. Endpoint reservado.' });
});

app.listen(PORT, () => {
  console.log(`Alampe Servidor Técnico ${VERSION} rodando na porta ${PORT}`);
});
