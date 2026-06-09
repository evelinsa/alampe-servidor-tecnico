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
  'catalogo.mmcofap.com.br',
  'mercadolivre.com.br',
  'autopecas.*',
  'catalogo.*'
].join(',')).split(',').map(s => s.trim()).filter(Boolean);

function normalize(text = '') {
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanSnippet(text = '') {
  return String(text)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/[|•·]+/g, ' ')
    .trim();
}

function extractYears(text) {
  return [...String(text).matchAll(/(?:19|20)\d{2}(?:\s*[\/\-]\s*(?:19|20)\d{2})?/g)]
    .map(m => m[0].replace(/\s+/g, ''))
    .slice(0, 8);
}

function moneyToNumber(value) {
  if (typeof value === 'number') return value;
  const raw = String(value || '').replace(/[^\d,\.]/g, '').trim();
  if (!raw) return 0;
  if (raw.includes(',') && raw.includes('.')) return Number(raw.replace(/\./g, '').replace(',', '.'));
  if (raw.includes(',')) return Number(raw.replace(',', '.'));
  return Number(raw);
}

function slugifyMercadoLivre(q) {
  return normalize(q).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, '-').replace(/^-|-$/g, '');
}

function getBrowserHeaders(extra = {}) {
  return {
    'Accept': 'application/json,text/plain,*/*',
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36',
    ...extra
  };
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
  const hasVehicleOrYear = years.length || /\b(GOL|VOYAGE|SAVEIRO|ONIX|PRISMA|CORSA|CELTA|HB20|KA|FIESTA|PALIO|UNO|STRADA|SIENA|CIVIC|COROLLA|HILUX|S10|FOX|POLO|GOLF|FOCUS|ASTRA|VECTRA|CRUZE|ECOSPORT|RENEGADE|COMPASS|KWID|LOGAN|SANDERO|ARGO|CRONOS|TORO|MOBI|FIT|CITY|HRV|CRETA)\b/i.test(sourceText);

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
  const r = await fetch(url, { headers: getBrowserHeaders({ 'Accept': 'application/json' }) });
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
  const r = await fetch(url, { headers: getBrowserHeaders() });
  if (!r.ok) throw new Error(`SerpAPI HTTP ${r.status}`);
  const data = await r.json();
  return (data.organic_results || []).slice(0, 10).map(it => ({
    title: it.title || '',
    snippet: it.snippet || '',
    link: it.link || '',
    fonte: it.source || (it.link ? new URL(it.link).hostname.replace(/^www\./, '') : 'Google')
  }));
}

async function duckDuckGoSearch(query) {
  const domains = TRUSTED_DOMAINS
    .filter(d => !d.includes('*'))
    .slice(0, 10)
    .map(d => `site:${d}`)
    .join(' OR ');
  const q = `${query} aplicação compatibilidade catálogo autopeças ${domains ? `(${domains})` : ''}`;
  const url = new URL('https://html.duckduckgo.com/html/');
  url.searchParams.set('q', q);
  const r = await fetch(url, {
    headers: getBrowserHeaders({
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    })
  });
  if (!r.ok) throw new Error(`DuckDuckGo HTTP ${r.status}`);
  const html = await r.text();
  const results = [];
  const re = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) && results.length < 10) {
    const link = cleanDuckUrl(m[1]);
    results.push({
      title: cleanSnippet(m[2]),
      snippet: cleanSnippet(m[3]),
      link,
      fonte: getHost(link) || 'DuckDuckGo'
    });
  }
  return results;
}

function cleanDuckUrl(url) {
  try {
    const decoded = url.replace(/&amp;/g, '&');
    const u = new URL(decoded, 'https://duckduckgo.com');
    const uddg = u.searchParams.get('uddg');
    return uddg ? decodeURIComponent(uddg) : u.href;
  } catch {
    return url;
  }
}

function getHost(link) {
  try { return new URL(link).hostname.replace(/^www\./, ''); } catch { return ''; }
}

async function mercadoLivreApiSearch(q, limit) {
  const url = new URL('https://api.mercadolibre.com/sites/MLB/search');
  url.searchParams.set('q', q);
  url.searchParams.set('limit', String(limit));
  const r = await fetch(url, {
    headers: getBrowserHeaders({
      'Origin': 'https://www.mercadolivre.com.br',
      'Referer': 'https://www.mercadolivre.com.br/'
    })
  });
  if (!r.ok) throw new Error(`Mercado Livre API HTTP ${r.status}`);
  const data = await r.json();
  return (data.results || []).map(i => ({
    title: i.title || 'ANÚNCIO',
    price: Number(i.price || 0),
    condition: i.condition || '',
    permalink: i.permalink || '',
    fonte: 'Mercado Livre',
    metodo: 'api'
  })).filter(i => Number.isFinite(i.price) && i.price > 0);
}

async function mercadoLivreHtmlSearch(q, limit) {
  const slug = slugifyMercadoLivre(q);
  const url = `https://lista.mercadolivre.com.br/${encodeURIComponent(slug)}`;
  const r = await fetch(url, {
    headers: getBrowserHeaders({
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Referer': 'https://www.mercadolivre.com.br/'
    })
  });
  if (!r.ok) throw new Error(`Mercado Livre HTML HTTP ${r.status}`);
  const html = await r.text();
  const itens = [];
  const blocks = html.split('ui-search-layout__item').slice(1, limit + 1);
  for (const block of blocks) {
    const titleMatch = block.match(/(?:ui-search-item__title|poly-component__title)[^>]*>([\s\S]*?)<\/[^>]+>/i) || block.match(/title="([^"]{8,180})"/i);
    const fracMatch = block.match(/andes-money-amount__fraction[^>]*>([\d\.]+)<\/span>/i);
    const centsMatch = block.match(/andes-money-amount__cents[^>]*>(\d{2})<\/span>/i);
    const linkMatch = block.match(/href="(https:\/\/produto\.mercadolivre\.com\.br[^"]+)"/i) || block.match(/href="(https:\/\/www\.mercadolivre\.com\.br[^"]+)"/i);
    if (!titleMatch || !fracMatch) continue;
    const title = cleanSnippet(titleMatch[1] || titleMatch[0]);
    const price = moneyToNumber(`${fracMatch[1]},${centsMatch ? centsMatch[1] : '00'}`);
    if (title && price > 0) itens.push({
      title,
      price,
      condition: '',
      permalink: linkMatch ? linkMatch[1].replace(/&amp;/g, '&') : url,
      fonte: 'Mercado Livre',
      metodo: 'html'
    });
  }
  return itens;
}

async function mercadoLivreViaDuckDuckGo(q, limit) {
  const raw = await duckDuckGoSearch(`site:mercadolivre.com.br ${q} R$`);
  const itens = [];
  for (const item of raw.slice(0, limit)) {
    const text = `${item.title} ${item.snippet}`;
    const priceMatch = text.match(/R\$\s*([\d\.]+,\d{2}|[\d\.]+)/i);
    const price = priceMatch ? moneyToNumber(priceMatch[1]) : 0;
    if (price > 0) itens.push({
      title: item.title,
      price,
      condition: '',
      permalink: item.link,
      fonte: 'Mercado Livre via busca',
      metodo: 'duckduckgo'
    });
  }
  return itens;
}

function uniqByTitlePrice(items) {
  const seen = new Set();
  return items.filter(i => {
    const key = `${normalize(i.title).slice(0, 80)}|${Math.round(i.price)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

app.get('/', (req, res) => {
  res.json({
    ok: true,
    nome: 'Servidor técnico Alampe',
    rotas: ['/api/health', '/api/mercadolivre?q=farol%20gol%20g6', '/api/aplicacao?q=farol%20gol%20g6']
  });
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, googleCse: Boolean(GOOGLE_API_KEY && GOOGLE_CSE_ID), serpApi: Boolean(SERPAPI_KEY), fallbackDuckDuckGo: true });
});

app.get('/api/aplicacao', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.status(400).json({ erro: 'Informe a peça para pesquisar.' });

    let raw = [];
    let metodo = '';
    try { raw = await googleCseSearch(q); metodo = raw.length ? 'google_cse' : ''; } catch (e) { console.warn(e.message); }
    if (!raw.length) {
      try { raw = await serpApiSearch(q); metodo = raw.length ? 'serpapi' : ''; } catch (e) { console.warn(e.message); }
    }
    if (!raw.length) {
      try { raw = await duckDuckGoSearch(q); metodo = raw.length ? 'duckduckgo_fallback' : ''; } catch (e) { console.warn(e.message); }
    }

    if (!raw.length) {
      return res.status(503).json({
        erro: 'Não foi possível consultar fontes externas agora. Configure GOOGLE_API_KEY + GOOGLE_CSE_ID ou SERPAPI_KEY para busca técnica mais estável.'
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

    res.json({ consulta: q, metodo, resultados });
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: e.message || 'Erro na busca técnica.' });
  }
});

app.get('/api/mercadolivre', async (req, res) => {
  const erros = [];
  try {
    const q = String(req.query.q || '').trim();
    const limit = Math.min(Number(req.query.limit || 50), 50);
    if (!q) return res.status(400).json({ erro: 'Informe a peça.' });

    let itens = [];
    try { itens = await mercadoLivreApiSearch(q, limit); } catch (e) { erros.push(e.message); console.warn(e.message); }
    if (!itens.length) {
      try { itens = await mercadoLivreHtmlSearch(q, limit); } catch (e) { erros.push(e.message); console.warn(e.message); }
    }
    if (!itens.length) {
      try { itens = await mercadoLivreViaDuckDuckGo(q, Math.min(limit, 15)); } catch (e) { erros.push(e.message); console.warn(e.message); }
    }

    itens = uniqByTitlePrice(itens).slice(0, limit);

    if (!itens.length) {
      return res.status(502).json({
        erro: 'Mercado Livre bloqueou a consulta automática neste momento. Use o modo manual como reserva.',
        detalhes: erros
      });
    }

    res.json({ consulta: q, itens, avisos: erros.length ? erros : undefined });
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: e.message || 'Erro ao consultar Mercado Livre.' });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor técnico Alampe rodando na porta ${PORT}`);
});
