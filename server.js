import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const PORT = process.env.PORT || 3001;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || '';
const GOOGLE_CSE_ID = process.env.GOOGLE_CSE_ID || '';
const SERPAPI_KEY = process.env.SERPAPI_KEY || '';

const TRUSTED_DOMAINS = (process.env.TRUSTED_DOMAINS || [
  'nakata.com.br',
  'cofap.com.br',
  'marelli.com.br',
  'schaeffler.com.br',
  'boschaftermarket.com',
  'dana.com',
  'mmcofap.com.br',
  'authomix.com.br',
  'catalogo.mmcofap.com.br',
  'mercadolivre.com.br'
].join(',')).split(',').map(s => s.trim()).filter(Boolean);

function normalize(text = '') {
  return String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function cleanSnippet(text = '') {
  return String(text)
    .replace(/\s+/g, ' ')
    .replace(/[|•·]+/g, ' ')
    .trim();
}

function extractYears(text) {
  return [...String(text).matchAll(/(?:19|20)\d{2}(?:\s*[\/\-]\s*(?:19|20)\d{2})?/g)]
    .map(m => m[0].replace(/\s+/g, ''))
    .slice(0, 8);
}

function buildApplication(item, query) {
  const title = cleanSnippet(item.title || '');
  const snippet = cleanSnippet(item.snippet || item.resumo || '');
  const sourceText = `${title}. ${snippet}`;
  let app = sourceText.toUpperCase();

  app = app
    .replace(/\b(COMPRAR|PREÇO|VALOR|FRETE|ENVIO|PROMOÇÃO|MERCADO LIVRE|AMAZON|SHOPEE|NOVO|USADO|ORIGINAL|PARALELO)\b/g, ' ')
    .replace(/R\$\s*[0-9.,]+/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const years = extractYears(sourceText);
  const queryWords = normalize(query).split(' ').filter(w => w.length > 2);
  const hasVehicleOrYear = years.length || /\b(GOL|VOYAGE|SAVEIRO|ONIX|PRISMA|CORSA|CELTA|HB20|KA|FIESTA|PALIO|UNO|STRADA|SIENA|CIVIC|COROLLA|HILUX|S10|FOX|POLO|GOLF|FOCUS|ASTRA|VECTRA|CRUZE|ECOSPORT|RENEGADE|COMPASS|KWID|LOGAN|SANDERO)\b/i.test(sourceText);

  if (!hasVehicleOrYear && queryWords.length) {
    app = `${query.toUpperCase()} - ${app}`;
  }

  if (app.length > 180) app = app.slice(0, 180).replace(/\s+\S*$/, '');
  return app;
}

async function googleCseSearch(query) {
  if (!GOOGLE_API_KEY || !GOOGLE_CSE_ID) return [];
  const domains = TRUSTED_DOMAINS.slice(0, 8).map(d => `site:${d}`).join(' OR ');
  const q = `${query} aplicação compatibilidade catálogo autopeças (${domains})`;
  const url = new URL('https://www.googleapis.com/customsearch/v1');
  url.searchParams.set('key', GOOGLE_API_KEY);
  url.searchParams.set('cx', GOOGLE_CSE_ID);
  url.searchParams.set('q', q);
  url.searchParams.set('num', '10');
  const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!r.ok) throw new Error(`Google CSE HTTP ${r.status}`);
  const data = await r.json();
  return (data.items || []).map(it => ({
    title: it.title || '',
    snippet: it.snippet || '',
    link: it.link || '',
    fonte: new URL(it.link || 'https://google.com').hostname.replace(/^www\./, '')
  }));
}

async function serpApiSearch(query) {
  if (!SERPAPI_KEY) return [];
  const q = `${query} aplicação compatibilidade catálogo autopeças`;
  const url = new URL('https://serpapi.com/search.json');
  url.searchParams.set('engine', 'google');
  url.searchParams.set('google_domain', 'google.com.br');
  url.searchParams.set('gl', 'br');
  url.searchParams.set('hl', 'pt-br');
  url.searchParams.set('q', q);
  url.searchParams.set('api_key', SERPAPI_KEY);
  const r = await fetch(url);
  if (!r.ok) throw new Error(`SerpAPI HTTP ${r.status}`);
  const data = await r.json();
  return (data.organic_results || []).slice(0, 10).map(it => ({
    title: it.title || '',
    snippet: it.snippet || '',
    link: it.link || '',
    fonte: it.source || (it.link ? new URL(it.link).hostname.replace(/^www\./, '') : 'Google')
  }));
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, googleCse: Boolean(GOOGLE_API_KEY && GOOGLE_CSE_ID), serpApi: Boolean(SERPAPI_KEY) });
});

app.get('/api/aplicacao', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.status(400).json({ erro: 'Informe a peça para pesquisar.' });

    let raw = [];
    try { raw = await googleCseSearch(q); } catch (e) { console.warn(e.message); }
    if (!raw.length) {
      try { raw = await serpApiSearch(q); } catch (e) { console.warn(e.message); }
    }

    if (!raw.length) {
      return res.status(503).json({
        erro: 'Configure GOOGLE_API_KEY + GOOGLE_CSE_ID ou SERPAPI_KEY no servidor técnico.'
      });
    }

    const seen = new Set();
    const resultados = raw.map(item => {
      const aplicacao = buildApplication(item, q);
      return {
        aplicacao,
        resumo: cleanSnippet(`${item.title}. ${item.snippet}`),
        fonte: item.fonte,
        link: item.link
      };
    }).filter(item => {
      const key = normalize(item.aplicacao);
      if (!key || key.length < 8 || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 8);

    res.json({ consulta: q, resultados });
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: e.message || 'Erro na busca técnica.' });
  }
});

app.get('/api/mercadolivre', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const limit = Math.min(Number(req.query.limit || 50), 50);
    if (!q) return res.status(400).json({ erro: 'Informe a peça.' });
    const url = new URL('https://api.mercadolibre.com/sites/MLB/search');
    url.searchParams.set('q', q);
    url.searchParams.set('limit', String(limit));
    const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!r.ok) throw new Error(`Mercado Livre HTTP ${r.status}`);
    const data = await r.json();
    const itens = (data.results || []).map(i => ({
      title: i.title || 'ANÚNCIO',
      price: Number(i.price || 0),
      condition: i.condition || '',
      permalink: i.permalink || '',
      shipping: i.shipping || {}
    })).filter(i => Number.isFinite(i.price) && i.price > 0);
    res.json({ consulta: q, itens });
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: e.message || 'Erro ao consultar Mercado Livre.' });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor técnico Alampe rodando na porta ${PORT}`);
});
