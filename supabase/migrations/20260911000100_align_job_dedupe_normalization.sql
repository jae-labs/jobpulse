-- Align stored opportunity keys with database.repository.normalized_key().
-- This pass corrects the earlier over-escaped PostgreSQL word-boundary regex.

CREATE TEMP TABLE jobpulse_aligned_rekey AS
SELECT
    id,
    md5(
        btrim(regexp_replace(
            regexp_replace(
                lower(company),
                '\m(ireland|limited|ltd|plc|dac|inc|corp|corporation|group|llc|holdings|company|co)\M',
                ' ',
                'g'
            ),
            '[^a-z0-9]+',
            ' ',
            'g'
        ))
        || '::url::'
        || lower(regexp_replace(regexp_replace(url, '[?#].*$', ''), '/+$', ''))
    ) AS new_dedupe_key
FROM public.jobs;

CREATE TEMP TABLE jobpulse_aligned_keep AS
SELECT DISTINCT ON (new_dedupe_key) id, new_dedupe_key
FROM jobpulse_aligned_rekey r
JOIN public.jobs j USING (id)
ORDER BY new_dedupe_key, j.last_seen_at DESC NULLS LAST, length(j.description) DESC;

UPDATE public.jobs
SET dedupe_key = 'legacy-align:' || id::text;

DELETE FROM public.jobs j
USING jobpulse_aligned_rekey r
WHERE j.id = r.id
  AND NOT EXISTS (SELECT 1 FROM jobpulse_aligned_keep k WHERE k.id = j.id);

UPDATE public.jobs j
SET dedupe_key = k.new_dedupe_key
FROM jobpulse_aligned_keep k
WHERE j.id = k.id;
