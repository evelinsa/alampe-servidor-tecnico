const fs = require('fs');
const path = require('path');
const { normalizarTexto, tokens, extrairAnos, detectarLado, faixaAnos } = require('../utils/normalizar');

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

function pontuarAplicacao(query, app) {
  const q = normalizarTexto(query);
  const qt = tokens(q);
  const anosQuery = extrairAnos(q);
  const ladoQuery = detectarLado(q);
  let score = 0;
  const motivos = [];

  for (const peca of app.pecas || []) {
    const np = normalizarTexto(peca);
    if (q.includes(np)) { score += 38; motivos.push(`Peça identificada: ${peca}`); break; }
  }

  let melhorModelo = '';
  for (const modelo of app.modelos || []) {
    const nm = normalizarTexto(modelo);
    const partes = tokens(nm);
    if (contemFrase(q, modelo)) { score += 38; melhorModelo = modelo; motivos.push(`Modelo identificado: ${modelo}`); break; }
    const hits = partes.filter(t => qt.includes(t)).length;
    if (hits && hits === partes.length) { score += 30; melhorModelo = modelo; motivos.push(`Modelo aproximado: ${modelo}`); break; }
    if (hits) score += Math.min(18, hits * 7);
  }

  for (const marca of app.marcas || []) {
    if (contemFrase(q, marca)) { score += 8; motivos.push(`Marca: ${marca}`); break; }
  }

  if (anosQuery.length) {
    const matchAno = anosQuery.some(a => (app.anos || []).includes(a));
    if (matchAno) { score += 20; motivos.push(`Ano compatível: ${anosQuery.join(', ')}`); }
    else { score -= 30; motivos.push(`Ano fora da faixa conhecida (${faixaAnos(app.anos)})`); }
  }

  if (ladoQuery) {
    if ((app.lados || []).includes(ladoQuery) || (ladoQuery === 'PAR' && (app.lados || []).filter(l => l !== 'N/D').length >= 2)) {
      score += 6;
      motivos.push(`Lado compatível: ${ladoQuery}`);
    } else score -= 4;
  }

  // Bônus por consultas com peça + modelo claras
  if (score >= 70 && melhorModelo) score += Math.round((app.confiancaBase || 75) * 0.06);
  else score += Math.round((app.confiancaBase || 75) * 0.03);

  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, motivos };
}

function buscarBaseTecnica(query, limite = 8) {
  const aplicacoes = lerAplicacoes();
  return aplicacoes
    .map(app => {
      const p = pontuarAplicacao(query, app);
      return { ...app, score: p.score, motivos: p.motivos };
    })
    .filter(r => r.score >= 35)
    .sort((a, b) => b.score - a.score)
    .slice(0, limite);
}

function montarResposta(query, resultados, version = '4.1.0-alampe-tecnico') {
  const melhor = resultados[0] || null;
  if (!melhor) {
    return {
      ok: true,
      version,
      query,
      origem: 'base-tecnica-alampe',
      cache: false,
      encontrou: false,
      resumo: { peca: '', marca: '', veiculo: '', anos: [], lados: [], confianca: 'baixa', score: 0 },
      aplicacoes: [],
      lados: [],
      fabricantes: [],
      relacionadas: [],
      observacoes: ['Nenhuma aplicação encontrada na base técnica Alampe. Cadastre ou confirme manualmente.'],
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
      veiculo: (melhor.modelos || [])[0] || '',
      anos: melhor.anos || [],
      lados: melhor.lados || [],
      confianca,
      score: melhor.score
    },
    aplicacoes: resultados.map(r => `${(r.pecas || [])[0] || 'PEÇA'} ${(r.modelos || [])[0] || ''} ${faixaAnos(r.anos)}`.trim()),
    lados: melhor.lados || [],
    fabricantes: melhor.fabricantes || [],
    relacionadas: melhor.relacionadas || [],
    observacoes: melhor.observacoes || [],
    resultados: resultados.map(r => ({
      titulo: `${(r.pecas || [])[0] || 'PEÇA'} ${(r.modelos || [])[0] || ''}`.trim(),
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
  const id = normalizarTexto(dados.id || `${(dados.pecas||['PECA'])[0]} ${(dados.modelos||['MODELO'])[0]} ${faixaAnos(dados.anos||[])}`)
    .toLowerCase().replace(/\s+/g, '-');
  const novo = { ...dados, id, confiancaBase: Number(dados.confiancaBase || 80) };
  const idx = lista.findIndex(x => x.id === id);
  if (idx >= 0) lista[idx] = { ...lista[idx], ...novo };
  else lista.push(novo);
  salvarAplicacoes(lista);
  return novo;
}

module.exports = { lerAplicacoes, buscarBaseTecnica, montarResposta, adicionarAplicacao };
