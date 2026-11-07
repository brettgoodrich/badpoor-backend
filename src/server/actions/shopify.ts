"use server";

import { redirectWith, refreshShop } from "@/lib/action";
import { shopifySetupMessage } from "@/lib/shopify/client";
import { syncShopifyCatalog } from "@/lib/shopify/sync";

export async function syncShopify() {
  const setup = shopifySetupMessage();
  if (setup) redirectWith("/orders", "error", setup);

  try {
    const summary = await syncShopifyCatalog();
    refreshShop();
    redirectWith(
      "/orders",
      "notice",
      `Synced ${summary.orders} open orders, ${summary.lineItems} line items, and ${summary.products} products (${summary.variants} variants). Shopify was not changed.`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Shopify sync failed.";
    redirectWith("/orders", "error", message);
  }
}
