// Public-discovery files for the landing. Search controls are not access control.
// IndexNow is omitted: it needs an owner key (residue).

export const PUBLIC_ORIGIN = "https://costcap.dev";
export const CONTENT_LASTMOD = "2026-10-09";

// Single allowlist for sitemap, canonical, and structured data.
export const PUBLIC_ROUTES = Object.freeze([
  Object.freeze({ path: "/", priority: 1.0, changefreq: "weekly" }),
]);

const DESCRIPTION = "Free beta spend guardrails for your AI agent fleet. Guardrails, not guarantees.";

export function canonicalOrigin(origin = PUBLIC_ORIGIN) {
  const url = new URL(origin);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("origin must be http(s)");
  return `${url.protocol}//${url.host}`;
}

export function absoluteUrl(origin, path) {
  const base = canonicalOrigin(origin);
  if (path === "/" || path === "") return base;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`.replace(/\/$/, "");
}

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function robotsTxt(origin = PUBLIC_ORIGIN) {
  const base = canonicalOrigin(origin);
  return [
    "User-agent: *",
    "Allow: /",
    "Disallow: /auth/",
    "Disallow: /v1/",
    "Disallow: /health",
    "Disallow: /ui/",
    "",
    `Sitemap: ${base}/sitemap.xml`,
    "",
  ].join("\n");
}

export function sitemapXml(origin = PUBLIC_ORIGIN, lastmod = CONTENT_LASTMOD) {
  const base = canonicalOrigin(origin);
  const urls = PUBLIC_ROUTES.map((route) => {
    const loc = xmlEscape(absoluteUrl(base, route.path));
    return [
      "  <url>",
      `    <loc>${loc}</loc>`,
      `    <lastmod>${xmlEscape(lastmod)}</lastmod>`,
      `    <changefreq>${xmlEscape(route.changefreq)}</changefreq>`,
      `    <priority>${route.priority.toFixed(1)}</priority>`,
      "  </url>",
    ].join("\n");
  }).join("\n");
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urls,
    "</urlset>",
    "",
  ].join("\n");
}

export function jsonLd(origin = PUBLIC_ORIGIN) {
  const url = absoluteUrl(origin, "/");
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        name: "CostCap",
        url,
        description: DESCRIPTION,
      },
      {
        "@type": "SoftwareApplication",
        name: "CostCap",
        applicationCategory: "DeveloperApplication",
        operatingSystem: "Any",
        url,
        description: DESCRIPTION,
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      },
    ],
  };
}

export function jsonLdScript(origin = PUBLIC_ORIGIN) {
  return JSON.stringify(jsonLd(origin)).replace(/</g, "\\u003c");
}
