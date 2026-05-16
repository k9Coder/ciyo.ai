ALTER TABLE rules ADD COLUMN destination_group_ids uuid[] NOT NULL DEFAULT '{}';

CREATE TABLE destination_groups (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id),
  division_id  uuid REFERENCES divisions(id),
  team_id      uuid REFERENCES teams(id),
  name         text NOT NULL,
  domains      text[] NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON destination_groups(tenant_id);
