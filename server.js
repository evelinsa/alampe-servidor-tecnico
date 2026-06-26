const express = require('express');
const cors = require('cors');

const {
  buscarBaseTecnica,
  montarResposta,
  adicionarAplicacao,
  importarAplicacoes,
  sugestoesCadastro
} = require('./services/baseTecnica');

const {
  consultarPlaca,
  listarHistoricoPlacas,
  salvarPlacaManual
} = require('./services/consultaPlaca');

const app = express();
const PORT = process.env.PORT || 3000;
const VERSION = '4.4.0-alampe-core-placa-etapa1';

app.use(cors());
app.use(express.json({ limit: '2mb' }));

function respostaErro(res, erro, status = 500) {
  console.error('[Alampe Core]', erro);
  return res.status(status).json({
    ok: false,
    version: VERSION,
    erro: erro?.message || String(erro || 'Erro desconhecido')
  });
}

app.get('/', (req, res) => {
  res.json({
    ok: true,
    nome: 'Alampe Core',
    version: VERSION,
    status: 'online',
    rotas: [
      'GET /api/health',
      'GET /api/aplicacao?q=',
      'POST /api/aplicacao',
      'POST /api/importar',
      'GET /api/placa?placa=',
      'POST /api/placa/cache',
      'GET /api/placa/historico'
    ]
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    version: VERSION,
    status: 'online',
    moduloConsultaVeicular: true,
    providerPlaca: process.env.PLACA_API_URL ? 'externo_configurado' : 'cache_local_preparado',
    data: new Date().toISOString()
  });
});

app.get('/api/aplicacao', (req, res) => {
  try {
    const q = String(req.query.q || req.query.query || '').trim();
    const limite = Math.max(1, Math.min(20, Number(req.query.limite || 8)));

    if (!q) {
      return res.status(400).json({
        ok: false,
        version: VERSION,
        erro: 'Informe a pesquisa em ?q=. Exemplo: /api/aplicacao?q=farol classic 2005'
      });
    }

    const resultados = buscarBaseTecnica(q, limite);
    const resposta = montarResposta(q, resultados, VERSION);
    res.json(resposta);
  } catch (erro) {
    respostaErro(res, erro);
  }
});

app.post('/api/aplicacao', (req, res) => {
  try {
    const salvo = adicionarAplicacao(req.body || {});
    res.json({ ok: true, version: VERSION, salvo });
  } catch (erro) {
    respostaErro(res, erro, 400);
  }
});

app.post('/api/importar', (req, res) => {
  try {
    const lista = Array.isArray(req.body) ? req.body : (req.body?.aplicacoes || []);
    const salvos = importarAplicacoes(lista);
    res.json({ ok: true, version: VERSION, total: salvos.length, salvos });
  } catch (erro) {
    respostaErro(res, erro, 400);
  }
});

app.get('/api/sugestao-cadastro', (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    res.json({ ok: true, version: VERSION, query: q, sugestao: sugestoesCadastro(q) });
  } catch (erro) {
    respostaErro(res, erro);
  }
});

app.get('/api/placa', async (req, res) => {
  try {
    const placa = String(req.query.placa || '').trim();
    const resultado = await consultarPlaca(placa);
    res.status(resultado.ok === false ? 400 : 200).json({ version: VERSION, ...resultado });
  } catch (erro) {
    respostaErro(res, erro);
  }
});

app.post('/api/placa/cache', (req, res) => {
  try {
    const salvo = salvarPlacaManual(req.body || {});
    res.json({ ok: true, version: VERSION, salvo });
  } catch (erro) {
    respostaErro(res, erro, 400);
  }
});

app.get('/api/placa/historico', (req, res) => {
  try {
    res.json({ ok: true, version: VERSION, historico: listarHistoricoPlacas() });
  } catch (erro) {
    respostaErro(res, erro);
  }
});

app.use((req, res) => {
  res.status(404).json({ ok: false, version: VERSION, erro: 'Rota não encontrada.' });
});

app.listen(PORT, () => {
  console.log(`Alampe Core ${VERSION} online na porta ${PORT}`);
});
