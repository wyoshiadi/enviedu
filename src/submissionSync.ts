import type { Condition, Session, StudyClass } from './domain/types.ts';
export type SyncStatus = { state: 'idle' | 'saving' | 'saved' | 'error' | 'expired'; message: string; sequence: number; submittedAt: string | null };
export type Registration = { sessionId: string; participantId: string; classId: StudyClass; condition: Condition; protocolVersion: string; createdAt: string };
export async function registerStudent(participantId: string, classId: StudyClass): Promise<Registration> {
  const response = await fetch('/api/student/sessions', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ participantId, classId }) });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Unable to start a session.');
  return body;
}
export class SubmissionSync {
  private pending: Session | null = null;
  private busy = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;
  private notify: (status: SyncStatus) => void;
  private queued(): Session | null { return this.pending; }
  constructor(notify: (status: SyncStatus) => void) { this.notify = notify; }
  enqueue(session: Session) {
    if (this.disposed) return;
    this.pending = session; clearTimeout(this.timer);
    this.notify({ state: 'saving', message: 'Saving your progress…', sequence: 0, submittedAt: null });
    this.timer = setTimeout(() => void this.flush(), session.stage === 'complete' ? 0 : 400);
  }
  async flush() {
    if (this.busy || !this.pending || this.disposed) return;
    clearTimeout(this.timer); const session = this.pending; this.pending = null; this.busy = true; let retry = false, failed = false;
    try {
      const response = await fetch('/api/student/sessions/' + session.sessionId, { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(session) });
      const body = await response.json();
      if (response.status === 410) {
        this.pending = null;
        if (!this.disposed) { this.dispose(); this.notify({ state: 'expired', message: body.error || 'This session has expired. Start a new session.', sequence: 0, submittedAt: null }); }
        return;
      }
      if (!response.ok) { retry = response.status === 429 || response.status >= 500; throw new Error(body.error || 'Unable to save your progress.'); }
      if (!this.disposed) this.notify({ state: this.pending ? 'saving' : 'saved', message: this.pending ? 'Saving your latest progress…' : session.stage === 'complete' ? 'Your answers have been submitted.' : 'Progress saved.', sequence: body.sequence, submittedAt: body.submittedAt });
    } catch (error) {
      failed = true;
      const queued = this.queued();
      if (!queued || queued.events.length < session.events.length) this.pending = session;
      if (error instanceof TypeError) retry = true;
      if (!this.disposed) this.notify({ state: 'error', message: (error instanceof Error ? error.message : 'Upload failed.') + ' Your progress is still saved on this device.', sequence: 0, submittedAt: null });
    } finally {
      this.busy = false;
      if (this.pending && !this.disposed && (!failed || retry)) this.timer = setTimeout(() => void this.flush(), failed ? 5000 : 0);
    }
  }
  dispose() { this.disposed = true; clearTimeout(this.timer); }
}
