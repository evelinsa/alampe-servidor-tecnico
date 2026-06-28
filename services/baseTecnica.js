const fs = require('fs');
const path = require('path');
const { normalizarTexto, tokens, extrairAnos, detectarLado, detectarPosicao, detectarPeca, faixaAnos, slug } = require('../utils/normalizar');

const aplicacoesPath = path.join(__dirname, '..', 'banco', 'aplicacoes.json');

function lerAplicacoes() {
  try { return JSON.parse(fs.readFileSync(aplicacoesPath, 'utf8') || '[]'); } catch { return []; }
}

function salvarAplicacoes(lista) {
  fs.writeFileSync(aplicacoesPath, JSON.stringify(lista, null, 2));
}

function contemFrase(q, valor) {
  const n = normalizarTexto(valor);
  return n && q.includes(n);
}

function intersecao(a = [], b = []) {
  const set = new Set(a);
  return b.filter(x => set.has(x));
}

function termosTecnicosIgnorar() {
  return new Set([
    'DE','DA','DO','DAS','DOS','PARA','COM','SEM','E','A','O','AS','OS',
    'NOVO','NOVA','USADO','USADA','RECUPERADO','RECUPERADA',
    'DIREITO','DIREITA','ESQUERDO','ESQUERDA','PAR','DIANTEIRO','DIANTEIRA','TRASEIRO','TRASEIRA',
    'FAROL','LANTERNA','PARACHOQUE','PÃRA-CHOQUE','PARALAMA','PÃRA-LAMA','CAPO','CAPÃ”','RADIADOR',
    'RETROVISOR','GRADE','PAINEL','ALMA','CONDENSADOR','VENTOINHA','CARTER','CÃRTER','PORTA',
    'MOTOR','CAMBIO','CÃ‚MBIO','MANUAL','AUTOMATICO','AUTOMÃTICO','FLEX','GASOLINA','DIESEL'
  ]);
}

function extrairTermosVeiculo(query) {
  const q = normalizarTexto(query);
  const anos = extrairAnos(q).map(String);
  const ignorar = termosTecnicosIgnorar();
  return tokens(q)
    .filter(t => t.length >= 2)
    .filter(t => !anos.includes(t))
    .filter(t => !ignorar.has(t));
}

function coletarTermosModelos(app) {
  const out = new Set();
  for (const modelo of app.modelos || []) {
    for (const t of tokens(normalizarTexto(modelo))) {
      if (t.length >= 2) out.add(t);
    }
  }
  for (const marca of app.marcas || []) {
    for (const t of tokens(normalizarTexto(marca))) {
      if (t.length >= 2) out.add(t);
    }
  }
  return [...out];
}

function pontuarAplicacao(query, app) {
  const q = normalizarTexto(query);
  const qt = tokens(q);
  const anosQuery = extrairAnos(q);
  const ladoQuery = detectarLado(q);
  const posQuery = detectarPosicao(q);
  const pecaQuery = detectarPeca(q);
  const termosVeiculo = extrairTermosVeiculo(q);
  const termosApp = coletarTermosModelos(app);

  let score = 0;
  const motivos = [];

  let acertouPeca = false;
  for (const peca of app.pecas || []) {
    const np = normalizarTexto(peca);
    if (np && q.includes(np)) {
      score += 28;
      motivos.push(`PeÃ§a identificada: ${peca}`);
      acertouPeca = true;
      break;
    }
  }

  if (pecaQuery && !acertouPeca) {
    score -= 45;
    motivos.push('PeÃ§a pesquisada nÃ£o bate com esta aplicaÃ§Ã£o');
  }

  let melhorModelo = '';
  let melhorHits = 0;
  let modeloExato = false;

  for (const modelo of app.modelos || []) {
    const nm = normalizarTexto(modelo);
    const partes = tokens(nm);
    if (!partes.length) continue;

    if (contemFrase(q, modelo)) {
      score += 48;
      melhorModelo = modelo;
      melhorHits = partes.length;
      modeloExato = true;
      motivos.push(`Modelo identificado: ${modelo}`);
      break;
    }

    const hits = intersecao(partes, qt).length;
    if (hits > melhorHits) {
      melhorHits = hits;
      melhorModelo = modelo;
    }
  }

  if (!modeloExato && melhorHits > 0) {
    const modeloTokens = tokens(normalizarTexto(melhorModelo));
    const proporcao = modeloTokens.length ? melhorHits / modeloTokens.length : 0;
    if (proporcao >= 0.8) {
      score += 34;
      motivos.push(`Modelo aproximado: ${melhorModelo}`);
    } else {
      score += Math.min(18, melhorHits * 7);
      motivos.push(`Termos compatÃ­veis com modelo: ${melhorHits}`);
    }
  }

  const termosVeiculoReconhecidos = intersecao(termosVeiculo, termosApp);
  const termosVeiculoDesconhecidos = termosVeiculo.filter(t => !termosApp.includes(t));

  if (termosVeiculo.length) {
    if (termosVeiculoReconhecidos.length) {
      score += Math.min(18, termosVeiculoReconhecidos.length * 8);
      motivos.push(`Termos do veÃ­culo reconhecidos: ${termosVeiculoReconhecidos.join(', ')}`);
    }

    if (termosVeiculoDesconhecidos.length) {
      const penalidade = termosVeiculoDesconhecidos.length * 22;
      score -= penalidade;
      motivos.push(`Termos do veÃ­culo nÃ£o batem: ${termosVeiculoDesconhecidos.join(', ')}`);
    }
  }

  for (const marca of app.marcas || []) {
    if (contemFrase(q, marca)) {
      score += 14;
      motivos.push(`Marca: ${marca}`);
      break;
    }
  }

  if (anosQuery.length) {
    const matchAno = anosQuery.some(a => (app.anos || []).includes(a));
    if (matchAno) {
      score += 12;
      motivos.push(`Ano compatÃ­vel: ${anosQuery.join(', ')}`);
    } else {
      score -= 30;
      motivos.push(`Ano fora da faixa conhecida (${faixaAnos(app.anos)})`);
    }
  }

  if (ladoQuery) {
    const lados = app.lados || [];
    if (lados.includes(ladoQuery) || (ladoQuery === 'PAR' && lados.filter(l => l !== 'N/D').length >= 2)) {
      score += 5;
      motivos.push(`Lado compatÃ­vel: ${ladoQuery}`);
    } else score -= 8;
  }

  if (posQuery) {
    if ((app.posicoes || []).includes(posQuery)) {
      score += 4;
      motivos.push(`PosiÃ§Ã£o compatÃ­vel: ${posQuery}`);
    } else score -= 6;
  }

  if (termosVeiculo.length && !termosVeiculoReconhecidos.length) {
    score -= 28;
    motivos.push('Nenhum termo do veÃ­culo pesquisado bateu com esta aplicaÃ§Ã£o');
  }

  if (acertouPeca && (modeloExato || termosVeiculoReconhecidos.length >= 1)) {
    score += Math.round((app.confiancaBase || 75) * 0.05);
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, motivos, melhorModelo: modeloExato || melhorHits ? melhorModelo : '' };
}

function buscarBaseTecnica(query, limite = 8) {
  const aplicacoes = lerAplicacoes();
  const resultados = aplicacoes
    .map(app => {
      const p = pontuarAplicacao(query, app);
      return { ...app, score: p.score, motivos: p.motivos, melhorModelo: p.melhorModelo };
    })
    .filter(r => r.score >= 55)
    .sort((a, b) => b.score - a.score)
    .slice(0, limite);
  return resultados;
}

function sugestoesCadastro(query) {
  const q = normalizarTexto(query);
  const peca = detectarPeca(q);
  const anos = extrairAnos(q);
  const lado = detectarLado(q);
  const posicao = detectarPosicao(q);
  const t = tokens(q).filter(x => ![peca, lado, posicao, ...anos.map(String)].includes(x));
  return { peca, anos, lado, posicao, termosRestantes: t };
}

function temFaixaAnoNoTexto(valor = '') {
  return /\(?\b(19|20)\d{2}\s*[-/]\s*(19|20)\d{2}\b\)?/.test(String(valor || ''));
}

function primeiroValor(lista = []) {
  return Array.isArray(lista) && lista.length ? lista[0] : '';
}

function limparModeloParaExibir(modelo = '') {
  return String(modelo || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function modeloPrincipal(app) {
  return limparModeloParaExibir(app.melhorModelo || primeiroValor(app.modelos) || '');
}

function marcaPrincipal(app) {
  return limparModeloParaExibir(primeiroValor(app.marcas) || '');
}

function faixaAnosExibicao(app) {
  const f = faixaAnos(app.anos || []);
  return f ? `(${f})` : '';
}

function modeloComMarcaEAno(app) {
  const marca = marcaPrincipal(app);
  const modelo = modeloPrincipal(app);
  const faixa = faixaAnosExibicao(app);

  let base = [marca, modelo].filter(Boolean).join(' ').trim();

  if (!base) base = modelo || marca || '';

  const modeloJaTemMarca = marca && modelo && modelo.startsWith(marca + ' ');
  if (modeloJaTemMarca) base = modelo;

  if (base && faixa && !temFaixaAnoNoTexto(base)) base = `${base} ${faixa}`;

  return base.replace(/\s+/g, ' ').trim();
}

function tituloComPeca(app) {
  const peca = limparModeloParaExibir(primeiroValor(app.pecas) || 'PEÃ‡A');
  const aplicacao = modeloComMarcaEAno(app);
  return [peca, aplicacao].filter(Boolean).join(' ').trim();
}


function montarResposta(query, resultados, version = '4.4.5-visual-aplicacao') {
  const melhor = resultados[0] || null;
  if (!melhor) {
    const sugestao = sugestoesCadastro(query);
    return {
      ok: true,
      version,
      query,
      origem: 'base-tecnica-alampe',
      cache: false,
      encontrou: false,
      resumo: { peca: sugestao.peca || '', marca: '', veiculo: '', anos: sugestao.anos || [], lados: sugestao.lado ? [sugestao.lado] : [], confianca: 'baixa', score: 0 },
      aplicacoes: [],
      lados: sugestao.lado ? [sugestao.lado] : [],
      fabricantes: [],
      relacionadas: [],
      observacoes: ['Nenhuma aplicaÃ§Ã£o encontrada com confianÃ§a suficiente na base tÃ©cnica Alampe.', 'SugestÃ£o: cadastre esta aplicaÃ§Ã£o na base para ela ficar disponÃ­vel para todos.'],
      sugestaoCadastro: sugestao,
      resultados: []
    };
  }

  const confianca = melhor.score >= 82 ? 'alta' : melhor.score >= 65 ? 'media' : 'baixa';
  return {
    ok: true,
    version,
    query,
    origem: 'base-tecnica-alampe',
    cache: false,
    encontrou: true,
    resumo: {
      peca: (melhor.pecas || [])[0] || '',
      marca: (melhor.marcas || [])[0] || '',
      veiculo: melhor.melhorModelo || (melhor.modelos || [])[0] || '',
      anos: melhor.anos || [],
      lados: melhor.lados || [],
      posicoes: melhor.posicoes || [],
      lampadas: melhor.lampadas || {},
      confianca,
      score: melhor.score
    },
    aplicacoes: resultados.map(r => modeloComMarcaEAno(r)),
    lados: melhor.lados || [],
    fabricantes: melhor.fabricantes || [],
    relacionadas: melhor.relacionadas || [],
    observacoes: melhor.observacoes || [],
    resultados: resultados.map(r => ({
      titulo: tituloComPeca(r),
      aplicacao: modeloComMarcaEAno(r),
      anos: r.anos || [],
      lados: r.lados || [],
      posicoes: r.posicoes || [],
      lampadas: r.lampadas || {},
      fabricantes: r.fabricantes || [],
      relacionadas: r.relacionadas || [],
      score: r.score,
      motivos: r.motivos || [],
      fonte: 'Base TÃ©cnica Alampe'
    }))
  };
}

function adicionarAplicacao(dados) {
  const lista = lerAplicacoes();
  const pecaBase = (dados.pecas || ['PECA'])[0];
  const modeloBase = (dados.modelos || ['MODELO'])[0];
  const id = slug(dados.id || `${pecaBase} ${modeloBase} ${faixaAnos(dados.anos || [])}`);
  const novo = {
    id,
    pecas: dados.pecas || [],
    marcas: dados.marcas || [],
    modelos: dados.modelos || [],
    anos: (dados.anos || []).map(Number).filter(Boolean),
    lados: dados.lados || ['N/D'],
    posicoes: dados.posicoes || ['N/D'],
    lampadas: dados.lampadas || {},
    fabricantes: dados.fabricantes || [],
    relacionadas: dados.relacionadas || [],
    observacoes: dados.observacoes || [],
    confiancaBase: Number(dados.confiancaBase || 80),
    atualizadoEm: new Date().toISOString()
  };
  const idx = lista.findIndex(x => x.id === id);
  if (idx >= 0) lista[idx] = { ...lista[idx], ...novo };
  else lista.push(novo);
  salvarAplicacoes(lista);
  return novo;
}

function importarAplicacoes(lista = []) {
  if (!Array.isArray(lista)) throw new Error('Envie uma lista de aplicaÃ§Ãµes.');
  const salvos = [];
  for (const item of lista) salvos.push(adicionarAplicacao(item));
  return salvos;
}

module.exports = { lerAplicacoes, buscarBaseTecnica, montarResposta, adicionarAplicacao, importarAplicacoes, sugestoesCadastro };
