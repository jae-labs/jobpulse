-- Keep extension helper functions outside the exposed public API schema.
-- Existing indexes retain their operator-class dependencies by OID.
ALTER EXTENSION pg_trgm SET SCHEMA extensions;
