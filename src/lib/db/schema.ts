import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const materialTypes = ["print", "blank", "trim", "other"] as const;
export type MaterialType = (typeof materialTypes)[number];

export const movementTypes = ["purchase", "receive", "consume", "adjustment"] as const;
export type MovementType = (typeof movementTypes)[number];

export const matchTypes = ["variant", "custom_title"] as const;
export type MatchType = (typeof matchTypes)[number];

export const optionAxes = ["size", "color"] as const;
export type OptionAxis = (typeof optionAxes)[number];

export const recipeRoles = ["print", "blank", "other"] as const;
export type RecipeRole = (typeof recipeRoles)[number];

export const printSeries = sqliteTable("print_series", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/** A blank model, a print, or a simple material. Blank models are not stocked themselves. */
export const materials = sqliteTable("materials", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  unit: text("unit").notNull().default("each"),
  notes: text("notes"),
  brand: text("brand"),
  styleNumber: text("style_number"),
  ssStyleId: text("ss_style_id"),
  seriesId: text("series_id").references(() => printSeries.id, { onDelete: "set null" }),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const materialOptions = sqliteTable(
  "material_options",
  {
    id: text("id").primaryKey(),
    materialId: text("material_id")
      .notNull()
      .references(() => materials.id, { onDelete: "cascade" }),
    axis: text("axis").notNull(),
    value: text("value").notNull(),
    position: integer("position").notNull(),
    archivedAt: text("archived_at"),
  },
  (table) => [
    uniqueIndex("material_options_uidx").on(table.materialId, table.axis, table.value),
    index("material_options_material_idx").on(table.materialId),
  ],
);

export const materialVariants = sqliteTable(
  "material_variants",
  {
    id: text("id").primaryKey(),
    materialId: text("material_id")
      .notNull()
      .references(() => materials.id, { onDelete: "cascade" }),
    size: text("size").notNull(),
    color: text("color").notNull(),
    archivedAt: text("archived_at"),
  },
  (table) => [
    uniqueIndex("material_variants_uidx").on(table.materialId, table.size, table.color),
    index("material_variants_material_idx").on(table.materialId),
  ],
);

export const movements = sqliteTable(
  "inventory_movements",
  {
    id: text("id").primaryKey(),
    materialId: text("material_id")
      .notNull()
      .references(() => materials.id, { onDelete: "restrict" }),
    variantId: text("variant_id").references(() => materialVariants.id, { onDelete: "restrict" }),
    type: text("type").notNull(),
    quantity: real("quantity").notNull(),
    note: text("note"),
    buildId: text("build_id"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("movements_material_idx").on(table.materialId),
    index("movements_variant_idx").on(table.variantId),
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
    variantId: text("variant_id").references(() => materialVariants.id, { onDelete: "restrict" }),
    role: text("role").notNull(),
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
    blankVariantId: text("blank_variant_id"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("builds_line_idx").on(table.lineItemId),
    index("builds_order_idx").on(table.orderId),
  ],
);

/** Ledger identity: a blank variant, or the material itself when it has no matrix. */
export function stockId(materialId: string, variantId: string | null | undefined) {
  return variantId ?? materialId;
}
