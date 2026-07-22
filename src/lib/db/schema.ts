import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  real,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  customType,
} from 'drizzle-orm/pg-core';

const vector = (name: string, dimensions: number) =>
  customType<{ data: number[]; driverData: string }>({
    dataType() { return `vector(${dimensions})`; },
    toDriver(val: number[]) { return `[${val.join(',')}]`; },
    fromDriver(val: string) {
      return String(val).slice(1, -1).split(',').map(Number);
    },
  })(name);

export const orgs = pgTable('orgs', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  brandName: text('brand_name'),
  logoUrl: text('logo_url'),
  accentColor: text('accent_color').default('#0E7C66'),
  dailyAiCallCap: integer('daily_ai_call_cap').default(200),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (t) => [
  uniqueIndex('orgs_slug_idx').on(t.slug),
]);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  fullName: text('full_name'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => [
  uniqueIndex('users_email_idx').on(t.email),
]);

export const orgMembers = pgTable('org_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  role: text('role').notNull(),
  companyId: uuid('company_id').references(() => companies.id),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (t) => [
  index('org_members_org_user_idx').on(t.orgId, t.userId),
]);

export const authSessions = pgTable('auth_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => [
  index('auth_sessions_token_hash_idx').on(t.tokenHash),
]);

export const magicTokens = pgTable('magic_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  tokenHash: text('token_hash').notNull(),
  purpose: text('purpose').notNull(),
  orgId: uuid('org_id').references(() => orgs.id),
  companyId: uuid('company_id').references(() => companies.id),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const companies = pgTable('companies', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id),
  name: text('name').notNull(),
  oneLiner: text('one_liner'),
  targetBuyer: text('target_buyer'),
  stage: text('stage').notNull().default('intake'),
  readinessNote: text('readiness_note'),
  archived: boolean('archived').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (t) => [
  index('companies_org_idx').on(t.orgId),
]);

export const boardMembers = pgTable('board_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id),
  name: text('name').notNull(),
  title: text('title').notNull(),
  committeeRole: text('committee_role'),
  expertise: jsonb('expertise').default([]),
  personaPrompt: text('persona_prompt'),
  seatContext: text('seat_context'),
  interrogationStyle: text('interrogation_style'),
  avatarEmoji: text('avatar_emoji'),
  avatarUrl: text('avatar_url'),
  model: text('model').default('us.anthropic.claude-sonnet-4-6'),
  voiceId: text('voice_id'),
  mcpConnectorIds: jsonb('mcp_connector_ids').default([]),
  active: boolean('active').default(true),
  version: integer('version').default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (t) => [
  index('board_members_org_idx').on(t.orgId),
]);

export const boardMemberVersions = pgTable('board_member_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  boardMemberId: uuid('board_member_id').notNull().references(() => boardMembers.id),
  version: integer('version').notNull(),
  personaPrompt: text('persona_prompt'),
  seatContext: text('seat_context'),
  changedBy: uuid('changed_by').references(() => users.id),
  changeNote: text('change_note'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => [
  index('board_member_versions_member_idx').on(t.boardMemberId),
]);

export const reviewSessions = pgTable('review_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  runBy: uuid('run_by').notNull().references(() => users.id),
  mode: text('mode').notNull().default('full_review'),
  focusPrompt: text('focus_prompt'),
  phase: text('phase').notNull().default('interrogate'),
  status: text('status').notNull().default('active'),
  seatIds: jsonb('seat_ids').default([]),
  synthesis: text('synthesis'),
  punchList: jsonb('punch_list').default([]),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (t) => [
  index('review_sessions_company_idx').on(t.companyId),
]);

export const sessionTakes = pgTable('session_takes', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull().references(() => reviewSessions.id),
  boardMemberId: uuid('board_member_id').notNull().references(() => boardMembers.id),
  phase: text('phase').notNull(),
  content: text('content').notNull(),
  tokensUsed: integer('tokens_used'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => [
  index('session_takes_session_idx').on(t.sessionId),
]);

export const objections = pgTable('objections', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  raisedInSession: uuid('raised_in_session').references(() => reviewSessions.id),
  raisedBy: uuid('raised_by').references(() => boardMembers.id),
  lens: text('lens'),
  title: text('title').notNull(),
  detail: text('detail'),
  severity: text('severity').notNull().default('major'),
  state: text('state').notNull().default('open'),
  stateHistory: jsonb('state_history').default([]),
  lastReviewedIn: uuid('last_reviewed_in').references(() => reviewSessions.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (t) => [
  index('objections_company_idx').on(t.companyId),
  index('objections_state_idx').on(t.companyId, t.state),
]);

export const documents = pgTable('documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  uploadedBy: uuid('uploaded_by').references(() => users.id),
  filename: text('filename').notNull(),
  fileType: text('file_type').notNull(),
  s3Key: text('s3_key').notNull(),
  contentText: text('content_text'),
  status: text('status').notNull().default('processing'),
  label: text('label'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (t) => [
  index('documents_company_idx').on(t.companyId),
]);

export const documentChunks = pgTable('document_chunks', {
  id: uuid('id').primaryKey().defaultRandom(),
  documentId: uuid('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
  chunkIndex: integer('chunk_index').notNull(),
  content: text('content').notNull(),
  embedding: vector('embedding', 1024),
  tokenCount: integer('token_count'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const companyMemory = pgTable('company_memory', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  kind: text('kind').notNull().default('fact'),
  content: text('content').notNull(),
  source: text('source').notNull().default('session'),
  importance: real('importance').default(0.5),
  embedding: vector('embedding', 1024),
  archived: boolean('archived').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (t) => [
  index('company_memory_company_idx').on(t.companyId),
]);

export const outcomeLogs = pgTable('outcome_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id),
  companyId: uuid('company_id').notNull().references(() => companies.id),
  loggedBy: uuid('logged_by').references(() => users.id),
  outcome: text('outcome').notNull(),
  whatActuallyCameUp: text('what_actually_came_up'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const refinementProposals = pgTable('refinement_proposals', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id),
  boardMemberId: uuid('board_member_id').notNull().references(() => boardMembers.id),
  sourceSessionIds: jsonb('source_session_ids').default([]),
  proposal: text('proposal').notNull(),
  rationale: text('rationale'),
  status: text('status').notNull().default('pending'),
  decidedBy: uuid('decided_by').references(() => users.id),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const boardMemberTemplates = pgTable('board_member_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  templateSet: text('template_set').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  name: text('name').notNull(),
  title: text('title').notNull(),
  committeeRole: text('committee_role'),
  expertise: jsonb('expertise').default([]),
  personaPrompt: text('persona_prompt'),
  seatContext: text('seat_context'),
  interrogationStyle: text('interrogation_style'),
  avatarEmoji: text('avatar_emoji'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => [
  index('board_member_templates_set_idx').on(t.templateSet),
]);

export const mcpConnectors = pgTable('mcp_connectors', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id),
  name: text('name').notNull(),
  serverUrl: text('server_url').notNull(),
  authType: text('auth_type').notNull().default('none'),
  credentialsEncrypted: text('credentials_encrypted'),
  status: text('status').notNull().default('active'),
  allowedTools: jsonb('allowed_tools').default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (t) => [
  index('mcp_connectors_org_idx').on(t.orgId),
]);

export const appEvents = pgTable('app_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').references(() => orgs.id),
  userId: uuid('user_id').references(() => users.id),
  event: text('event').notNull(),
  props: jsonb('props').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
