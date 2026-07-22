-- ILLUSTRATIVE SEED DATA
-- These are template seats for a healthcare buying committee.
-- They are generic starting points - operators should customize or replace them.

-- Note: This requires an org to already exist. Run after bootstrapping the first operator.
-- In practice, the seed runs automatically when an org is created, or via the import endpoint.

-- Template board members (generic healthcare buying committee)
-- These will be loaded via POST /api/board-members/import with the JSON below.
-- This SQL is here for reference and direct DB seeding if needed.

-- For the import endpoint, use docs/import-format.md JSON.

-- ILLUSTRATIVE demo company (for smoke testing only)
-- INSERT INTO companies (org_id, name, one_liner, target_buyer, stage)
-- VALUES (
--   '<ORG_ID>',
--   'Meridian Clinical AI',
--   'AI-powered clinical decision support for emergency departments',
--   'Health system CIOs and CMIOs evaluating AI tools for ED triage',
--   'intake'
-- );
