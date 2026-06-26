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

function pontuarAplicacao(query, app) {
  const q = normalizarTexto(query);
  const qt = tokens(q);
  const anosQuery = extrairAnos(q);
  const ladoQuery = detectarLado(q);
  const posQuery = detectarPosicao(q);
  const pecaQuery = detectarPeca(q);
  let score = 0;
  const motivos = [];

  let acertouPeca = false;
  for (const peca of app.pecas || []) {
    const np = normalizarTexto(peca);
    if (np && q.includes(np)) { score += 40; motivos.push(`Peça identificada: ${peca}`); acertouPeca = true; break; }
  }
  if (pecaQuery && !acertouPeca) score -= 18;

  let melhorModelo = '';
  let modeloHitsTotal = 0;
  for (const modelo of app.modelos || []) {
    const nm = normalizarTexto(modelo);
    const partes = tokens(nm);
    if (contemFrase(q, modelo)) { score += 40; melhorModelo = modelo; motivos.push(`Modelo identificado: ${modelo}`); break; }
    const hits = intersecao(partes, qt).length;
    modeloHitsTotal = Math.max(modeloHitsTotal, hits);
    if (hits && hits === partes.length) { score += 32; melhorModelo = modelo; motivos.push(`Modelo aproximado: ${modelo}`); break; }
    if (hits) score += Math.min(20, hits * 8);
  }
  if (!melhorModelo && modeloHitsTotal === 0 && qt.length >= 2) score -= 8;

  for (const marca of app.marcas || []) {
    if (contemFrase(q, marca)) { score += 8; motivos.push(`Marca: ${marca}`); break; }
  }

  if (anosQuery.length) {
    const matchAno = anosQuery.some(a => (app.anos || []).includes(a));
    if (matchAno) { score += 20; motivos.push(`Ano compatível: ${anosQuery.join(', ')}`); }
    else { score -= 35; motivos.push(`Ano fora da faixa conhecida (${faixaAnos(app.anos)})`); }
  }

  if (ladoQuery) {
    const lados = app.lados || [];
    if (lados.includes(ladoQuery) || (ladoQuery === 'PAR' && lados.filter(l => l !== 'N/D').length >= 2)) {
      score += 7;
      motivos.push(`Lado compatível: ${ladoQuery}`);
    } else score -= 6;
  }

  if (posQuery) {
    if ((app.posicoes || []).includes(posQuery)) { score += 5; motivos.push(`Posição compatível: ${posQuery}`); }
    else score -= 4;
  }

  if (score >= 72 && melhorModelo) score += Math.round((app.confiancaBase || 75) * 0.06);
  else score += Math.round((app.confiancaBase || 75) * 0.03);

  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, motivos, melhorModelo };
}

function buscarBaseTecnica(query, limite = 8) {
  const aplicacoes = lerAplicacoes();
  const resultados = aplicacoes
    .map(app => {
      const p = pontuarAplicacao(query, app);
      return { ...app, score: p.score, motivos: p.motivos, melhorModelo: p.melhorModelo };
    })
    .filter(r => r.score >= 35)
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

function montarResposta(query, resultados, version = '4.2.0-alampe-tecnico') {
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
      observacoes: ['Nenhuma aplicação encontrada na base técnica Alampe.', 'Sugestão: cadastre esta aplicação na base para ela ficar disponível para todos.'],
      sugestaoCadastro: sugestao,
      resultados: []
    };
  }

  const confianca = melhor.score >= 82 ? 'alta' : melhor.score >= 58 ? 'media' : 'baixa';
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
      confianca,
      score: melhor.score
    },
    aplicacoes: resultados.map(r => `${(r.pecas || [])[0] || 'PEÇA'} ${r.melhorModelo || (r.modelos || [])[0] || ''} ${faixaAnos(r.anos)}`.trim()),
    lados: melhor.lados || [],
    fabricantes: melhor.fabricantes || [],
    relacionadas: melhor.relacionadas || [],
    observacoes: melhor.observacoes || [],
    resultados: resultados.map(r => ({
      titulo: `${(r.pecas || [])[0] || 'PEÇA'} ${r.melhorModelo || (r.modelos || [])[0] || ''}`.trim(),
      aplicacao: `${(r.modelos || []).join(' / ')} ${faixaAnos(r.anos)}`.trim(),
      anos: r.anos || [],
      lados: r.lados || [],
      posicoes: r.posicoes || [],
      fabricantes: r.fabricantes || [],
      relacionadas: r.relacionadas || [],
      score: r.score,
      motivos: r.motivos || [],
      fonte: 'Base Técnica Alampe'
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
  if (!Array.isArray(lista)) throw new Error('Envie uma lista de aplicações.');
  const salvos = [];
  for (const item of lista) salvos.push(adicionarAplicacao(item));
  return salvos;
}

module.exports = { lerAplicacoes, buscarBaseTecnica, montarResposta, adicionarAplicacao, importarAplicacoes, sugestoesCadastro };
