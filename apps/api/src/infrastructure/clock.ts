// Relógio injetável (T16): os testes usam um relógio simulado (TC17) em vez de Date.now()
export interface Clock {
  /** Instante atual em milissegundos desde a época Unix. */
  now(): number;
}

export const systemClock: Clock = {
  now: () => Date.now(),
};
