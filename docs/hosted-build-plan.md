# Hosted implementation boundary

The client and delivery adapter have local tests. No hosted server/UI, tenant
RLS, auth wiring or production database has been verified. No schema draft or client implementation counts as a finished multi-tenant
service. Do not close #11/#12/#14 on local helper evidence.

## Required next sequence

1. Own database/role on authorized existing infrastructure. Application role
   must not own tables or bypass RLS; migration role stays separate.
2. Verified-email session auth, Turnstile server verification and invitation
   acceptance. Matching email domains alone must not admit a user to an existing
   organization. First signup creates a new org; established orgs require an
   admin-approved invite even if email domain matches.
3. Tenant-scoped endpoints, integration isolation tests, roles and CSRF checks.
   Enrollment tokens are one-use, expire, and are issued only by verified admins.
4. Durable idempotent policy/receipt/audit transactions. Acknowledgments come
   only after committed receipt writes. Version increments must be atomic.
5. Alert outbox with retries, dedupe and delivery audit. Provider HTTP acceptance
   is not inbox delivery. Actual live authorized recipient testing is separate.
6. Dashboard pixels, authentication, role isolation and end-to-end deployment
   verification. No charged billing. Free beta until the product works.
7. Fleet dogfood run and 14-day actual receipts. No tests in client organizations.

External effects remain a separate execution step. Test files use reserved
example.invalid identities and mocked fetch, not real recipients.
