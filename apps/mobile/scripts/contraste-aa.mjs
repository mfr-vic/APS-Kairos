// Mede contraste WCAG (AA >= 4.5:1) dos pares texto/fundo da paleta do Καιρός.
// Rode com `node scripts/contraste-aa.mjs` ao mudar qualquer cor.
// shortcut: paleta duplicada de src/theme/colors.ts (o script roda em Node puro, sem RN);
// ao editar colors.ts, atualize aqui junto.
const lin = (c) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const L = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
};
const ratio = (a, b) => {
  const [hi, lo] = [L(a), L(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const claro = {
  background: '#EEF4F1',
  surface: '#FFFFFF',
  surfaceMuted: '#DFE9E5',
  surfacePressed: '#CFDED8',
  separator: '#C2D2CC',
  text: '#0F261F',
  textSecondary: '#44584F',
  tint: '#1F5748',
  brand: '#0F261F',
  onBrand: '#FFFFFF',
  onBrandSecondary: '#B5D1CC',
  accent: '#B5D1CC',
  onAccent: '#0F261F',
  danger: '#730F1F',
  onDanger: '#FFFFFF',
  fgOk: '#1F6B4E',
  fgAtencao: '#7A4E10',
  fgErro: '#8C1424',
  fgNeutro: '#51635B',
  okSoft: '#DCEFE6',
  atencaoSoft: '#F6E8D2',
  erroSoft: '#F6DDE1',
  neutroSoft: '#E1E9E6',
  decisaoSoft: '#D6E8E3',
  inverseSurface: '#0F261F',
  onInverse: '#FFFFFF',
  inverseAction: '#B5D1CC',
};
const escuro = {
  background: '#0F261F',
  surface: '#17332A',
  surfaceMuted: '#204236',
  surfacePressed: '#294F41',
  separator: '#2E5245',
  text: '#E9F2EF',
  textSecondary: '#A3BDB5',
  tint: '#B5D1CC',
  brand: '#0A1B16',
  onBrand: '#FFFFFF',
  onBrandSecondary: '#A3BDB5',
  accent: '#B5D1CC',
  onAccent: '#0F261F',
  danger: '#F0A4AC',
  onDanger: '#0F261F',
  fgOk: '#86C8AC',
  fgAtencao: '#E3B06E',
  fgErro: '#F0A4AC',
  fgNeutro: '#A3BDB5',
  okSoft: '#1C4436',
  atencaoSoft: '#45361C',
  erroSoft: '#4A262D',
  neutroSoft: '#243F35',
  decisaoSoft: '#22463C',
  inverseSurface: '#E9F2EF',
  onInverse: '#0F261F',
  inverseAction: '#1F5748',
};
const statusColors = {
  favoravel: '#1F6B4E',
  atencao: '#7A4E10',
  aguardar: '#730F1F',
  indeterminado: '#51635B',
};

// Pares texto/fundo realmente usados nas telas.
const pares = (p, nome) => [
  // texto sobre fundos
  [`${nome} text/background`, p.text, p.background],
  [`${nome} text/surface`, p.text, p.surface],
  [`${nome} text/surfaceMuted`, p.text, p.surfaceMuted],
  [`${nome} text/surfacePressed`, p.text, p.surfacePressed],
  [`${nome} textSecondary/background`, p.textSecondary, p.background],
  [`${nome} textSecondary/surface`, p.textSecondary, p.surface],
  [`${nome} textSecondary/surfaceMuted`, p.textSecondary, p.surfaceMuted],
  [`${nome} tint/surface`, p.tint, p.surface],
  [`${nome} tint/background`, p.tint, p.background],
  [`${nome} tint/surfaceMuted`, p.tint, p.surfaceMuted],
  [`${nome} danger/surface`, p.danger, p.surface],
  [`${nome} danger/background`, p.danger, p.background],
  [`${nome} onBrand/brand`, p.onBrand, p.brand],
  [`${nome} onBrandSecondary/brand`, p.onBrandSecondary, p.brand],
  [`${nome} onAccent/accent`, p.onAccent, p.accent],
  [`${nome} onDanger/danger`, p.onDanger, p.danger],
  [`${nome} fgAtencao/surface`, p.fgAtencao, p.surface],
  [`${nome} fgErro/surface`, p.fgErro, p.surface],
  [`${nome} fgOk/surface`, p.fgOk, p.surface],
  [`${nome} fgNeutro/surface`, p.fgNeutro, p.surface],
  // Redesenho de 13/10: faixas de estado, blocos de ícone, snackbar, janela e folha.
  ...['ok', 'atencao', 'erro', 'neutro'].flatMap((tom) => {
    const soft = p[`${tom}Soft`];
    const fg = p[`fg${tom[0].toUpperCase()}${tom.slice(1)}`];
    return [
      [`${nome} text/${tom}Soft`, p.text, soft],
      [`${nome} tint/${tom}Soft (botão texto na faixa)`, p.tint, soft],
      [`${nome} fg/${tom}Soft (ícone/rótulo no bloco)`, fg, soft],
    ];
  }),
  [`${nome} text/decisaoSoft`, p.text, p.decisaoSoft],
  [`${nome} textSecondary/decisaoSoft`, p.textSecondary, p.decisaoSoft],
  [`${nome} tint/decisaoSoft`, p.tint, p.decisaoSoft],
  [`${nome} onInverse/inverseSurface (snackbar)`, p.onInverse, p.inverseSurface],
  [`${nome} inverseAction/inverseSurface (Desfazer)`, p.inverseAction, p.inverseSurface],
  [`${nome} textSecondary/surfacePressed`, p.textSecondary, p.surfacePressed],
  [`${nome} tint/surfacePressed`, p.tint, p.surfacePressed],
  [`${nome} fgOk/background`, p.fgOk, p.background],
  [`${nome} fgAtencao/background`, p.fgAtencao, p.background],
  [`${nome} fgErro/background`, p.fgErro, p.background],
];
const todos = [
  ...pares(claro, 'claro'),
  ...pares(escuro, 'escuro'),
  ...Object.entries(statusColors).map(([k, v]) => [`onStatus/${k}`, '#FFFFFF', v]),
];

let falhas = 0;
for (const [nome, fg, bg] of todos) {
  const r = ratio(fg, bg);
  const ok = r >= 4.5;
  if (!ok) falhas++;
  console.log(`${ok ? 'OK ' : 'FALHA'} ${r.toFixed(2).padStart(6)}  ${nome}  (${fg} sobre ${bg})`);
}
console.log(falhas === 0 ? '\nTodos os pares passam AA (>= 4.5:1).' : `\n${falhas} par(es) abaixo de 4.5:1.`);

// Número sobre a bolinha da linha (lineColors em colors.ts; cores oficiais, fora da paleta).
// Informativo: não reprova o script, porque o nome da linha vai SEMPRE ao lado (o número sozinho
// não carrega a informação). Abaixo de 4,5:1 o script lembra disso.
const linhas = {
  L1: ['#0455A1', '#FFFFFF'],
  L2: ['#007E5E', '#FFFFFF'],
  L3: ['#EE372F', '#FFFFFF'],
  L4: ['#FED304', '#111827'],
  L5: ['#9B3894', '#FFFFFF'],
  L6: ['#F68D1E', '#111827'],
  L7: ['#9E1766', '#FFFFFF'],
  L8: ['#9EA09D', '#111827'],
  L9: ['#00A99D', '#111827'],
  L15: ['#9EA2A8', '#111827'],
  'sem cor (10–13)': ['#51635B', '#FFFFFF'],
};
console.log('\nNúmero sobre a bolinha das linhas (informativo):');
for (const [linha, [bg, on]] of Object.entries(linhas)) {
  const r = ratio(on, bg);
  const nota = r >= 4.5 ? 'OK ' : 'NOME';
  console.log(`${nota} ${r.toFixed(2).padStart(6)}  ${linha}  (${on} sobre ${bg})${r < 4.5 ? '  < 4,5:1: nome sempre ao lado' : ''}`);
}
process.exit(falhas === 0 ? 0 : 1);
