-- RLS governs rows, but cannot constrain TRUNCATE or schema-level privileges.
-- Preserve the existing DML/RLS contracts; never give browser roles maintenance access.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;
-- Future browser access is explicitly granted and classified in the tenant contract.
