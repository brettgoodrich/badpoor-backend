import { createHash } from "node:crypto";
import { readShopifyAuth, ShopifyTokenCache, type TokenFetch } from "./token";

const MUTATION_PATTERN = /\bmutation\b/i;

const globalForToken = globalThis as unknown as {
  shopifyTokenCache?: ShopifyTokenCache;
  shopifyTokenCacheKey?: string;
};

export function shopifyConfigured() {
  return readShopifyAuth().mode !== "missing";
}

export function shopifySetupMessage() {
  const auth = readShopifyAuth();
  return auth.mode === "missing" ? auth.message : null;
}

export function assertReadOnlyQuery(query: string) {
  const withoutComments = query.replace(/#[^\n]*/g, "").replace(/"""[\s\S]*?"""/g, "");
  if (MUTATION_PATTERN.test(withoutComments)) {
    throw new Error("Refusing to send a Shopify mutation. This app only reads orders and products.");
  }
}

function apiVersion() {
  return process.env.SHOPIFY_API_VERSION?.trim() || "2026-10";
}

function clientCache(shopDomain: string, clientId: string, clientSecret: string) {
  const key = `${shopDomain}|${clientId}|${createHash("sha256").update(clientSecret).digest("hex")}`;
  if (!globalForToken.shopifyTokenCache || globalForToken.shopifyTokenCacheKey !== key) {
    globalForToken.shopifyTokenCache = new ShopifyTokenCache({ shopDomain, clientId, clientSecret });
    globalForToken.shopifyTokenCacheKey = key;
  }
  return globalForToken.shopifyTokenCache;
}

export async function executeAdminQuery<T>(options: {
  shopDomain: string;
  apiVersion: string;
  query: string;
  variables?: Record<string, unknown>;
  getAccessToken: (force?: boolean) => Promise<string>;
  fetchImpl?: TokenFetch;
  canRefresh?: boolean;
}): Promise<T> {
  assertReadOnlyQuery(options.query);
  const fetchImpl = options.fetchImpl ?? fetch;
  let token = await options.getAccessToken(false);
  let refreshed = false;

  for (;;) {
    const response = await fetchImpl(
      `https://${options.shopDomain}/admin/api/${options.apiVersion}/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": token,
        },
        body: JSON.stringify({ query: options.query, variables: options.variables }),
        cache: "no-store",
      },
    );

    if (response.status === 401 && options.canRefresh && !refreshed) {
      refreshed = true;
      token = await options.getAccessToken(true);
      continue;
    }

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
}

export async function shopifyAdmin<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const auth = readShopifyAuth();
  if (auth.mode === "missing") throw new Error(auth.message);

  const override = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN?.trim();
  const cache = auth.mode === "client" ? clientCache(auth.shopDomain, auth.clientId, auth.clientSecret) : null;

  return executeAdminQuery<T>({
    shopDomain: auth.shopDomain,
    apiVersion: apiVersion(),
    query,
    variables,
    canRefresh: auth.mode === "client",
    getAccessToken: async (force) => {
      if (auth.mode === "override") {
        if (!override) throw new Error("SHOPIFY_ADMIN_ACCESS_TOKEN is missing.");
        return override;
      }
      if (!cache) throw new Error("Shopify client credentials are missing.");
      if (force) cache.invalidate();
      return cache.getAccessToken(Boolean(force));
    },
  });
}
