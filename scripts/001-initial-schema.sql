-- PreBoard Initial Schema
-- Run against the 'preboard' database on helix-aurora-instance-1

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS citext;

-- Organizations
CREATE TABLE orgs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  brand_name TEXT,
  logo_url TEXT,
  accent_color TEXT DEFAULT '#0E7C66',
  daily_ai_call_cap INTEGER DEFAULT 200,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Users
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email CITEXT NOT NULL UNIQUE,
  full_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Org memberships
CREATE TABLE org_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id),
  user_id UUID NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('operator', 'founder')),
  company_id UUID, -- populated below after companies table exists
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX org_members_org_user_idx ON org_members(org_id, user_id);

-- Auth sessions
CREATE TABLE auth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX auth_sessions_token_hash_idx ON auth_sessions(token_hash);

-- Magic tokens
CREATE TABLE magic_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('login', 'founder_invite')),
  org_id UUID REFERENCES orgs(id),
  company_id UUID,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Companies
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id),
  name TEXT NOT NULL,
  one_liner TEXT,
  target_buyer TEXT,
  stage TEXT NOT NULL DEFAULT 'intake' CHECK (stage IN ('intake', 'in_review', 'iterating', 'ready', 'pitched', 'closed')),
  readiness_note TEXT,
  archived BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX companies_org_idx ON companies(org_id);

-- Add FK from org_members to companies
ALTER TABLE org_members ADD CONSTRAINT org_members_company_id_fk FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE magic_tokens ADD CONSTRAINT magic_tokens_company_id_fk FOREIGN KEY (company_id) REFERENCES companies(id);

-- Board members
CREATE TABLE board_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id),
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  committee_role TEXT,
  expertise JSONB DEFAULT '[]',
  persona_prompt TEXT,
  seat_context TEXT,
  interrogation_style TEXT,
  avatar_emoji TEXT,
  avatar_url TEXT,
  model TEXT DEFAULT 'us.anthropic.claude-sonnet-4-6',
  active BOOLEAN DEFAULT true,
  version INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX board_members_org_idx ON board_members(org_id);

-- Board member version history
CREATE TABLE board_member_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_member_id UUID NOT NULL REFERENCES board_members(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  persona_prompt TEXT,
  seat_context TEXT,
  changed_by UUID REFERENCES users(id),
  change_note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX board_member_versions_member_idx ON board_member_versions(board_member_id);

-- Review sessions
CREATE TABLE review_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id),
  company_id UUID NOT NULL REFERENCES companies(id),
  run_by UUID NOT NULL REFERENCES users(id),
  mode TEXT NOT NULL DEFAULT 'full_review' CHECK (mode IN ('full_review', 'focused')),
  focus_prompt TEXT,
  phase TEXT NOT NULL DEFAULT 'interrogate' CHECK (phase IN ('interrogate', 'advise', 'synthesized')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'complete')),
  seat_ids JSONB DEFAULT '[]',
  synthesis TEXT,
  punch_list JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX review_sessions_company_idx ON review_sessions(company_id);

-- Session takes (individual board member responses)
CREATE TABLE session_takes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES review_sessions(id) ON DELETE CASCADE,
  board_member_id UUID NOT NULL REFERENCES board_members(id),
  phase TEXT NOT NULL CHECK (phase IN ('interrogate', 'advise')),
  content TEXT NOT NULL,
  tokens_used INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX session_takes_session_idx ON session_takes(session_id);

-- Objections
CREATE TABLE objections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id),
  company_id UUID NOT NULL REFERENCES companies(id),
  raised_in_session UUID REFERENCES review_sessions(id),
  raised_by UUID REFERENCES board_members(id),
  lens TEXT,
  title TEXT NOT NULL,
  detail TEXT,
  severity TEXT NOT NULL DEFAULT 'major' CHECK (severity IN ('deal_killer', 'major', 'minor')),
  state TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'addressed', 'resolved', 'still_weak')),
  state_history JSONB DEFAULT '[]',
  last_reviewed_in UUID REFERENCES review_sessions(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX objections_company_idx ON objections(company_id);
CREATE INDEX objections_state_idx ON objections(company_id, state);

-- Documents
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id),
  company_id UUID NOT NULL REFERENCES companies(id),
  uploaded_by UUID REFERENCES users(id),
  filename TEXT NOT NULL,
  file_type TEXT NOT NULL,
  s3_key TEXT NOT NULL,
  content_text TEXT,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'ready', 'failed')),
  label TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX documents_company_idx ON documents(company_id);

-- Document chunks with vector embeddings
CREATE TABLE document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1024),
  token_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX document_chunks_embedding_idx ON document_chunks
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);

-- Company memory (ontology)
CREATE TABLE company_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id),
  company_id UUID NOT NULL REFERENCES companies(id),
  kind TEXT NOT NULL DEFAULT 'fact' CHECK (kind IN ('fact', 'decision', 'progress_note')),
  content TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'session' CHECK (source IN ('session', 'operator', 'founder', 'outcome')),
  importance REAL DEFAULT 0.5,
  embedding vector(1024),
  archived BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX company_memory_company_idx ON company_memory(company_id);
CREATE INDEX company_memory_embedding_idx ON company_memory
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);

-- Outcome logs
CREATE TABLE outcome_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id),
  company_id UUID NOT NULL REFERENCES companies(id),
  logged_by UUID REFERENCES users(id),
  outcome TEXT NOT NULL CHECK (outcome IN ('pitched', 'won', 'lost', 'stalled')),
  what_actually_came_up TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Refinement proposals
CREATE TABLE refinement_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id),
  board_member_id UUID NOT NULL REFERENCES board_members(id),
  source_session_ids JSONB DEFAULT '[]',
  proposal TEXT NOT NULL,
  rationale TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  decided_by UUID REFERENCES users(id),
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- App events (audit + analytics)
CREATE TABLE app_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES orgs(id),
  user_id UUID REFERENCES users(id),
  event TEXT NOT NULL,
  props JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =========== ROW LEVEL SECURITY ===========

-- Org-scoped isolation
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies FORCE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON companies FOR ALL
  USING (org_id = current_setting('app.org_id', true)::uuid);
CREATE POLICY founder_scope ON companies FOR SELECT
  USING (
    current_setting('app.company_scope', true) = 'all'
    OR id = current_setting('app.company_scope', true)::uuid
  );

ALTER TABLE board_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_members FORCE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON board_members FOR ALL
  USING (org_id = current_setting('app.org_id', true)::uuid);

ALTER TABLE board_member_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_member_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON board_member_versions FOR ALL
  USING (
    board_member_id IN (SELECT id FROM board_members WHERE org_id = current_setting('app.org_id', true)::uuid)
  );

ALTER TABLE review_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON review_sessions FOR ALL
  USING (org_id = current_setting('app.org_id', true)::uuid);
CREATE POLICY founder_scope ON review_sessions FOR SELECT
  USING (
    current_setting('app.company_scope', true) = 'all'
    OR company_id = current_setting('app.company_scope', true)::uuid
  );

ALTER TABLE session_takes ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_takes FORCE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON session_takes FOR ALL
  USING (
    session_id IN (SELECT id FROM review_sessions WHERE org_id = current_setting('app.org_id', true)::uuid)
  );

ALTER TABLE objections ENABLE ROW LEVEL SECURITY;
ALTER TABLE objections FORCE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON objections FOR ALL
  USING (org_id = current_setting('app.org_id', true)::uuid);
CREATE POLICY founder_scope ON objections FOR SELECT
  USING (
    current_setting('app.company_scope', true) = 'all'
    OR company_id = current_setting('app.company_scope', true)::uuid
  );

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents FORCE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON documents FOR ALL
  USING (org_id = current_setting('app.org_id', true)::uuid);
CREATE POLICY founder_scope ON documents FOR SELECT
  USING (
    current_setting('app.company_scope', true) = 'all'
    OR company_id = current_setting('app.company_scope', true)::uuid
  );

ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks FORCE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON document_chunks FOR ALL
  USING (
    document_id IN (SELECT id FROM documents WHERE org_id = current_setting('app.org_id', true)::uuid)
  );

ALTER TABLE company_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_memory FORCE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON company_memory FOR ALL
  USING (org_id = current_setting('app.org_id', true)::uuid);
CREATE POLICY founder_scope ON company_memory FOR SELECT
  USING (
    current_setting('app.company_scope', true) = 'all'
    OR company_id = current_setting('app.company_scope', true)::uuid
  );

ALTER TABLE outcome_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE outcome_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON outcome_logs FOR ALL
  USING (org_id = current_setting('app.org_id', true)::uuid);

ALTER TABLE refinement_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE refinement_proposals FORCE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON refinement_proposals FOR ALL
  USING (org_id = current_setting('app.org_id', true)::uuid);

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_orgs_updated BEFORE UPDATE ON orgs FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_companies_updated BEFORE UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_board_members_updated BEFORE UPDATE ON board_members FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_review_sessions_updated BEFORE UPDATE ON review_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_objections_updated BEFORE UPDATE ON objections FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_documents_updated BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_company_memory_updated BEFORE UPDATE ON company_memory FOR EACH ROW EXECUTE FUNCTION update_updated_at();
