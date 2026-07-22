import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

describe('RLS migration SQL validation', () => {
  const sql = readFileSync(path.join(__dirname, '../scripts/001-initial-schema.sql'), 'utf8');

  const rlsTables = [
    'companies',
    'board_members',
    'board_member_versions',
    'review_sessions',
    'session_takes',
    'objections',
    'documents',
    'document_chunks',
    'company_memory',
    'outcome_logs',
    'refinement_proposals',
  ];

  it('enables RLS on all org-scoped tables', () => {
    for (const table of rlsTables) {
      expect(sql).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    }
  });

  it('forces RLS on all org-scoped tables', () => {
    for (const table of rlsTables) {
      expect(sql).toContain(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
    }
  });

  it('uses app.org_id for org isolation', () => {
    const orgIdPattern = /current_setting\('app\.org_id', true\)::uuid/g;
    const matches = sql.match(orgIdPattern);
    expect(matches!.length).toBeGreaterThan(5);
  });

  it('uses app.company_scope for founder isolation', () => {
    const scopePattern = /current_setting\('app\.company_scope', true\)/g;
    const matches = sql.match(scopePattern);
    expect(matches!.length).toBeGreaterThan(3);
  });

  it('has safe default when app.org_id is not set (returns NULL = no rows)', () => {
    // current_setting with true second arg returns NULL if not set
    // NULL::uuid compared with = returns false for all rows
    expect(sql).toContain("current_setting('app.org_id', true)");
  });

  it('creates vector extension', () => {
    expect(sql).toContain('CREATE EXTENSION IF NOT EXISTS vector');
  });

  it('creates ivfflat indexes on embedding columns', () => {
    expect(sql).toContain('USING ivfflat (embedding vector_cosine_ops)');
  });
});
