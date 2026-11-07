import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const materialTypes = ["print", "blank", "trim", "other"] as const;
export type MaterialType = (typeof materialTypes)[number];

export const movementTypes = ["purchase", "receive", "consume", "adjustment"] as const;
export type MovementType = (typeof movementTypes)[number];

export const matchTypes = ["variant", "custom_title"] as const;
export type MatchType = (typeof matchTypes)[number];

export const materials = sqliteTable("materials", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  size: text("size"),
  color: text("color"),
  unit: text("unit").notNull().default("each"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const movements = sqliteTable(
  "inventory_movements",
  {
    id: text("id").primaryKey(),
    materialId: text("material_id")
      .notNull()
      .references(() => materials.id, { onDelete: "restrict" }),
    type: text("type").notNull(),
    quantity: real("quantity").notNull(),
    note: text("note"),
    buildId: text("build_id"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("movements_material_idx").on(table.materialId),
    index("movements_build_idx").on(table.buildId),
  ],
);

export const shopifyProducts = sqliteTable("shopify_products", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  handle: text("handle"),
  status: text("status"),
  syncedAt: text("synced_at").notNull(),
});

export const shopifyVariants = sqliteTable(
  "shopify_variants",
  {
    id: text("id").primaryKey(),
    productId: text("product_id")
      .notNull()
      .references(() => shopifyProducts.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    sku: text("sku"),
    selectedOptions: text("selected_options").notNull().default("[]"),
    productTitle: text("product_title").notNull(),
  },
  (table) => [index("variants_product_idx").on(table.productId)],
);

export const shopifyOrders = sqliteTable("shopify_orders", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: text("created_at").notNull(),
  fulfillmentStatus: text("fulfillment_status").notNull(),
  syncedAt: text("synced_at").notNull(),
});

export const shopifyLineItems = sqliteTable(
  "shopify_line_items",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => shopifyOrders.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    name: text("name").notNull(),
    variantTitle: text("variant_title"),
    sku: text("sku"),
    variantId: text("variant_id"),
    quantity: integer("quantity").notNull(),
    unfulfilledQuantity: integer("unfulfilled_quantity").notNull(),
  },
  (table) => [
    index("line_items_order_idx").on(table.orderId),
    index("line_items_variant_idx").on(table.variantId),
  ],
);

export const recipes = sqliteTable(
  "recipes",
  {
    id: text("id").primaryKey(),
    matchType: text("match_type").notNull(),
    shopifyVariantId: text("shopify_variant_id"),
    customTitle: text("custom_title"),
    notes: text("notes"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("recipes_variant_uidx").on(table.shopifyVariantId),
    uniqueIndex("recipes_custom_title_uidx").on(table.customTitle),
  ],
);

export const recipeLines = sqliteTable(
  "recipe_lines",
  {
    id: text("id").primaryKey(),
    recipeId: text("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    materialId: text("material_id")
      .notNull()
      .references(() => materials.id, { onDelete: "restrict" }),
    quantity: real("quantity").notNull(),
  },
  (table) => [index("recipe_lines_recipe_idx").on(table.recipeId)],
);

export const builds = sqliteTable(
  "builds",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id").notNull(),
    lineItemId: text("line_item_id").notNull(),
    quantity: integer("quantity").notNull(),
    note: text("note"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("builds_line_idx").on(table.lineItemId),
    index("builds_order_idx").on(table.orderId),
  ],
);
