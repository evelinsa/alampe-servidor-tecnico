const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 10000;
const VERSION = '3.5.0-alampe-tecnico';

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '1mb' }));

const CACHE = new Map();
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7;

const PECA_ALIASES = {
  'paralama': ['paralama', 'para lama', 'pára-lama', 'paralamas'],
  'parachoque': ['parachoque', 'para choque', 'pára-choque', 'parachoques'],
  'farol': ['farol', 'farois', 'faróis'],
  'lanterna': ['lanterna', 'lanternas'],
  'capo': ['capo', 'capô'],
  'grade': ['grade', 'grade dianteira'],
  'retrovisor': ['retrovisor', 'espelho retrovisor'],
  'porta': ['porta'],
  'radiador': ['radiador'],
  'condensador': ['condensador'],
  'ventoinha': ['ventoinha'],
  'painel': ['painel frontal', 'painel dianteiro', 'painel'],
  'alma': ['alma', 'alma do parachoque', 'reforco parachoque', 'reforço parachoque'],
};

const STOPWORDS = new Set(['de','do','da','dos','das','para','par','novo','usado','original','peca','peça','autopecas','autopeças']);
const BAD_URL_PARTS = ['/lista/', '/search', '/busca', '/catalogsearch', '/s?'];
const BAD_DOMAINS = ['wikipedia.org', 'facebook.com', 'instagram.com', 'youtube.com', 'tiktok.com', 'pinterest.', 'olx.com.br'];
const GOOD_DOMAINS = ['autopecas', 'autoglass', 'mercadolivre', 'connectparts', 'jocar', 'nocautoparts', 'hipervarejo', 'allparts', 'riodoparts', 'lojadomecanico', 'encontracarros'];

function semAcento(str='') {
  return String(str).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function norm(str='') {
  return semAcento(String(str).toLowerCase()).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}
function title(str='') {
  return String(str || '').trim().replace(/\s+/g, ' ').toUpperCase();
}
function getCache(key) {
  const item = CACHE.get(key);
  if (!item) return null;
  if (Date.now() - item.ts > CACHE_TTL_MS) { CACHE.delete(key); return null; }
  return item.data;
}
function setCache(key, data) { CACHE.set(key, { ts: Date.now(), data }); }

function detectarPeca(queryNorm) {
  for (const [peca, aliases] of Object.entries(PECA_ALIASES)) {
    if (aliases.some(a => queryNorm.includes(norm(a)))) return peca.toUpperCase();
  }
  const tokens = queryNorm.split(' ').filter(t => t.length > 2 && !STOPWORDS.has(t));
  return tokens[0] ? tokens[0].toUpperCase() : '';
}
function detectarAnos(queryNorm) {
  const anos = [];
  const matches = queryNorm.match(/\b(19[8-9][0-9]|20[0-3][0-9])\b/g) || [];
  for (const a of matches) if (!anos.includes(a)) anos.push(a);
  return anos;
}
function detectarLados(textNorm) {
  const lados = [];
  if (/\bdireit[oa]\b|\bld\b|\blado direito\b/.test(textNorm)) lados.push('DIREITO');
  if (/\besquerd[oa]\b|\ble\b|\blado esquerdo\b/.test(textNorm)) lados.push('ESQUERDO');
  if (/\bpar\b|\bo par\b|\besquerdo direito\b|\bdireito esquerdo\b/.test(textNorm)) lados.push('PAR');
  return [...new Set(lados)];
}
function detectarVeiculo(queryNorm, peca, anos) {
  const pecaTokens = norm(peca).split(' ');
  const anoSet = new Set(anos);
  const tokens = queryNorm.split(' ').filter(t => !STOPWORDS.has(t) && !pecaTokens.includes(t) && !anoSet.has(t));
  const limpa = tokens.join(' ').trim();
  return limpa ? title(limpa) : '';
}

function montarConsultas(info) {
  const base = [info.peca, info.veiculo, ...info.anos].filter(Boolean).join(' ');
  const queries = [
    `${base} aplicação lado direito esquerdo`,
    `${base} autopeças aplicação`,
    `${base} produto autopeças`,
    `${base} mercadolivre peça`,
  ];
  return [...new Set(queries.map(q => q.trim()).filter(Boolean))];
}

async function buscarDuckDuckGo(q) {
  const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 AlampeBot/3.5' }, timeout: 12000 });
  if (!res.ok) throw new Error(`DuckDuckGo HTTP ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);
  const itens = [];
  $('.result').each((_, el) => {
    const a = $(el).find('.result__a').first();
    const t = a.text().trim();
    let link = a.attr('href') || '';
    const snippet = $(el).find('.result__snippet').text().trim();
    if (link.includes('uddg=')) {
      try { link = decodeURIComponent(new URL(link, 'https://duckduckgo.com').searchParams.get('uddg') || link); } catch(e) {}
    }
    if (t && link) itens.push({ title: t, link, snippet, fonte: 'DuckDuckGo' });
  });
  return itens;
}

function isBadResult(r) {
  const u = norm(r.link || '');
  const t = norm(`${r.title || ''} ${r.snippet || ''}`);
  if (!r.link) return true;
  if (BAD_DOMAINS.some(d => u.includes(d))) return true;
  if (BAD_URL_PARTS.some(p => u.includes(p))) return true;
  if (t.length < 8) return true;
  return false;
}
function scoreResult(r, info) {
  const text = norm(`${r.title} ${r.snippet} ${r.link}`);
  let score = 0;
  const pecaN = norm(info.peca);
  const veicN = norm(info.veiculo);
  if (pecaN && text.includes(pecaN)) score += 35;
  if (veicN && veicN.split(' ').every(tok => text.includes(tok))) score += 35;
  for (const ano of info.anos) if (text.includes(ano)) score += 15;
  if (GOOD_DOMAINS.some(d => text.includes(d))) score += 12;
  if (/direit|esquerd|lado|par/.test(text)) score += 8;
  if (/aplicacao|aplicação|compat/i.test(text)) score += 8;
  if (/produto|p\//.test(text)) score += 4;
  if (/lista|busca|search/.test(text)) score -= 25;
  if (/wikipedia|wiki/.test(text)) score -= 60;
  return score;
}
function dedupeResults(results) {
  const seen = new Set();
  const out = [];
  for (const r of results) {
    const key = norm((r.link || '').replace(/^https?:\/\/(www\.)?/, '').split('?')[0]).slice(0, 180);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}
function resumoAplicacao(info, results) {
  const textos = results.map(r => norm(`${r.title} ${r.snippet} ${r.link}`)).join(' ');
  const lados = [...new Set(results.flatMap(r => detectarLados(norm(`${r.title} ${r.snippet} ${r.link}`))))];
  const anos = [...new Set([...info.anos, ...((textos.match(/\b(19[8-9][0-9]|20[0-3][0-9])\b/g) || []))])].slice(0, 8);
  const fabricantes = [];
  ['arteb','valeo','orgus','imola','rld','tyc','depo','original','gm','ford','volkswagen','vw','fiat'].forEach(f => {
    if (textos.includes(f)) fabricantes.push(f.toUpperCase());
  });
  const confiancaScore = results[0]?.score || 0;
  const confianca = confiancaScore >= 75 ? 'alta' : confiancaScore >= 45 ? 'média' : 'baixa';
  return {
    peca: info.peca,
    veiculo: info.veiculo,
    marca: '',
    anos,
    lados,
    fabricantes: [...new Set(fabricantes)].slice(0, 8),
    confianca,
    score: confiancaScore,
    observacoes: [
      confianca === 'alta' ? 'Resultado com boa correspondência entre peça, veículo e ano.' : 'Confirme aplicação, ano, lado e versão do veículo antes da venda.',
      'A busca técnica usa fontes públicas como apoio e não substitui conferência pelo catálogo/fabricante.'
    ]
  };
}
function formatarResultados(raw, info) {
  let filtrados = raw.filter(r => !isBadResult(r));
  filtrados = filtrados.map(r => ({ ...r, score: scoreResult(r, info) }))
    .filter(r => r.score >= 20)
    .sort((a,b) => b.score - a.score);
  filtrados = dedupeResults(filtrados).slice(0, 8);
  return filtrados;
}

app.get('/', (req, res) => res.json({ ok: true, version: VERSION, mensagem: 'Alampe Servidor Técnico online' }));
app.get('/api/health', (req, res) => res.json({ ok: true, version: VERSION, buscaPublica: true, cacheItens: CACHE.size, atualizadoEm: new Date().toISOString() }));

app.get('/api/aplicacao', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'Informe q.' });
  const key = norm(q);
  const cached = getCache(key);
  if (cached) return res.json({ ...cached, cache: true });

  const queryNorm = norm(q);
  const anos = detectarAnos(queryNorm);
  const peca = detectarPeca(queryNorm);
  const veiculo = detectarVeiculo(queryNorm, peca, anos);
  const info = { peca, veiculo, anos };

  const erros = [];
  let raw = [];
  for (const consulta of montarConsultas(info)) {
    try {
      const r = await buscarDuckDuckGo(consulta);
      raw.push(...r);
      if (raw.length >= 18) break;
    } catch (e) {
      erros.push(e.message || String(e));
    }
  }

  const resultados = formatarResultados(raw, info);
  const resumo = resumoAplicacao(info, resultados);
  const fontes = [...new Set(resultados.map(r => r.fonte || 'Fonte pública'))];
  const payload = {
    ok: true,
    version: VERSION,
    query: q,
    cache: false,
    atualizadoEm: new Date().toISOString(),
    resumo,
    aplicacoes: [
      ...new Set([veiculo, ...anos.map(a => `ANO(S): ${a}`)].filter(Boolean))
    ],
    lados: resumo.lados,
    fabricantes: resumo.fabricantes,
    observacoes: resumo.observacoes,
    resultados: resultados.map(r => ({ title: r.title, snippet: r.snippet, link: r.link, fonte: r.fonte, score: r.score })),
    fontes,
    debug: { erros, brutos: raw.length, filtrados: resultados.length }
  };

  if (!resultados.length) {
    payload.resumo.confianca = 'baixa';
    payload.observacoes = ['Nenhum resultado técnico forte encontrado. Tente pesquisar com peça + veículo + ano + lado.'];
  }

  setCache(key, payload);
  res.json(payload);
});

app.get('/api/cache', (req, res) => res.json({ ok: true, itens: CACHE.size, version: VERSION }));

app.use((req, res) => res.status(404).json({ ok: false, error: 'Rota não encontrada', version: VERSION }));

app.listen(PORT, () => console.log(`Alampe Servidor Técnico ${VERSION} rodando na porta ${PORT}`));
