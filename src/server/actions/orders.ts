"use server";

import { eq } from "drizzle-orm";
import { redirectWith, refreshShop } from "@/lib/action";
import { getDb } from "@/lib/db";
import { builds, movements, recipeLines, recipes, shopifyLineItems, shopifyOrders } from "@/lib/db/schema";
import { orderPath, readString } from "@/lib/format";
import { resolveRecipeId } from "@/lib/inventory/matching";

type Database = Awaited<ReturnType<typeof getDb>>;

function recordBuild(database: Database, lineItemId: string, quantity: number, note: string) {
  database.transaction((tx) => {
    const line = tx.select().from(shopifyLineItems).where(eq(shopifyLineItems.id, lineItemId)).get();
    if (!line) throw new Error("That line is not in the local order copy.");
    const already = tx
      .select()
      .from(builds)
      .where(eq(builds.lineItemId, lineItemId))
      .all()
      .reduce((sum, build) => sum + build.quantity, 0);
    const remaining = Math.max(0, line.unfulfilledQuantity - already);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new Error("Enter a whole number of garments to mark built.");
    }
    if (quantity > remaining) {
      throw new Error(
        remaining === 0
          ? `${line.name} has nothing left to build.`
          : `Only ${remaining} of ${line.name} still need to be built.`,
      );
    }

    const recipeRows = tx.select().from(recipes).all();
    const recipe = recipeRows.find(
      (entry) =>
        resolveRecipeId(
          { variantId: line.variantId, title: line.title, name: line.name },
          recipeRows.map((row) => ({
            id: row.id,
            matchType: row.matchType,
            shopifyVariantId: row.shopifyVariantId,
            customTitle: row.customTitle,
          })),
        ) === entry.id,
    );
    if (!recipe) throw new Error(`${line.name} has no recipe yet, so it was not marked built.`);
    const lines = tx.select().from(recipeLines).where(eq(recipeLines.recipeId, recipe.id)).all();
    if (lines.length === 0) throw new Error("That recipe has no materials.");

    const buildId = crypto.randomUUID();
    const now = new Date().toISOString();
    const order = tx.select().from(shopifyOrders).where(eq(shopifyOrders.id, line.orderId)).get();
    const detail = note || `Built ${quantity} for ${order?.name ?? "an order"} · ${line.name}. Shopify was not changed.`;

    tx.insert(builds)
      .values({
        id: buildId,
        orderId: line.orderId,
        lineItemId,
        quantity,
        note: detail,
        createdAt: now,
      })
      .run();

    for (const recipeLine of lines) {
      if (recipeLine.quantity <= 0) continue;
      tx.insert(movements)
        .values({
          id: crypto.randomUUID(),
          materialId: recipeLine.materialId,
          type: "consume",
          quantity: -recipeLine.quantity * quantity,
          note: detail,
          buildId,
          createdAt: now,
        })
        .run();
    }
  });
}

export async function markLineBuilt(formData: FormData) {
  const lineItemId = readString(formData, "lineItemId");
  const orderId = readString(formData, "orderId");
  const back = orderId ? orderPath(orderId) : "/orders";
  const quantity = Number(readString(formData, "quantity"));
  if (!lineItemId) redirectWith("/orders", "error", "Missing line item.");

  const database = await getDb();
  try {
    recordBuild(database, lineItemId, quantity, readString(formData, "note"));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not record the build.";
    redirectWith(back, "error", message);
  }
  refreshShop();
  redirectWith(back, "notice", "Marked built. Materials were consumed in the ledger. Shopify was not changed.");
}

export async function markOrderBuilt(formData: FormData) {
  const orderId = readString(formData, "orderId");
  if (!orderId) redirectWith("/orders", "error", "Missing order.");
  const back = orderPath(orderId);
  const database = await getDb();
  const order = database.select().from(shopifyOrders).where(eq(shopifyOrders.id, orderId)).get();
  if (!order) redirectWith("/orders", "error", "That order is not in the local copy.");

  const lines = database.select().from(shopifyLineItems).where(eq(shopifyLineItems.orderId, orderId)).all();
  const recipeRows = database.select().from(recipes).all();
  const matches = recipeRows.map((row) => ({
    id: row.id,
    matchType: row.matchType,
    shopifyVariantId: row.shopifyVariantId,
    customTitle: row.customTitle,
  }));
  const builtByLine = new Map<string, number>();
  for (const build of database.select().from(builds).all()) {
    builtByLine.set(build.lineItemId, (builtByLine.get(build.lineItemId) ?? 0) + build.quantity);
  }

  const targets = lines.flatMap((line) => {
    const remaining = Math.max(0, line.unfulfilledQuantity - (builtByLine.get(line.id) ?? 0));
    if (remaining <= 0) return [];
    const recipeId = resolveRecipeId({ variantId: line.variantId, title: line.title, name: line.name }, matches);
    if (!recipeId) return [];
    return [{ id: line.id, quantity: remaining, name: line.name }];
  });
  const skipped = lines.filter((line) => {
    const remaining = Math.max(0, line.unfulfilledQuantity - (builtByLine.get(line.id) ?? 0));
    if (remaining <= 0) return false;
    return !resolveRecipeId({ variantId: line.variantId, title: line.title, name: line.name }, matches);
  }).length;

  if (targets.length === 0) {
    redirectWith(
      back,
      "error",
      skipped > 0
        ? "Every remaining line is missing a recipe, so nothing was marked built."
        : "Nothing on this order is left to build.",
    );
  }

  try {
    for (const target of targets) {
      recordBuild(database, target.id, target.quantity, "");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not record the build.";
    redirectWith(back, "error", message);
  }

  refreshShop();
  const skipNote = skipped > 0 ? ` ${skipped} line${skipped === 1 ? "" : "s"} still need a recipe.` : "";
  redirectWith(back, "notice", `Marked ${targets.length} mapped line${targets.length === 1 ? "" : "s"} built.${skipNote} Shopify was not changed.`);
}
