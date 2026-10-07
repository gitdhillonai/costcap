// Fails closed. Does not call a DNS provider and does not register a domain.
if (!process.env.COSTCAP_DNS_TOKEN) {
  console.error("dns: COSTCAP_DNS_TOKEN is missing; no DNS API was called");
  process.exit(2);
}
console.error("dns: no DNS API was called");
process.exit(2);
