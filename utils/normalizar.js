function removerAcentos(txt = '') {
  return String(txt).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

const MAPA_TERMOS = [
  [/\bPARA CHOQUE\b/g, 'PARACHOQUE'],
  [/\bPARA-CHOQUE\b/g, 'PARACHOQUE'],
  [/\bP CHOQUE\b/g, 'PARACHOQUE'],
  [/\bPCHOQUE\b/g, 'PARACHOQUE'],
  [/\bPCHOQ\b/g, 'PARACHOQUE'],
  [/\bPARACHOQ\b/g, 'PARACHOQUE'],
  [/\bP LAMA\b/g, 'PARALAMA'],
  [/\bPARA LAMA\b/g, 'PARALAMA'],
  [/\bPARA-LAMA\b/g, 'PARALAMA'],
  [/\bPARALAM\b/g, 'PARALAMA'],
  [/\bCAPÔ\b/g, 'CAPO'],
  [/\bCAPOT\b/g, 'CAPO'],
  [/\bCAPA DO MOTOR\b/g, 'CAPO'],
  [/\bLANTERNA TRASEIRA\b/g, 'LANTERNA'],
  [/\bFAROL DIANTEIRO\b/g, 'FAROL'],
  [/\bRETROVISOR EXTERNO\b/g, 'RETROVISOR'],
  [/\bLADO DIREITO\b/g, 'DIREITO'],
  [/\bLADO ESQUERDO\b/g, 'ESQUERDO'],
  [/\bDIREITA\b/g, 'DIREITO'],
  [/\bESQUERDA\b/g, 'ESQUERDO'],
  [/\bDIR\b/g, 'DIREITO'],
  [/\bESQ\b/g, 'ESQUERDO'],
  [/\bLD\b/g, 'DIREITO'],
  [/\bLE\b/g, 'ESQUERDO'],
  [/\bDIANT\b/g, 'DIANTEIRO'],
  [/\bTRAS\b/g, 'TRASEIRO'],
  [/\bTRASEIRA\b/g, 'TRASEIRO'],
  [/\bVW\b/g, 'VOLKSWAGEN'],
  [/\bGM\b/g, 'CHEVROLET'],
  [/\bCHEV\b/g, 'CHEVROLET'],
  [/\bWOLKSWAGEN\b/g, 'VOLKSWAGEN'],
  [/\bWV\b/g, 'VOLKSWAGEN']
];

const PECAS_CONHECIDAS = [
  'FAROL','LANTERNA','PARACHOQUE','PARALAMA','CAPO','RETROVISOR','GRADE','RADIADOR','CONDENSADOR','VENTOINHA','ALMA','PAINEL FRONTAL','CARTER','PARABARRO','MILHA','SUPORTE'
];

const STOPWORDS = new Set(['DE','DO','DA','DAS','DOS','PARA','COM','SEM','O','A','OS','AS','UM','UMA','NO','NA','EM']);

function normalizarTexto(txt = '') {
  let n = removerAcentos(String(txt || '')).toUpperCase();
  n = n.replace(/[^A-Z0-9\s-]/g, ' ').replace(/-/g, ' ');
  n = n.replace(/\s+/g, ' ').trim();
  for (const [re, sub] of MAPA_TERMOS) n = n.replace(re, sub);
  return n.replace(/\s+/g, ' ').trim();
}

function tokens(txt = '') {
  return normalizarTexto(txt).split(' ').filter(t => t && !STOPWORDS.has(t));
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
  if (/\bDIREITO\b/.test(n)) return 'DIREITO';
  if (/\bESQUERDO\b/.test(n)) return 'ESQUERDO';
  if (/\bPAR\b|\bO PAR\b/.test(n)) return 'PAR';
  return '';
}

function detectarPosicao(txt = '') {
  const n = normalizarTexto(txt);
  if (/\bDIANTEIRO\b/.test(n)) return 'DIANTEIRO';
  if (/\bTRASEIRO\b/.test(n)) return 'TRASEIRO';
  return '';
}

function detectarPeca(txt = '') {
  const n = normalizarTexto(txt);
  return PECAS_CONHECIDAS.find(p => n.includes(normalizarTexto(p))) || '';
}

function faixaAnos(anos = []) {
  const nums = [...new Set((anos || []).map(Number).filter(Boolean))].sort((a,b)=>a-b);
  if (!nums.length) return '';
  if (nums.length === 1) return String(nums[0]);
  return `${nums[0]}-${nums[nums.length - 1]}`;
}

function anoNaFaixa(ano, anos = []) {
  const nums = [...new Set((anos || []).map(Number).filter(Boolean))].sort((a,b)=>a-b);
  return nums.includes(Number(ano));
}

function slug(txt = '') {
  return normalizarTexto(txt).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

module.exports = { normalizarTexto, tokens, extrairAnos, detectarLado, detectarPosicao, detectarPeca, faixaAnos, anoNaFaixa, slug };
