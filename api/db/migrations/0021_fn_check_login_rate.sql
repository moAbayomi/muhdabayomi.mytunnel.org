CREATE OR REPLACE FUNCTION check_login_rate(
  p_ip           text,
  p_max_attempts int DEFAULT 5,
  p_window_secs  int DEFAULT 900   -- 15 minutes
) RETURNS TABLE (
  allowed              boolean,
  failure_count        int,
  retry_after_seconds  int
)
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  v_count  int;
  v_oldest timestamptz;
BEGIN
  -- Clean this IP's expired rows first, so the check and future inserts
  -- stay lean. Only touches this IP's rows (indexed), so it's cheap.
  DELETE FROM login_attempts
  WHERE ip = p_ip
    AND at < now() - make_interval(secs => p_window_secs);

  SELECT count(*), min(at)
  INTO v_count, v_oldest
  FROM login_attempts
  WHERE ip = p_ip
    AND at >= now() - make_interval(secs => p_window_secs);

  RETURN QUERY SELECT
    v_count < p_max_attempts,
    v_count,
    CASE
      WHEN v_count < p_max_attempts THEN 0
      -- Seconds until the oldest failure in the window expires.
      -- Upper bound: if no expiry is known, fall back to the full window.
      WHEN v_oldest IS NULL THEN p_window_secs
      ELSE GREATEST(
        0,
        p_window_secs
          - EXTRACT(EPOCH FROM (now() - v_oldest))::int
      )
    END;
END $$;