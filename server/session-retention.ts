import type { Database, Environment } from './types.ts';

export const INCOMPLETE_SESSION_IDLE_MS = 60 * 60 * 1000;

export function idleSessionCutoff(now = Date.now()): string {
  return new Date(now - INCOMPLETE_SESSION_IDLE_MS).toISOString();
}

export async function purgeIdleSessions(db: Database, now = Date.now(), sessionId?: string): Promise<number> {
  // Use server receipt time. Completed submissions are never part of this policy.
  const values: unknown[] = [idleSessionCutoff(now)];
  if (sessionId) values.push(sessionId);
  const result = await db.prepare("DELETE FROM submissions WHERE stage <> 'complete' AND submitted_at IS NULL AND updated_at <= ?" + (sessionId ? ' AND id = ?' : '')).bind(...values).run();
  return result.meta.changes;
}

export async function scheduledSessionCleanup(controller: { scheduledTime: number }, env: Environment): Promise<void> {
  await purgeIdleSessions(env.DB, controller.scheduledTime);
}
