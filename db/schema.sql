-- Created automatically by api/_lib/db.js on first use. Kept here for reference.
-- Only anonymous data: no name, address or street; the CEP lives at most 2 days in
-- recent_quote_ceps, to tie a WhatsApp confirmation to the city of its quote.

CREATE TABLE IF NOT EXISTS site_events (
  id bigserial PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  kind text NOT NULL CHECK (kind IN ('quote', 'confirm')),
  uf text,
  city text,
  round_trip_km numeric(8, 1),
  hours numeric(6, 2),
  total_brl numeric(12, 2)
);

CREATE INDEX IF NOT EXISTS site_events_created_at_idx ON site_events (created_at);

CREATE TABLE IF NOT EXISTS recent_quote_ceps (
  cep text PRIMARY KEY,
  uf text,
  city text,
  seen_at timestamptz NOT NULL DEFAULT now()
);
