function removerAcentos(txt = '') {
  return String(txt).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

const MAPA_TERMOS = [
  [/\bPARA CHOQUE\b/g, 'PARACHOQUE'],
  [/\bPARA-CHOQUE\b/g, 'PARACHOQUE'],
  [/\bP CHOQUE\b/g, 'PARACHOQUE'],
  [/\bPCHOQUE\b/g, 'PARACHOQUE'],
  [/\bPCHOQ\b/g, 'PARACHOQUE'],
  [/\bP LAMA\b/g, 'PARALAMA'],
  [/\bPARA LAMA\b/g, 'PARALAMA'],
  [/\bPARA-LAMA\b/g, 'PARALAMA'],
  [/\bCAPÔ\b/g, 'CAPO'],
  [/\bCAPOT\b/g, 'CAPO'],
  [/\bLANTERNA TRASEIRA\b/g, 'LANTERNA'],
  [/\bFAROL DIANTEIRO\b/g, 'FAROL'],
  [/\bRETROVISOR EXTERNO\b/g, 'RETROVISOR'],
  [/\bLADO DIREITO\b/g, 'DIREITO'],
  [/\bLADO ESQUERDO\b/g, 'ESQUERDO'],
  [/\bDIR\b/g, 'DIREITO'],
  [/\bESQ\b/g, 'ESQUERDO'],
  [/\bLD\b/g, 'DIREITO'],
  [/\bLE\b/g, 'ESQUERDO'],
  [/\bVW\b/g, 'VOLKSWAGEN'],
  [/\bGM\b/g, 'CHEVROLET'],
  [/\bCHEV\b/g, 'CHEVROLET']
];

function normalizarTexto(txt = '') {
  let n = removerAcentos(String(txt || '')).toUpperCase();
  n = n.replace(/[^A-Z0-9\s-]/g, ' ').replace(/-/g, ' ');
  n = n.replace(/\s+/g, ' ').trim();
  for (const [re, sub] of MAPA_TERMOS) n = n.replace(re, sub);
  return n.replace(/\s+/g, ' ').trim();
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
  if (/\bDIREITO\b|\bDIREITA\b/.test(n)) return 'DIREITO';
  if (/\bESQUERDO\b|\bESQUERDA\b/.test(n)) return 'ESQUERDO';
  if (/\bPAR\b|\bO PAR\b/.test(n)) return 'PAR';
  return '';
}

function faixaAnos(anos = []) {
  const nums = [...new Set((anos || []).map(Number).filter(Boolean))].sort((a,b)=>a-b);
  if (!nums.length) return '';
  if (nums.length === 1) return String(nums[0]);
  return `${nums[0]}-${nums[nums.length - 1]}`;
}

module.exports = { normalizarTexto, tokens, extrairAnos, detectarLado, faixaAnos };
