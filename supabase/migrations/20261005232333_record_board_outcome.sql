-- Forward migration: atomic board crawl health.
--
-- A crawl outcome is recorded in one statement so concurrent workers cannot
-- lose an increment, and the backoff lives at the database boundary. Success
-- self-heals (resets failures, clears cooldown) and promotes a proven pending
-- board to active. Failure increments and cools the board down:
--   no cooldown below 3 consecutive failures, then 6h * 2^(f-3), capped at 24h.
CREATE FUNCTION public.record_board_outcome(
  p_board_id bigint,
  p_success boolean,
  p_ingested integer DEFAULT 0,
  p_error text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required';
  END IF;
  IF p_board_id IS NULL OR p_success IS NULL THEN
    RAISE EXCEPTION 'Invalid board outcome' USING ERRCODE = '22023';
  END IF;

  UPDATE public.boards SET
    last_crawled_at = now(),
    updated_at = now(),
    last_error = CASE WHEN p_success THEN NULL ELSE left(coalesce(p_error, ''), 1000) END,
    last_ingested_count = CASE WHEN p_success THEN greatest(coalesce(p_ingested, 0), 0) ELSE last_ingested_count END,
    consecutive_failures = CASE WHEN p_success THEN 0 ELSE consecutive_failures + 1 END,
    last_verified_at = CASE WHEN p_success THEN now() ELSE last_verified_at END,
    status = CASE WHEN p_success AND status = 'pending' THEN 'active' ELSE status END,
    cooldown_until = CASE
      WHEN p_success THEN NULL
      WHEN consecutive_failures + 1 >= 3
        THEN now() + make_interval(hours => least(24, (6 * power(2, least(consecutive_failures + 1 - 3, 8)))::integer))
      ELSE NULL
    END
  WHERE id = p_board_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown board %', p_board_id USING ERRCODE = 'P0002';
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.record_board_outcome(bigint, boolean, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_board_outcome(bigint, boolean, integer, text) TO service_role;
