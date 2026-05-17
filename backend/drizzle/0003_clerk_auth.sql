ALTER TABLE tenants ADD COLUMN clerk_org_id text UNIQUE;

ALTER TABLE members
  ADD COLUMN clerk_id    text UNIQUE,
  ADD COLUMN first_name  text,
  ADD COLUMN last_name   text,
  ADD COLUMN avatar_url  text;

CREATE TABLE site_configs (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES tenants(id),
  domain               text NOT NULL,
  input_selector       text NOT NULL,
  send_button_selector text NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, domain)
);
