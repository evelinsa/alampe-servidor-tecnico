const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { lerAplicacoes, buscarBaseTecnica, montarResposta, adicionarAplicacao } = require('./services/baseTecnica');
const { normalizarTexto } = require('./utils/normalizar');

const app = express();
const PORT = process.env.PORT || 10000;
const VERSION = '4.1.0-alampe-tecnico';
const cachePath = path.join(__dirname, 'banco', 'cache.json');

app.use(cors());
app.use(express.json({ limit: '5mb' }));

function lerCache() {
  try { return JSON.parse(fs.readFileSync(cachePath, 'utf8') || '{}'); } catch { return {}; }
}
function salvarCache(cache) {
  try { fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2)); } catch {}
}
function limparCacheConsulta(chave) {
  const cache = lerCache();
  if (chave) delete cache[chave];
  salvarCache(cache);
}

app.get('/', (req, res) => {
  res.json({ ok: true, nome: 'Alampe Servidor Técnico', version: VERSION, modo: 'base-tecnica-propria' });
});

app.get('/api/health', (req, res) => {
  const cache = lerCache();
  const aplicacoes = lerAplicacoes();
  res.json({
    ok: true,
    version: VERSION,
    modo: 'base-tecnica-propria',
    internetComoApoio: false,
    aplicacoes: aplicacoes.length,
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
    return res.json({ ...cache[chave], version: VERSION, cache: true, consultadoEm: new Date().toISOString() });
  }

  const resultados = buscarBaseTecnica(q);
  const resposta = montarResposta(q, resultados, VERSION);
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
  const resposta = montarResposta(q, resultados, VERSION);
  resposta.consultadoEm = new Date().toISOString();
  res.json(resposta);
});

app.get('/api/base/aplicacoes', (req, res) => {
  res.json({ ok: true, version: VERSION, total: lerAplicacoes().length, aplicacoes: lerAplicacoes() });
});

app.post('/api/base/aplicacao', (req, res) => {
  try {
    const dados = req.body || {};
    if (!Array.isArray(dados.pecas) || !Array.isArray(dados.modelos) || !Array.isArray(dados.anos)) {
      return res.status(400).json({ ok: false, error: 'Envie pecas, modelos e anos como listas.' });
    }
    const novo = adicionarAplicacao(dados);
    limparCacheConsulta();
    res.json({ ok: true, version: VERSION, salvo: novo });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/sugestoes', (req, res) => {
  const q = String(req.query.q || '').trim();
  const resultados = q ? buscarBaseTecnica(q, 5) : lerAplicacoes().slice(0, 8);
  res.json({
    ok: true,
    version: VERSION,
    sugestoes: resultados.map(r => ({
      titulo: `${(r.pecas || [])[0] || ''} ${(r.modelos || [])[0] || ''}`.trim(),
      score: r.score || r.confiancaBase || 0,
      id: r.id
    }))
  });
});

app.get('/api/mercadolivre', (req, res) => {
  res.json({ ok: true, version: VERSION, message: 'Endpoint reservado. Comparador segue pelo módulo atual do ERP.' });
});

app.listen(PORT, () => {
  console.log(`Alampe Servidor Técnico ${VERSION} rodando na porta ${PORT}`);
});
