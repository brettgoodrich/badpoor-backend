const MUTATION_PATTERN = /\bmutation\b/i;

export function shopifyConfigured() {
  return Boolean(process.env.SHOPIFY_STORE_DOMAIN?.trim() && process.env.SHOPIFY_ADMIN_ACCESS_TOKEN?.trim());
}

export function shopifySetupMessage() {
  if (shopifyConfigured()) return null;
  return "Add SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_ACCESS_TOKEN to .env before syncing. Sample data works without a token.";
}

function storeDomain() {
  const raw = process.env.SHOPIFY_STORE_DOMAIN?.trim() ?? "";
  const domain = raw.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(domain)) {
    throw new Error("SHOPIFY_STORE_DOMAIN must look like your-store.myshopify.com");
  }
  return domain;
}

function apiVersion() {
  return process.env.SHOPIFY_API_VERSION?.trim() || "2026-10";
}

export function assertReadOnlyQuery(query: string) {
  const withoutComments = query.replace(/#[^\n]*/g, "").replace(/"""[\s\S]*?"""/g, "");
  if (MUTATION_PATTERN.test(withoutComments)) {
    throw new Error("Refusing to send a Shopify mutation. This app only reads orders and products.");
  }
}

export async function shopifyAdmin<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  assertReadOnlyQuery(query);
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN?.trim();
  if (!token) {
    throw new Error("SHOPIFY_ADMIN_ACCESS_TOKEN is missing.");
  }

  const response = await fetch(`https://${storeDomain()}/admin/api/${apiVersion()}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Shopify Admin API responded with HTTP ${response.status}.`);
  }

  const body = (await response.json()) as {
    data?: T;
    errors?: { message: string }[];
  };

  if (body.errors?.length) {
    throw new Error(body.errors.map((error) => error.message).join("; "));
  }
  if (!body.data) {
    throw new Error("Shopify Admin API returned no data.");
  }
  return body.data;
}
