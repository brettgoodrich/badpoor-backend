"use server";

import { eq } from "drizzle-orm";
import { redirectWith, refreshShop } from "@/lib/action";
import { getDb } from "@/lib/db";
import {
  builds,
  finishedMovements,
  materialVariants,
  movements,
  recipeExclusions,
  recipeLines,
  recipeOverrides,
  recipes,
  shopifyLineItems,
  shopifyOrders,
  shopifyVariants,
} from "@/lib/db/schema";
import { orderPath, readString } from "@/lib/format";
import { consumptionForBuild, onHandByVariant } from "@/lib/inventory/calculations";
import { resolveRecipeId } from "@/lib/inventory/matching";
import { parseOptions } from "@/lib/inventory/load";
import { concreteLines } from "@/lib/inventory/resolve";

type Database = Awaited<ReturnType<typeof getDb>>;

function finishedOnHand(database: Database, shopifyVariantId: string) {
  const rows = database.select().from(finishedMovements).where(eq(finishedMovements.shopifyVariantId, shopifyVariantId)).all();
  return onHandByVariant(rows).get(shopifyVariantId) ?? 0;
}

function recordFulfill(database: Database, lineItemId: string, quantity: number, note: string) {
  database.transaction((tx) => {
    const line = tx.select().from(shopifyLineItems).where(eq(shopifyLineItems.id, lineItemId)).get();
    if (!line) throw new Error("That line is not in the local order copy.");
    if (!line.variantId) throw new Error(`${line.name} has no Shopify variant, so it cannot come from finished stock.`);
    const already = tx
      .select()
      .from(builds)
      .where(eq(builds.lineItemId, lineItemId))
      .all()
      .reduce((sum, build) => sum + build.quantity, 0);
    const remaining = Math.max(0, line.unfulfilledQuantity - already);
    if (!Number.isInteger(quantity) || quantity <= 0) throw new Error("Enter a whole number of garments.");
    if (quantity > remaining) throw new Error(`Only ${remaining} of ${line.name} still need to be fulfilled.`);
    const have = onHandByVariant(
      tx.select().from(finishedMovements).where(eq(finishedMovements.shopifyVariantId, line.variantId)).all(),
    ).get(line.variantId) ?? 0;
    if (have < quantity) {
      throw new Error(`Only ${have} finished ${line.name} on hand. Build the rest now.`);
    }
    const buildId = crypto.randomUUID();
    const now = new Date().toISOString();
    const order = tx.select().from(shopifyOrders).where(eq(shopifyOrders.id, line.orderId)).get();
    const detail = note || `Used ${quantity} finished for ${order?.name ?? "an order"} · ${line.name}. Materials were not consumed. Shopify was not changed.`;
    tx.insert(builds)
      .values({ id: buildId, orderId: line.orderId, lineItemId, quantity, note: detail, blankVariantId: null, createdAt: now })
      .run();
    tx.insert(finishedMovements)
      .values({
        id: crypto.randomUUID(),
        shopifyVariantId: line.variantId,
        type: "fulfill",
        quantity: -quantity,
        note: detail,
        buildId,
        createdAt: now,
      })
      .run();
  });
}

function recordBuild(database: Database, lineItemId: string, quantity: number, note: string, blankOverrideId: string | null) {
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
    const catalog = tx.select().from(shopifyVariants).all();
    const productIdByVariant = new Map(catalog.map((variant) => [variant.id, variant.productId]));
    const recipe = recipeRows.find(
      (entry) =>
        resolveRecipeId(
          { variantId: line.variantId, title: line.title, name: line.name },
          recipeRows.map((row) => ({
            id: row.id,
            matchType: row.matchType,
            shopifyProductId: row.shopifyProductId,
            customTitle: row.customTitle,
          })),
          productIdByVariant,
        ) === entry.id,
    );
    if (!recipe) throw new Error(`${line.name} has no recipe yet, so it was not marked built.`);
    const lines = tx.select().from(recipeLines).where(eq(recipeLines.recipeId, recipe.id)).all();
    if (lines.length === 0) throw new Error("That recipe has no materials.");
    const exclusions = tx.select().from(recipeExclusions).all();
    const storedOverrides = tx.select().from(recipeOverrides).where(eq(recipeOverrides.recipeId, recipe.id)).all();
    const blanks = tx.select().from(materialVariants).all();
    const shopifyVariant = line.variantId ? catalog.find((variant) => variant.id === line.variantId) : undefined;
    const resolved = concreteLines(
      {
        lines: lines.map((entry) => ({
          materialId: entry.materialId,
          role: entry.role,
          quantity: entry.quantity,
          excludedVariantIds: exclusions.filter((row) => row.recipeLineId === entry.id).map((row) => row.variantId),
        })),
        overrides: storedOverrides.map((row) => ({ shopifyVariantId: row.shopifyVariantId, blankVariantId: row.blankVariantId })),
      },
      {
        shopifyVariantId: line.variantId,
        title: shopifyVariant?.title ?? line.variantTitle ?? line.name,
        options: parseOptions(shopifyVariant?.selectedOptions ?? "[]"),
      },
      blanks,
    );
    if (!resolved.complete) throw new Error(`${line.name} does not match a size and color on this blank.`);
    const blankLine = lines.find((entry) => entry.role === "blank");
    const matchedBlankId = resolved.lines.find((entry) => entry.role === "blank")?.materialId ?? null;
    let consumedBlankId = matchedBlankId;
    if (blankOverrideId) {
      const override = blanks.find((variant) => variant.id === blankOverrideId);
      if (!override || override.archivedAt) throw new Error("That blank variant is not available.");
      if (blankLine && override.materialId !== blankLine.materialId) {
        throw new Error("Pick a size and color from the same blank.");
      }
      consumedBlankId = override.id;
    }

    const consumed = consumptionForBuild(
      resolved.lines,
      quantity,
      blankOverrideId && blankOverrideId !== matchedBlankId ? blankOverrideId : null,
    );

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
        blankVariantId: consumedBlankId,
        createdAt: now,
      })
      .run();

    for (const consumedLine of consumed) {
      const variant = tx.select().from(materialVariants).where(eq(materialVariants.id, consumedLine.materialId)).get();
      tx.insert(movements)
        .values({
          id: crypto.randomUUID(),
          materialId: variant?.materialId ?? consumedLine.materialId,
          variantId: variant?.id ?? null,
          type: "consume",
          quantity: consumedLine.quantity,
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
  const source = readString(formData, "source") === "finished" ? "finished" : "build";
  try {
    if (source === "finished") {
      recordFulfill(database, lineItemId, quantity, readString(formData, "note"));
    } else {
      recordBuild(database, lineItemId, quantity, readString(formData, "note"), readString(formData, "blankVariantId") || null);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not record the build.";
    redirectWith(back, "error", message);
  }
  refreshShop();
  redirectWith(
    back,
    "notice",
    source === "finished"
      ? "Marked fulfilled from finished stock. Materials were not consumed. Shopify was not changed."
      : "Marked built. Materials were consumed in the ledger. Shopify was not changed.",
  );
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
  const productIdByVariant = new Map(database.select().from(shopifyVariants).all().map((variant) => [variant.id, variant.productId]));
  const matches = recipeRows.map((row) => ({
    id: row.id,
    matchType: row.matchType,
    shopifyProductId: row.shopifyProductId,
    customTitle: row.customTitle,
  }));
  const hasRecipe = (line: (typeof lines)[number]) =>
    Boolean(resolveRecipeId({ variantId: line.variantId, title: line.title, name: line.name }, matches, productIdByVariant));
  const builtByLine = new Map<string, number>();
  for (const build of database.select().from(builds).all()) {
    builtByLine.set(build.lineItemId, (builtByLine.get(build.lineItemId) ?? 0) + build.quantity);
  }

  const targets = lines.flatMap((line) => {
    const remaining = Math.max(0, line.unfulfilledQuantity - (builtByLine.get(line.id) ?? 0));
    if (remaining <= 0) return [];
    if (!hasRecipe(line)) return [];
    return [{ id: line.id, quantity: remaining, name: line.name }];
  });
  const skipped = lines.filter((line) => {
    const remaining = Math.max(0, line.unfulfilledQuantity - (builtByLine.get(line.id) ?? 0));
    if (remaining <= 0) return false;
    return !hasRecipe(line);
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

  let builtCount = 0;
  let unmatched = 0;
  for (const target of targets) {
    const line = lines.find((entry) => entry.id === target.id);
    const fromStock = line?.variantId ? Math.max(0, Math.floor(finishedOnHand(database, line.variantId))) : 0;
    const finishedQty = Math.min(target.quantity, fromStock);
    const buildQty = target.quantity - finishedQty;
    try {
      if (finishedQty > 0) recordFulfill(database, target.id, finishedQty, "");
      if (buildQty > 0) recordBuild(database, target.id, buildQty, "", null);
      builtCount += 1;
    } catch {
      unmatched += 1;
    }
  }
  if (builtCount === 0) {
    redirectWith(
      back,
      "error",
      skipped + unmatched > 0
        ? "Every remaining line is missing a recipe or a matching size, so nothing was marked built."
        : "Nothing on this order is left to build.",
    );
  }

  refreshShop();
  const skipNote = skipped + unmatched > 0 ? ` ${skipped + unmatched} line${skipped + unmatched === 1 ? "" : "s"} still need a recipe or a matching size.` : "";
  redirectWith(back, "notice", `Marked ${builtCount} mapped line${builtCount === 1 ? "" : "s"} built.${skipNote} Shopify was not changed.`);
}
