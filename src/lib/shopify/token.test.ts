import { afterEach, describe, expect, it, vi } from "vitest";
import { executeAdminQuery } from "./client";
import { readShopifyAuth, ShopifyTokenCache, type TokenFetch } from "./token";

const shop = "feb098-c4.myshopify.com";
const secret = "client-secret-value";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function tokenResponse(accessToken: string, expiresIn = 86399) {
  return jsonResponse({
    access_token: accessToken,
    scope: "read_orders,read_products",
    expires_in: expiresIn,
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("readShopifyAuth", () => {
  it("prefers a static token when one is set", () => {
    expect(
      readShopifyAuth({
        SHOPIFY_STORE_DOMAIN: shop,
        SHOPIFY_ADMIN_ACCESS_TOKEN: "shpat_legacy",
        SHOPIFY_CLIENT_ID: "id",
        SHOPIFY_CLIENT_SECRET: secret,
      }),
    ).toEqual({ mode: "override", shopDomain: shop });
  });

  it("uses client credentials when there is no static token", () => {
    expect(
      readShopifyAuth({
        SHOPIFY_STORE_DOMAIN: `https://${shop}/admin`,
        SHOPIFY_CLIENT_ID: "client-id",
        SHOPIFY_CLIENT_SECRET: secret,
      }),
    ).toEqual({
      mode: "client",
      shopDomain: shop,
      clientId: "client-id",
      clientSecret: secret,
    });
  });

  it("says what is missing without echoing a secret", () => {
    const auth = readShopifyAuth({ SHOPIFY_STORE_DOMAIN: shop, SHOPIFY_CLIENT_SECRET: secret });
    expect(auth.mode).toBe("missing");
    if (auth.mode === "missing") {
      expect(auth.message).toContain("SHOPIFY_CLIENT_ID");
      expect(auth.message).not.toContain(secret);
    }
  });
});

describe("ShopifyTokenCache", () => {
  it("posts the client credentials grant and omits a scope parameter", async () => {
    const fetchImpl = vi.fn<TokenFetch>(async () => tokenResponse("token-1"));
    const cache = new ShopifyTokenCache({
      shopDomain: shop,
      clientId: "client-id",
      clientSecret: secret,
      fetchImpl,
      now: () => 0,
    });

    await expect(cache.getAccessToken()).resolves.toBe("token-1");

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe(`https://${shop}/admin/oauth/access_token`);
    expect(init?.method).toBe("POST");
    const headers = new Headers(init?.headers);
    expect(headers.get("Content-Type")).toBe("application/x-www-form-urlencoded");
    const params = new URLSearchParams(String(init?.body));
    expect(params.get("grant_type")).toBe("client_credentials");
    expect(params.get("client_id")).toBe("client-id");
    expect(params.get("client_secret")).toBe(secret);
    expect(params.has("scope")).toBe(false);
  });

  it("reuses a token until shortly before it expires", async () => {
    let now = 0;
    const fetchImpl = vi.fn<TokenFetch>(async () => tokenResponse("token-1", 100));
    const cache = new ShopifyTokenCache({
      shopDomain: shop,
      clientId: "client-id",
      clientSecret: secret,
      fetchImpl,
      now: () => now,
      refreshSkewMs: 10_000,
    });

    await cache.getAccessToken();
    now = 89_000;
    await expect(cache.getAccessToken()).resolves.toBe("token-1");
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    now = 90_000;
    fetchImpl.mockImplementation(async () => tokenResponse("token-2", 100));
    await expect(cache.getAccessToken()).resolves.toBe("token-2");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("shares one in-flight token request", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetchImpl = vi.fn<TokenFetch>(async () => {
      await gate;
      return tokenResponse("token-shared");
    });
    const cache = new ShopifyTokenCache({
      shopDomain: shop,
      clientId: "client-id",
      clientSecret: secret,
      fetchImpl,
      now: () => 0,
    });

    const pending = Promise.all([cache.getAccessToken(), cache.getAccessToken()]);
    release();
    await expect(pending).resolves.toEqual(["token-shared", "token-shared"]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("explains shop_not_permitted without returning the secret", async () => {
    const fetchImpl = vi.fn<TokenFetch>(async () =>
      jsonResponse(
        {
          error: "shop_not_permitted",
          error_description: "Client credentials cannot be performed on this shop.",
        },
        400,
      ),
    );
    const cache = new ShopifyTokenCache({
      shopDomain: shop,
      clientId: "client-id",
      clientSecret: secret,
      fetchImpl,
      now: () => 0,
    });

    await expect(cache.getAccessToken()).rejects.toThrow(/same organization/);
    await expect(cache.getAccessToken()).rejects.not.toThrow(secret);
  });
});

describe("executeAdminQuery", () => {
  it("refreshes the token once after a 401 and does not send the secret", async () => {
    const tokens = ["expired-token", "fresh-token"];
    const getAccessToken = vi.fn(async (force?: boolean) => {
      if (force) return tokens[1] ?? "fresh-token";
      return tokens[0] ?? "expired-token";
    });
    let graphqlCalls = 0;
    const fetchImpl = vi.fn<TokenFetch>(async () => {
      graphqlCalls += 1;
      if (graphqlCalls === 1) return new Response("nope", { status: 401 });
      return jsonResponse({ data: { shop: { name: "HZN" } } });
    });

    await expect(
      executeAdminQuery<{ shop: { name: string } }>({
        shopDomain: shop,
        apiVersion: "2026-10",
        query: "query { shop { name } }",
        getAccessToken,
        fetchImpl,
        canRefresh: true,
      }),
    ).resolves.toEqual({ shop: { name: "HZN" } });

    expect(getAccessToken).toHaveBeenNthCalledWith(1, false);
    expect(getAccessToken).toHaveBeenNthCalledWith(2, true);
    const secondCall = fetchImpl.mock.calls[1]?.[1];
    const headers = new Headers(secondCall?.headers);
    expect(headers.get("X-Shopify-Access-Token")).toBe("fresh-token");
    expect(JSON.stringify(secondCall)).not.toContain(secret);
  });

  it("does not refresh a static token after a 401", async () => {
    const getAccessToken = vi.fn(async () => "shpat_static");
    const fetchImpl = vi.fn<TokenFetch>(async () => new Response("nope", { status: 401 }));

    await expect(
      executeAdminQuery({
        shopDomain: shop,
        apiVersion: "2026-10",
        query: "query { shop { name } }",
        getAccessToken,
        fetchImpl,
        canRefresh: false,
      }),
    ).rejects.toThrow(/HTTP 401/);
    expect(getAccessToken).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
