-- Migration 002: Schema deltas for UI rebuild (Phase U2-U5)
-- board_member_templates, mcp_connectors, new columns on board_members + review_sessions

BEGIN;

-- 1. board_member_templates (global, read-only to orgs)
CREATE TABLE IF NOT EXISTS board_member_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_set TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  committee_role TEXT,
  expertise JSONB DEFAULT '[]'::jsonb,
  persona_prompt TEXT,
  seat_context TEXT,
  interrogation_style TEXT,
  avatar_emoji TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS board_member_templates_set_idx ON board_member_templates(template_set);

-- 2. mcp_connectors (org-scoped, RLS)
CREATE TABLE IF NOT EXISTS mcp_connectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id),
  name TEXT NOT NULL,
  server_url TEXT NOT NULL,
  auth_type TEXT NOT NULL DEFAULT 'none',
  credentials_encrypted TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  allowed_tools JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mcp_connectors_org_idx ON mcp_connectors(org_id);

ALTER TABLE mcp_connectors ENABLE ROW LEVEL SECURITY;
CREATE POLICY mcp_connectors_org_isolation ON mcp_connectors
  USING (org_id::text = current_setting('app.org_id', true));

-- 3. New columns on board_members
ALTER TABLE board_members ADD COLUMN IF NOT EXISTS voice_id TEXT;
ALTER TABLE board_members ADD COLUMN IF NOT EXISTS mcp_connector_ids JSONB DEFAULT '[]'::jsonb;

-- 4. New column on review_sessions
ALTER TABLE review_sessions ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

COMMIT;
