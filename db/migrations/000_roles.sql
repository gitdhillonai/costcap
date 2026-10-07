DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'costcap_migrate') THEN
    CREATE ROLE costcap_migrate NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'costcap_app') THEN
    CREATE ROLE costcap_app NOLOGIN;
  END IF;
END $$;
