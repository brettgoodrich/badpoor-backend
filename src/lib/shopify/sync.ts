import { openDatabase } from "@/lib/db/client";
import {
  shopifyLineItems,
  shopifyOrders,
  shopifyProducts,
  shopifyVariants,
} from "@/lib/db/schema";
import { shopifyAdmin } from "./client";
import {
  OPEN_ORDERS_QUERY,
  ORDER_LINE_ITEMS_QUERY,
  PRODUCT_VARIANTS_QUERY,
  PRODUCTS_QUERY,
} from "./queries";
import type {
  OpenOrdersData,
  OrderLineItemsData,
  PageInfo,
  ProductVariantsData,
  ProductsData,
  ShopifyLineNode,
  ShopifyOrderNode,
  ShopifyProductNode,
  ShopifyVariantNode,
} from "./types";

const MAX_PAGES = 40;

async function eachPage<T>(
  load: (cursor: string | null) => Promise<{ pageInfo: PageInfo; nodes: T[] }>,
) {
  const nodes: T[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await load(cursor);
    nodes.push(...result.nodes);
    if (!result.pageInfo.hasNextPage || !result.pageInfo.endCursor) return nodes;
    cursor = result.pageInfo.endCursor;
  }
  throw new Error("Shopify pagination exceeded 40 pages. Narrow the sync and try again.");
}

async function fetchOrders() {
  const orders = await eachPage(async (cursor) => {
    const data = await shopifyAdmin<OpenOrdersData>(OPEN_ORDERS_QUERY, { cursor });
    return data.orders;
  });

  for (const order of orders) {
    if (!order.lineItems.pageInfo.hasNextPage) continue;
    const rest = await eachPage(async (cursor) => {
      const data = await shopifyAdmin<OrderLineItemsData>(ORDER_LINE_ITEMS_QUERY, {
        id: order.id,
        cursor,
      });
      if (!data.order) throw new Error(`Shopify order ${order.name} disappeared during sync.`);
      return data.order.lineItems;
    });
    const seen = new Set(order.lineItems.nodes.map((line) => line.id));
    for (const line of rest) {
      if (!seen.has(line.id)) order.lineItems.nodes.push(line);
    }
  }

  return orders;
}

async function fetchProducts() {
  const products = await eachPage(async (cursor) => {
    const data = await shopifyAdmin<ProductsData>(PRODUCTS_QUERY, { cursor });
    return data.products;
  });

  for (const product of products) {
    if (!product.variants.pageInfo.hasNextPage) continue;
    const rest = await eachPage(async (cursor) => {
      const data = await shopifyAdmin<ProductVariantsData>(PRODUCT_VARIANTS_QUERY, {
        id: product.id,
        cursor,
      });
      if (!data.product) throw new Error(`Shopify product ${product.title} disappeared during sync.`);
      return data.product.variants;
    });
    const seen = new Set(product.variants.nodes.map((variant) => variant.id));
    for (const variant of rest) {
      if (!seen.has(variant.id)) product.variants.nodes.push(variant);
    }
  }

  return products;
}

export type SyncSummary = {
  products: number;
  variants: number;
  orders: number;
  lineItems: number;
};

export async function syncShopifyCatalog(): Promise<SyncSummary> {
  const [products, orders] = await Promise.all([fetchProducts(), fetchOrders()]);
  const syncedAt = new Date().toISOString();
  const db = openDatabase();

  db.transaction((tx) => {
    tx.delete(shopifyLineItems).run();
    tx.delete(shopifyOrders).run();
    tx.delete(shopifyVariants).run();
    tx.delete(shopifyProducts).run();

    insertChunked(
      products.map((product: ShopifyProductNode) => ({
        id: product.id,
        title: product.title,
        handle: product.handle,
        status: product.status,
        syncedAt,
      })),
      (chunk) => tx.insert(shopifyProducts).values(chunk).run(),
    );

    const variants = products.flatMap((product) =>
      product.variants.nodes.map((variant: ShopifyVariantNode) => ({
        id: variant.id,
        productId: product.id,
        title: variant.title,
        sku: variant.sku,
        selectedOptions: JSON.stringify(variant.selectedOptions),
        productTitle: product.title,
      })),
    );
    insertChunked(variants, (chunk) => tx.insert(shopifyVariants).values(chunk).run());

    insertChunked(
      orders.map((order: ShopifyOrderNode) => ({
        id: order.id,
        name: order.name,
        createdAt: order.createdAt,
        fulfillmentStatus: order.displayFulfillmentStatus,
        syncedAt,
      })),
      (chunk) => tx.insert(shopifyOrders).values(chunk).run(),
    );

    const lines = orders.flatMap((order) =>
      order.lineItems.nodes.map((line: ShopifyLineNode) => ({
        id: line.id,
        orderId: order.id,
        title: line.title,
        name: line.name,
        variantTitle: line.variantTitle,
        sku: line.sku,
        variantId: line.variant?.id ?? null,
        quantity: line.quantity,
        unfulfilledQuantity: line.unfulfilledQuantity,
      })),
    );
    insertChunked(lines, (chunk) => tx.insert(shopifyLineItems).values(chunk).run());
  });

  return {
    products: products.length,
    variants: products.reduce((sum, product) => sum + product.variants.nodes.length, 0),
    orders: orders.length,
    lineItems: orders.reduce((sum, order) => sum + order.lineItems.nodes.length, 0),
  };
}

function insertChunked<T>(rows: T[], write: (chunk: T[]) => void) {
  const size = 40;
  for (let index = 0; index < rows.length; index += size) {
    write(rows.slice(index, index + size));
  }
}
