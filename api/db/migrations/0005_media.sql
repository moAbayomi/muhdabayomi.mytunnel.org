CREATE TABLE media (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  r2_key     text NOT NULL UNIQUE,
  url        text NOT NULL,
  mime       text NOT NULL,
  bytes      bigint NOT NULL,
  width      int,
  height     int,
  alt        text,
  created_at timestamptz NOT NULL DEFAULT now()
);