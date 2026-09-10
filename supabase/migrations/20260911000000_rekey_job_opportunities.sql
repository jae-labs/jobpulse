-- Re-key historical opportunities to the scraper's URL-based identity.
-- The temporary key phase prevents unique-index collisions while re-keying.
-- For any duplicate canonical URL, retain the newest and most complete row.

CREATE TEMP TABLE jobpulse_rekey AS
SELECT
    id,
    md5(
        btrim(regexp_replace(
            regexp_replace(
                lower(company),
                '\\m(ireland|limited|ltd|plc|dac|inc|corp|corporation|group|llc|holdings|company|co)\\M',
                '',
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

CREATE TEMP TABLE jobpulse_keep AS
SELECT DISTINCT ON (new_dedupe_key) id, new_dedupe_key
FROM jobpulse_rekey r
JOIN public.jobs j USING (id)
ORDER BY new_dedupe_key, j.last_seen_at DESC NULLS LAST, length(j.description) DESC;

UPDATE public.jobs
SET dedupe_key = 'legacy:' || id::text;

DELETE FROM public.jobs j
USING jobpulse_rekey r
WHERE j.id = r.id
  AND NOT EXISTS (SELECT 1 FROM jobpulse_keep k WHERE k.id = j.id);

UPDATE public.jobs j
SET dedupe_key = k.new_dedupe_key
FROM jobpulse_keep k
WHERE j.id = k.id;
