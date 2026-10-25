import { integer, sqliteTable, text, index } from 'drizzle-orm/sqlite-core';
export const submissions = sqliteTable('submissions', {
  id: text('id').primaryKey(), participantCode: text('participant_code').notNull().unique(),
  condition: text('condition').notNull(), protocolVersion: text('protocol_version').notNull(),
  tokenHash: text('token_hash').notNull(), createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(),
  submittedAt: text('submitted_at'), stage: text('stage').notNull(), sessionJson: text('session_json'),
  contentHash: text('content_hash'), lastSequence: integer('last_sequence').notNull().default(0),
  responsesCount: integer('responses_count').notNull().default(0), runsCount: integer('runs_count').notNull().default(0),
  preScore: integer('pre_score'), postScore: integer('post_score'), transferScore: integer('transfer_score'),
  expiresAt: text('expires_at').notNull()
}, table => [index('submissions_updated_idx').on(table.updatedAt), index('submissions_status_idx').on(table.stage)]);
export const settings = sqliteTable('study_settings', { id: integer('id').primaryKey(), condition: text('condition').notNull() });
export const rateLimits = sqliteTable('request_buckets', { key: text('key').primaryKey(), hits: integer('hits').notNull(), expiresAt: integer('expires_at').notNull() });
