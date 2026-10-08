-- Whole-board ATS responses have a fixed sixteen-MiB replay ceiling.
ALTER TABLE public.crawl_snapshots DROP CONSTRAINT crawl_snapshots_body_bytes_check;
ALTER TABLE public.crawl_snapshots ADD CONSTRAINT crawl_snapshots_body_bytes_check CHECK(body_bytes BETWEEN 0 AND 16777216);
