/*
ALAMPE CORE
Versão: 4.4.3-etapa3
Arquivo destino: server.js
*/

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const { buscarBaseTecnica, montarResposta } = require('./services/baseTecnica');
const {
  consultarPlaca,
  historicoPlacas,
  limparPlaca,
  diagnosticoProvidersPlaca,
  salvarPlacaManual
} = require('./services/consultaPlaca');

const app = express();
const PORT = process.env.PORT || 3000;
const VERSION = '4.4.3-etapa3-providers-placa';

app.use(cors());
app.use(express.json({ limit: '2mb' }));

function safeJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf8');
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    console.error('[JSON]', err.message);
    return fallback;
  }
}

app.get('/', (req, res) => {
  res.json({
    ok: true,
    nome: 'Alampe Core',
    version: VERSION,
    rotas: [
      '/api/health',
      '/api/aplicacao?q=',
      '/api/placa?placa=',
      '/api/placa/historico',
      '/api/placa/providers',
      '/api/catalogo/status'
    ]
  });
});

app.get('/api/health', (req, res) => {
  const bancoDir = path.join(__dirname, 'banco');
  res.json({
    ok: true,
    version: VERSION,
    status: 'online',
    moduloConsultaVeicular: true,
    providersPlaca: diagnosticoProvidersPlaca(),
    banco: {
      existe: fs.existsSync(bancoDir),
      aplicacoes: fs.existsSync(path.join(bancoDir, 'aplicacoes.json')),
      cachePlacas: fs.existsSync(path.join(bancoDir, 'cache_placas.json')),
      historicoPlacas: fs.existsSync(path.join(bancoDir, 'historico_placas.json'))
    },
    data: new Date().toISOString()
  });
});

app.get('/api/aplicacao', (req, res) => {
  try {
    const q = String(req.query.q || req.query.query || '').trim();
    if (!q) {
      return res.status(400).json({
        ok: false,
        erro: 'Informe a pesquisa em ?q=',
        exemplo: '/api/aplicacao?q=farol classic 2005'
      });
    }

    const limite = Math.max(1, Math.min(Number(req.query.limite || 8), 20));
    const resultados = buscarBaseTecnica(q, limite);
    const resposta = montarResposta(q, resultados, VERSION);

    return res.json({
      ok: true,
      version: VERSION,
      query: q,
      ...resposta
    });
  } catch (err) {
    console.error('[APLICACAO]', err);
    return res.status(500).json({ ok: false, erro: 'Erro ao buscar aplicacao.' });
  }
});

app.get('/api/placa', async (req, res) => {
  try {
    const placa = limparPlaca(req.query.placa || req.query.p || '');
    const forcar = String(req.query.forcar || req.query.refresh || '').toLowerCase() === 'true';

    if (!placa) {
      return res.status(400).json({
        ok: false,
        erro: 'Informe a placa em ?placa=ABC1D23'
      });
    }

    const resultado = await consultarPlaca(placa, { forcar });

    return res.json({
      ok: true,
      version: VERSION,
      ...resultado
    });
  } catch (err) {
    console.error('[PLACA]', err);
    return res.status(500).json({
      ok: false,
      erro: 'Erro ao consultar placa.',
      detalhe: err.message
    });
  }
});

app.post('/api/placa/cache', (req, res) => {
  try {
    const resultado = salvarPlacaManual(req.body || {});
    return res.json({
      ok: true,
      version: VERSION,
      ...resultado
    });
  } catch (err) {
    console.error('[PLACA CACHE]', err);
    return res.status(400).json({
      ok: false,
      erro: err.message || 'Erro ao salvar placa manualmente.'
    });
  }
});

app.get('/api/placa/historico', (req, res) => {
  try {
    const limite = Math.max(1, Math.min(Number(req.query.limite || 50), 300));
    res.json({
      ok: true,
      version: VERSION,
      historico: historicoPlacas(limite)
    });
  } catch (err) {
    console.error('[HISTORICO PLACA]', err);
    res.status(500).json({ ok: false, erro: 'Erro ao carregar historico de placas.' });
  }
});

app.get('/api/placa/providers', (req, res) => {
  res.json({
    ok: true,
    version: VERSION,
    providers: diagnosticoProvidersPlaca()
  });
});

app.get('/api/catalogo/status', (req, res) => {
  const bancoDir = path.join(__dirname, 'banco');
  const aplicacoes = safeJson(path.join(bancoDir, 'aplicacoes.json'), []);
  const cachePlacas = safeJson(path.join(bancoDir, 'cache_placas.json'), []);
  const historico = safeJson(path.join(bancoDir, 'historico_placas.json'), []);
  res.json({
    ok: true,
    version: VERSION,
    totalAplicacoes: Array.isArray(aplicacoes) ? aplicacoes.length : 0,
    placasEmCache: Array.isArray(cachePlacas) ? cachePlacas.length : 0,
    consultasPlaca: Array.isArray(historico) ? historico.length : 0
  });
});

app.listen(PORT, () => {
  console.log(`Alampe Core ${VERSION} online na porta ${PORT}`);
});
