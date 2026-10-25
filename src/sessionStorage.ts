import { validateSession } from './domain/study.ts';
import { legacyProtocol } from './domain/workflow.ts';
import type { Protocol, Scenario, Session } from './domain/types.ts';

export const sessionStorageKey = (version: string) => `enviedu:stock-flow:${version}`;

export function removeSessionProgress(storage: Pick<Storage, 'getItem' | 'removeItem' | 'key' | 'length'>, sessionId: string): void {
  const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index));
  for (const key of keys) {
    if (!key?.includes(':stock-flow:')) continue;
    let saved: { sessionId?: string } | null;
    try { saved = JSON.parse(storage.getItem(key) ?? 'null'); } catch { continue; }
    if (saved?.sessionId === sessionId) storage.removeItem(key);
  }
}

export function readSessionProgress(storage: Pick<Storage, 'getItem' | 'setItem' | 'key' | 'length'>, protocol: Protocol, scenarios: Scenario[]): Session | null {
  const key = sessionStorageKey(protocol.version);
  const current = storage.getItem(key);
  if (current !== null) return validateSession(JSON.parse(current), protocol, scenarios);

  // Restore matching stock-flow sessions independently of an earlier project name.
  let recovered: { raw: string; session: Session } | null = null;
  for (let index = 0; index < storage.length; index++) {
    const candidateKey = storage.key(index);
    if (!candidateKey || ![protocol.version, legacyProtocol.version].some(version => candidateKey.endsWith(`:stock-flow:${version}`))) continue;
    const raw = storage.getItem(candidateKey);
    if (raw === null) continue;
    try {
      const session = validateSession(JSON.parse(raw), protocol, scenarios);
      if (!recovered || session.updatedAt > recovered.session.updatedAt) recovered = { raw, session };
    } catch { /* Unrelated or invalid snapshots cannot become the active session. */ }
  }
  if (!recovered) return null;
  storage.setItem(sessionStorageKey(recovered.session.protocolVersion), recovered.raw);
  return recovered.session;
}
