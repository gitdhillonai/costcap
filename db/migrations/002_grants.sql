GRANT USAGE ON SCHEMA public TO costcap_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON orgs, users TO costcap_app;
REVOKE CREATE ON SCHEMA public FROM costcap_app;
