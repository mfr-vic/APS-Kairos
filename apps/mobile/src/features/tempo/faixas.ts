// Faixas de UV (OMS) e de umidade relativa (Defesa Civil SP), usadas no widget "tempo agora"
// e nos alertas calculados. `nivel` segue a escala dos alertas: 0 informativo … 3 crítico.

export type Faixa = { rotulo: string; nivel: 0 | 1 | 2 | 3 };

/** Índice UV (OMS): < 3 baixo, 3–5 moderado, 6–7 alto, 8–10 muito alto, ≥ 11 extremo. */
export function faixaUv(uv: number): Faixa {
  if (uv >= 11) return { rotulo: 'extremo', nivel: 3 };
  if (uv >= 8) return { rotulo: 'muito alto', nivel: 2 };
  if (uv >= 6) return { rotulo: 'alto', nivel: 1 };
  if (uv >= 3) return { rotulo: 'moderado', nivel: 0 };
  return { rotulo: 'baixo', nivel: 0 };
}

/** Umidade relativa (Defesa Civil SP): < 30 % atenção, < 20 % alerta, < 12 % emergência; senão null. */
export function faixaUmidade(pct: number): Faixa | null {
  if (pct < 12) return { rotulo: 'emergência', nivel: 3 };
  if (pct < 20) return { rotulo: 'alerta', nivel: 2 };
  if (pct < 30) return { rotulo: 'atenção', nivel: 1 };
  return null;
}
