export type Row = Record<string, unknown>;
export type DBResult<T = Row> = { results: T[]; meta: { changes: number } };
export interface Statement {
  bind(...values: unknown[]): Statement;
  first<T = Row>(): Promise<T | null>;
  all<T = Row>(): Promise<DBResult<T>>;
  run(): Promise<DBResult>;
}
export interface Database { prepare(sql: string): Statement; batch(statements: Statement[]): Promise<DBResult[]> }
export type Environment = { DB: Database; TEACHER_EMAIL: string; CF_ACCESS_TEAM_DOMAIN?: string; CF_ACCESS_AUD?: string };
export type TeacherIdentity = { userId: string; email: string };
export type TeacherAccess = {
  identity?: TeacherIdentity;
  signInUrl?: string;
  signOutUrl?: string;
  error?: { status: 401 | 503; message: string };
};
export type Assets = Record<string, { body: string; type: string }>;
