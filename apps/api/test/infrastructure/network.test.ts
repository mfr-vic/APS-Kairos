import net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { AUTO_SELECT_FAMILY_ATTEMPT_TIMEOUT_MS, configurarRede } from '../../src/infrastructure/network.js';

const original = net.getDefaultAutoSelectFamilyAttemptTimeout();
afterEach(() => net.setDefaultAutoSelectFamilyAttemptTimeout(original));

describe('configurarRede', () => {
  it('dá 1 s (e não 250 ms) a cada endereço no Happy Eyeballs, mantendo IPv6/IPv4 automáticos', () => {
    configurarRede();
    expect(net.getDefaultAutoSelectFamilyAttemptTimeout()).toBe(AUTO_SELECT_FAMILY_ATTEMPT_TIMEOUT_MS);
    expect(AUTO_SELECT_FAMILY_ATTEMPT_TIMEOUT_MS).toBe(1_000);
  });
});
