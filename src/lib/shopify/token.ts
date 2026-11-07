/**
 * Client credentials grant for a Dev Dashboard app.
 * https://shopify.dev/docs/apps/build/authentication-authorization/client-credentials-grant
 * https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens
 *
 * The token stays in memory. It is never written to the database, logs, or error text.
 * Refresh by requesting the grant again; this grant does not return a refresh token.
 */

export const TOKEN_REFRESH_SKEW_MS = 60_000;

const SHOP_DOMAIN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;

export type ShopifyAuth =
  | { mode: "override"; shopDomain: string }
  | { mode: "client"; shopDomain: string; clientId: string; clientSecret: string }
  | { mode: "missing"; message: string };

export function shopDomainFrom(raw: string) {
  const domain = raw.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!SHOP_DOMAIN.test(domain)) {
    throw new Error("SHOPIFY_STORE_DOMAIN must look like your-store.myshopify.com");
  }
  return domain;
}

export function readShopifyAuth(
  env: Record<string, string | undefined> = process.env,
): ShopifyAuth {
  const domainRaw = env.SHOPIFY_STORE_DOMAIN?.trim() ?? "";
  const override = env.SHOPIFY_ADMIN_ACCESS_TOKEN?.trim() ?? "";
  const clientId = env.SHOPIFY_CLIENT_ID?.trim() ?? "";
  const clientSecret = env.SHOPIFY_CLIENT_SECRET?.trim() ?? "";

  if (!domainRaw) {
    return {
      mode: "missing",
      message:
        "Add SHOPIFY_STORE_DOMAIN and either SHOPIFY_CLIENT_ID plus SHOPIFY_CLIENT_SECRET, or a legacy SHOPIFY_ADMIN_ACCESS_TOKEN, to .env before syncing. Sample data works without them.",
    };
  }

  let shopDomain: string;
  try {
    shopDomain = shopDomainFrom(domainRaw);
  } catch (error) {
    return {
      mode: "missing",
      message: error instanceof Error ? error.message : "SHOPIFY_STORE_DOMAIN is invalid.",
    };
  }

  if (override) return { mode: "override", shopDomain };
  if (clientId && clientSecret) return { mode: "client", shopDomain, clientId, clientSecret };
  return {
    mode: "missing",
    message:
      "Add SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET from the Dev Dashboard, or set SHOPIFY_ADMIN_ACCESS_TOKEN for a legacy static token. Sample data works without them.",
  };
}

export type TokenFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

type CachedToken = {
  accessToken: string;
  expiresAt: number;
};

export class ShopifyTokenCache {
  private cached: CachedToken | null = null;
  private inflight: Promise<string> | null = null;

  constructor(
    private readonly options: {
      shopDomain: string;
      clientId: string;
      clientSecret: string;
      fetchImpl?: TokenFetch;
      now?: () => number;
      refreshSkewMs?: number;
    },
  ) {}

  invalidate() {
    this.cached = null;
  }

  async getAccessToken(force = false): Promise<string> {
    const now = this.options.now?.() ?? Date.now();
    const skew = this.options.refreshSkewMs ?? TOKEN_REFRESH_SKEW_MS;
    if (!force && this.cached && this.cached.expiresAt - now > skew) {
      return this.cached.accessToken;
    }
    if (!force && this.inflight) return this.inflight;

    const request = this.loadToken(now).finally(() => {
      if (this.inflight === request) this.inflight = null;
    });
    this.inflight = request;
    return request;
  }

  private async loadToken(startedAt: number): Promise<string> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const shop = this.options.shopDomain;
    let response: Response;
    try {
      response = await fetchImpl(`https://${shop}/admin/oauth/access_token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: this.options.clientId,
          client_secret: this.options.clientSecret,
        }),
        cache: "no-store",
      });
    } catch {
      throw new Error("Could not reach Shopify to request an access token.");
    }

    const payload = await readJson(response);
    if (!response.ok) {
      throw new Error(tokenErrorMessage(response.status, payload));
    }

    const accessToken = stringField(payload, "access_token");
    const expiresIn = numberField(payload, "expires_in");
    if (!accessToken || expiresIn === null || expiresIn <= 0) {
      throw new Error("Shopify token response did not include an access token and expiry.");
    }

    this.cached = {
      accessToken,
      expiresAt: startedAt + expiresIn * 1000,
    };
    return accessToken;
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function stringField(payload: unknown, key: string) {
  if (!payload || typeof payload !== "object" || !(key in payload)) return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberField(payload: unknown, key: string) {
  if (!payload || typeof payload !== "object" || !(key in payload)) return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function tokenErrorMessage(status: number, payload: unknown) {
  const error = stringField(payload, "error");
  const description = stringField(payload, "error_description") ?? "";
  if (error === "shop_not_permitted" || description.toLowerCase().includes("shop_not_permitted")) {
    return "Shopify refused the client credentials grant (shop_not_permitted). The app and the store are not in the same organization. Both must appear under the same org in the Dev Dashboard.";
  }
  if (error) {
    const detail = description ? ` ${description}` : "";
    return `Shopify token request failed (${error}).${detail}`;
  }
  return `Shopify token request failed with HTTP ${status}.`;
}
