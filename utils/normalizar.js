function removerAcentos(txt = '') {
  return String(txt).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizarTexto(txt = '') {
  return removerAcentos(String(txt || ''))
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(txt = '') {
  return normalizarTexto(txt).split(' ').filter(Boolean);
}

function extrairAnos(txt = '') {
  const anos = [];
  const re = /\b(19\d{2}|20\d{2})\b/g;
  let m;
  while ((m = re.exec(String(txt))) !== null) anos.push(Number(m[1]));
  return [...new Set(anos)];
}

function detectarLado(txt = '') {
  const n = normalizarTexto(txt);
  if (/\bDIR\b|\bDIREITO\b|\bDIREITA\b/.test(n)) return 'DIREITO';
  if (/\bESQ\b|\bESQUERDO\b|\bESQUERDA\b/.test(n)) return 'ESQUERDO';
  if (/\bPAR\b|\bO PAR\b/.test(n)) return 'PAR';
  return '';
}

module.exports = { normalizarTexto, tokens, extrairAnos, detectarLado };
