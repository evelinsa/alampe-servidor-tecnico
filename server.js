const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const VERSION = '3.0.0-alampe-tecnico';

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '1mb' }));

const cache = new Map();
const CACHE_TTL = 1000 * 60 * 60 * 24 * 7; // 7 dias

function nowIso(){ return new Date().toISOString(); }
function cleanText(v){ return String(v || '').replace(/\s+/g, ' ').trim(); }
function normalize(v){
  return cleanText(v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function cacheKey(prefix, q){ return `${prefix}:${normalize(q)}`; }
function getCache(key){
  const item = cache.get(key);
  if(!item) return null;
  if(Date.now() - item.createdAt > CACHE_TTL){ cache.delete(key); return null; }
  return item.value;
}
function setCache(key, value){ cache.set(key, { createdAt: Date.now(), value }); }

function detectarTermos(q){
  const n = normalize(q);
  const pecas = [
    'farol','lanterna','parachoque','para choque','paralama','para lama','capo','radiador','condensador','ventoinha','retrovisor','porta','tampa','grade','painel','alma','travessa','suporte','motor','cambio','câmbio','compressor','alternador','arranque','carter','cárter','moldura','pisca','milha','farol de milha','maçaneta','macaneta','vidro','máquina de vidro','maquina de vidro'
  ];
  const marcas = ['chevrolet','gm','volkswagen','vw','fiat','ford','renault','peugeot','citroen','toyota','honda','hyundai','kia','nissan','mitsubishi','jeep','caoa','chery','jac'];
  const lados = [];
  if(/\b(ld|direito|direita)\b/.test(n)) lados.push('DIREITO');
  if(/\b(le|esquerdo|esquerda)\b/.test(n)) lados.push('ESQUERDO');
  if(/\b(par|o par|ambos)\b/.test(n)) lados.push('PAR');
  const anos = Array.from(new Set((n.match(/\b(19\d{2}|20\d{2})\b/g) || [])));
  const peca = pecas.find(p => n.includes(p));
  const marca = marcas.find(m => n.includes(m));
  const veiculoPossivel = cleanText(q)
    .replace(new RegExp(pecas.join('|'), 'ig'), ' ')
    .replace(/\b(19\d{2}|20\d{2})\b/g, ' ')
    .replace(/\b(ld|le|direito|direita|esquerdo|esquerda|par|o par|novo|usado|recuperado)\b/ig, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return {
    peca: peca ? peca.toUpperCase().replace('PARACHOQUE','PARA-CHOQUE').replace('PARALAMA','PARA-LAMA') : '',
    marca: marca ? marca.toUpperCase() : '',
    anos,
    lados,
    veiculoPossivel
  };
}

function htmlDecode(str){
  return String(str || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 9000){
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try{
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AlampeERP/3.0',
        'accept-language': 'pt-BR,pt;q=0.9,en;q=0.7',
        ...(options.headers || {})
      }
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function buscarDuckDuckGo(q){
  const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(q + ' autopeças aplicação compatível')}`;
  const res = await fetchWithTimeout(url, {}, 10000);
  if(!res.ok) throw new Error(`DuckDuckGo HTTP ${res.status}`);
  const html = await res.text();
  const results = [];
  const regex = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while((match = regex.exec(html)) && results.length < 8){
    const title = htmlDecode(match[2].replace(/<[^>]+>/g, ' '));
    const snippet = htmlDecode(match[3].replace(/<[^>]+>/g, ' '));
    let link = htmlDecode(match[1]);
    const uddg = link.match(/[?&]uddg=([^&]+)/);
    if(uddg) link = decodeURIComponent(uddg[1]);
    results.push({ title: cleanText(title), snippet: cleanText(snippet), link, fonte: 'DuckDuckGo' });
  }
  return results;
}

async function buscarGoogleCse(q){
  const key = process.env.GOOGLE_API_KEY;
  const cx = process.env.GOOGLE_CSE_ID;
  if(!key || !cx) return [];
  const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(key)}&cx=${encodeURIComponent(cx)}&q=${encodeURIComponent(q + ' autopeças aplicação compatível')}&num=8&hl=pt-BR&gl=br`;
  const res = await fetchWithTimeout(url, {}, 10000);
  if(!res.ok) throw new Error(`Google CSE HTTP ${res.status}`);
  const data = await res.json();
  return (data.items || []).slice(0,8).map(i => ({ title: cleanText(i.title), snippet: cleanText(i.snippet), link: i.link, fonte: 'Google CSE' }));
}

async function buscarWikipediaContexto(q){
  // Não substitui catálogo, mas ajuda a dar contexto quando outras fontes falham.
  const termos = detectarTermos(q);
  const termo = termos.veiculoPossivel || q;
  const url = `https://pt.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(termo)}`;
  try{
    const res = await fetchWithTimeout(url, {}, 6000);
    if(!res.ok) return [];
    const data = await res.json();
    if(!data.extract) return [];
    return [{ title: data.title || termo, snippet: data.extract, link: data.content_urls?.desktop?.page || '', fonte: 'Contexto público' }];
  }catch(e){ return []; }
}

function dedupeResults(items){
  const seen = new Set();
  const out = [];
  for(const it of items){
    const key = normalize((it.title || '') + '|' + (it.link || ''));
    if(!key || seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

function pontuarResultado(item, termos){
  const texto = normalize(`${item.title} ${item.snippet}`);
  let score = 10;
  if(termos.peca && texto.includes(normalize(termos.peca))) score += 25;
  if(termos.veiculoPossivel && normalize(termos.veiculoPossivel).split(' ').some(t => t.length > 2 && texto.includes(t))) score += 20;
  for(const ano of termos.anos){ if(texto.includes(ano)) score += 12; }
  if(/autope[cç]as|pe[cç]a|aplica[cç][aã]o|compat[ií]vel|serve|produto/i.test(`${item.title} ${item.snippet}`)) score += 15;
  if(/mercadolivre|pecas|autopecas|catalogo|produto|loja/i.test(item.link || '')) score += 8;
  return Math.min(99, score);
}

function montarResposta(q, rawResults, cacheHit=false){
  const termos = detectarTermos(q);
  const results = dedupeResults(rawResults)
    .map(r => ({ ...r, score: pontuarResultado(r, termos) }))
    .sort((a,b) => b.score - a.score)
    .slice(0, 8);

  const melhorScore = results[0]?.score || 0;
  const confianca = melhorScore >= 70 ? 'alta' : melhorScore >= 45 ? 'media' : results.length ? 'baixa' : 'sem_resultado';

  const aplicacoes = [];
  if(termos.veiculoPossivel) aplicacoes.push(termos.veiculoPossivel.toUpperCase());
  if(termos.anos.length) aplicacoes.push(`ANO(S): ${termos.anos.join(', ')}`);
  const lados = termos.lados.length ? termos.lados : [];
  const observacoes = [];
  if(!results.length) observacoes.push('Nenhum resultado técnico confiável foi encontrado nas fontes públicas consultadas.');
  if(confianca === 'baixa') observacoes.push('Confiança baixa: confirme aplicação, ano, lado e versão do veículo antes da venda.');
  if(confianca === 'media') observacoes.push('Confiança média: confira detalhes do veículo antes de concluir a venda.');
  if(confianca === 'alta') observacoes.push('Resultados encontrados com boa correspondência textual. Ainda assim, confirme versão e lado quando necessário.');

  return {
    ok: true,
    version: VERSION,
    query: q,
    cache: cacheHit,
    atualizadoEm: nowIso(),
    resumo: {
      peca: termos.peca || cleanText(q).toUpperCase(),
      veiculo: termos.veiculoPossivel ? termos.veiculoPossivel.toUpperCase() : '',
      marca: termos.marca,
      anos: termos.anos,
      lados,
      confianca,
      score: melhorScore
    },
    aplicacoes,
    lados,
    fabricantes: extrairFabricantes(results),
    observacoes,
    resultados: results,
    fontes: Array.from(new Set(results.map(r => r.fonte))).filter(Boolean)
  };
}

function extrairFabricantes(results){
  const nomes = ['ARTEB','VALEO','ORGUS','CIBIE','MAGNETI MARELLI','TYC','IMPORTADO','ORIGINAL','GM','VOLKSWAGEN','FIAT','FORD','RENAULT','HYUNDAI','TOYOTA','HONDA'];
  const texto = normalize(results.map(r => `${r.title} ${r.snippet}`).join(' '));
  return nomes.filter(n => texto.includes(normalize(n))).slice(0, 8);
}

async function buscarAplicacao(q){
  const all = [];
  const errors = [];

  try { all.push(...await buscarGoogleCse(q)); } catch(e){ errors.push(`Google: ${e.message}`); }
  try { all.push(...await buscarDuckDuckGo(q)); } catch(e){ errors.push(`DuckDuckGo: ${e.message}`); }
  if(!all.length){
    try { all.push(...await buscarWikipediaContexto(q)); } catch(e){ errors.push(`Contexto: ${e.message}`); }
  }

  const resposta = montarResposta(q, all, false);
  resposta.debug = { errors };
  return resposta;
}

app.get('/', (req, res) => {
  res.json({
    ok: true,
    nome: 'Alampe Servidor Técnico',
    version: VERSION,
    rotas: ['/api/health', '/api/aplicacao?q=farol%20classic%202005', '/api/mercadolivre?q=farol%20classic%202005'],
    cache: cache.size,
    atualizadoEm: nowIso()
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    version: VERSION,
    googleCse: !!(process.env.GOOGLE_API_KEY && process.env.GOOGLE_CSE_ID),
    buscaPublica: true,
    cacheItens: cache.size,
    uptime: process.uptime(),
    atualizadoEm: nowIso()
  });
});

app.get('/api/aplicacao', async (req, res) => {
  const q = cleanText(req.query.q || req.query.query || req.query.termo || '');
  if(!q) return res.status(400).json({ ok:false, erro:'Informe a pesquisa em ?q=' });

  const key = cacheKey('aplicacao', q);
  const cached = getCache(key);
  if(cached) return res.json({ ...cached, cache: true });

  try{
    const resposta = await buscarAplicacao(q);
    setCache(key, resposta);
    res.json(resposta);
  }catch(e){
    res.json({
      ok: true,
      version: VERSION,
      query: q,
      cache: false,
      resumo: { peca: q.toUpperCase(), confianca: 'sem_resultado', score: 0 },
      aplicacoes: [],
      lados: [],
      fabricantes: [],
      observacoes: ['A busca técnica não conseguiu consultar as fontes públicas neste momento. Tente novamente em alguns segundos.'],
      resultados: [],
      fontes: [],
      debug: { erro: e.message }
    });
  }
});

app.get('/api/mercadolivre', async (req, res) => {
  const q = cleanText(req.query.q || req.query.query || req.query.termo || '');
  if(!q) return res.status(400).json({ ok:false, erro:'Informe a pesquisa em ?q=' });
  const key = cacheKey('ml', q);
  const cached = getCache(key);
  if(cached) return res.json({ ...cached, cache: true });
  try{
    const results = await buscarDuckDuckGo(`${q} site:mercadolivre.com.br`);
    const resposta = {
      ok: true,
      version: VERSION,
      query: q,
      cache: false,
      atualizadoEm: nowIso(),
      resultados: results.slice(0, 10),
      fontes: ['DuckDuckGo/Mercado Livre']
    };
    setCache(key, resposta);
    res.json(resposta);
  }catch(e){
    res.json({ ok:true, version:VERSION, query:q, resultados:[], fontes:[], observacoes:['Não foi possível consultar Mercado Livre agora.'], debug:{ erro:e.message } });
  }
});

app.use((req, res) => {
  res.status(404).json({ ok:false, erro:'Rota não encontrada', path:req.path, rotas:['/api/health','/api/aplicacao?q=...','/api/mercadolivre?q=...'] });
});

app.listen(PORT, () => {
  console.log(`Alampe Servidor Técnico ${VERSION} rodando na porta ${PORT}`);
});
