const aplicacoes = require('../banco/aplicacoes.json');
const { normalizarTexto, tokens, extrairAnos, detectarLado } = require('../utils/normalizar');

function pontuarAplicacao(query, app) {
  const q = normalizarTexto(query);
  const qt = tokens(q);
  const anosQuery = extrairAnos(q);
  const ladoQuery = detectarLado(q);
  let score = 0;
  const motivos = [];

  for (const peca of app.pecas || []) {
    if (q.includes(normalizarTexto(peca))) { score += 35; motivos.push(`Peça: ${peca}`); break; }
  }

  for (const modelo of app.modelos || []) {
    const nm = normalizarTexto(modelo);
    if (q.includes(nm)) { score += 35; motivos.push(`Modelo: ${modelo}`); break; }
    const partes = tokens(nm);
    const hits = partes.filter(t => qt.includes(t)).length;
    if (hits && hits === partes.length) { score += 28; motivos.push(`Modelo aproximado: ${modelo}`); break; }
    if (hits) score += Math.min(16, hits * 8);
  }

  for (const marca of app.marcas || []) {
    if (q.includes(normalizarTexto(marca))) { score += 8; motivos.push(`Marca: ${marca}`); break; }
  }

  if (anosQuery.length) {
    const matchAno = anosQuery.some(a => (app.anos || []).includes(a));
    if (matchAno) { score += 18; motivos.push(`Ano compatível: ${anosQuery.join(', ')}`); }
    else score -= 25;
  }

  if (ladoQuery) {
    if ((app.lados || []).includes(ladoQuery) || (ladoQuery === 'PAR' && app.lados?.length >= 2)) {
      score += 5;
      motivos.push(`Lado: ${ladoQuery}`);
    }
  }

  score = Math.max(0, Math.min(100, score + Math.round((app.confiancaBase || 70) * 0.05)));
  return { score, motivos };
}

function buscarBaseTecnica(query) {
  const resultados = aplicacoes
    .map(app => {
      const p = pontuarAplicacao(query, app);
      return { ...app, score: p.score, motivos: p.motivos };
    })
    .filter(r => r.score >= 35)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  return resultados;
}

function montarResposta(query, resultados) {
  const melhor = resultados[0] || null;
  if (!melhor) {
    return {
      ok: true,
      version: '4.0.0-alampe-tecnico',
      query,
      origem: 'base-tecnica',
      cache: false,
      encontrou: false,
      resumo: {
        peca: '', marca: '', veiculo: '', anos: [], lados: [], confianca: 'baixa', score: 0
      },
      aplicacoes: [],
      lados: [],
      fabricantes: [],
      observacoes: ['Nenhuma aplicação encontrada na base técnica Alampe. Cadastre ou confirme manualmente.'],
      resultados: []
    };
  }

  const confianca = melhor.score >= 80 ? 'alta' : melhor.score >= 55 ? 'media' : 'baixa';
  return {
    ok: true,
    version: '4.0.0-alampe-tecnico',
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
    aplicacoes: resultados.map(r => `${(r.pecas || [])[0] || 'PEÇA'} ${(r.modelos || [])[0] || ''} ${(r.anos || []).length ? `${Math.min(...r.anos)}-${Math.max(...r.anos)}` : ''}`.trim()),
    lados: melhor.lados || [],
    fabricantes: melhor.fabricantes || [],
    observacoes: melhor.observacoes || [],
    resultados: resultados.map(r => ({
      titulo: `${(r.pecas || [])[0] || 'PEÇA'} ${(r.modelos || [])[0] || ''}`.trim(),
      aplicacao: `${(r.modelos || []).join(' / ')} ${(r.anos || []).length ? `${Math.min(...r.anos)}-${Math.max(...r.anos)}` : ''}`.trim(),
      lados: r.lados || [],
      fabricantes: r.fabricantes || [],
      score: r.score,
      motivos: r.motivos || [],
      fonte: 'Base Técnica Alampe'
    }))
  };
}

module.exports = { buscarBaseTecnica, montarResposta };
