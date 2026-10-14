// Ajustes de rede do processo (defeito de 13/10/2026), chamados uma vez no index.ts.
//
// Node 24 tenta IPv6 e IPv4 em paralelo escalonado ("Happy Eyeballs", autoSelectFamily) e dá só 250 ms
// para cada endereço. No container não há rota IPv6, e o RTT até a Open-Meteo (Alemanha) passa de 200 ms:
// quando o handshake TCP IPv4 passava de 250 ms, a conexão inteira falhava com ETIMEDOUT em ~0,3 s.
// Medido no container em 13/10/2026 (conexões novas a air-quality-api.open-meteo.com, que tem A e AAAA):
//   padrão 250 ms → 26/30 e 24/25 ok (ETIMEDOUT nos demais); `ipv4first` → 28/30 (não resolve);
//   1000 ms → 30/30 e 25/25 ok, sem mudar a mediana (~0,95 s).
import net from 'node:net';

export const AUTO_SELECT_FAMILY_ATTEMPT_TIMEOUT_MS = 1_000;

export function configurarRede(): void {
  net.setDefaultAutoSelectFamilyAttemptTimeout(AUTO_SELECT_FAMILY_ATTEMPT_TIMEOUT_MS);
}
