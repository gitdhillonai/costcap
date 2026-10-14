CREATE TABLE orgs (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES orgs (id),
  email text NOT NULL UNIQUE,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'viewer'))
);

ALTER TABLE orgs ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY orgs_tenant ON orgs
  FOR ALL
  USING (id = current_setting('app.org_id', true)::uuid)
  WITH CHECK (id = current_setting('app.org_id', true)::uuid);

CREATE POLICY users_tenant ON users
  FOR ALL
  USING (org_id = current_setting('app.org_id', true)::uuid)
  WITH CHECK (org_id = current_setting('app.org_id', true)::uuid);

ALTER TABLE orgs OWNER TO costcap_migrate;
ALTER TABLE users OWNER TO costcap_migrate;
