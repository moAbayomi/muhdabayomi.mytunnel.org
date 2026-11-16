CREATE TABLE login_attempts (
  ip  text        NOT NULL,
  at  timestamptz NOT NULL DEFAULT now()
);

-- The only query pattern is "count this IP's recent attempts", so:
-- (ip, at DESC) makes it an index scan, not a full table scan.
CREATE INDEX login_attempts_ip_at_idx ON login_attempts (ip, at DESC);


