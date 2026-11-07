import { cache } from "react";
import { asc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  builds,
  materials,
  movements,
  recipeLines,
  recipes,
  shopifyLineItems,
  shopifyOrders,
  shopifyProducts,
  shopifyVariants,
} from "@/lib/db/schema";
import type { SelectedOption } from "./matching";
import { buildReport, type ReportInput, type ReportRecipe } from "./report";

export function parseOptions(raw: string): SelectedOption[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const name = "name" in entry && typeof entry.name === "string" ? entry.name : "";
      const value = "value" in entry && typeof entry.value === "string" ? entry.value : "";
      return name && value ? [{ name, value }] : [];
    });
  } catch {
    return [];
  }
}

export const loadShop = cache(async () => {
  const db = await getDb();
  const materialRows = db.select().from(materials).orderBy(asc(materials.name)).all();
  const movementRows = db.select().from(movements).orderBy(asc(movements.createdAt), asc(movements.id)).all();
  const recipeRows = db.select().from(recipes).all();
  const recipeLineRows = db.select().from(recipeLines).all();
  const productRows = db.select().from(shopifyProducts).orderBy(asc(shopifyProducts.title)).all();
  const variantRows = db.select().from(shopifyVariants).orderBy(asc(shopifyVariants.productTitle), asc(shopifyVariants.title)).all();
  const orderRows = db.select().from(shopifyOrders).orderBy(asc(shopifyOrders.createdAt)).all();
  const lineRows = db.select().from(shopifyLineItems).all();
  const buildRows = db.select().from(builds).orderBy(asc(builds.createdAt)).all();

  const linesByRecipe = new Map<string, typeof recipeLineRows>();
  for (const line of recipeLineRows) {
    const list = linesByRecipe.get(line.recipeId) ?? [];
    list.push(line);
    linesByRecipe.set(line.recipeId, list);
  }

  const recipesForReport: ReportRecipe[] = recipeRows.map((recipe) => ({
    id: recipe.id,
    matchType: recipe.matchType === "custom_title" ? "custom_title" : "variant",
    shopifyVariantId: recipe.shopifyVariantId,
    customTitle: recipe.customTitle,
    lines: (linesByRecipe.get(recipe.id) ?? []).map((line) => ({
      materialId: line.materialId,
      quantity: line.quantity,
    })),
  }));

  const input: ReportInput = {
    materials: materialRows.map((material) => ({
      id: material.id,
      name: material.name,
      type: material.type,
      size: material.size,
      color: material.color,
      unit: material.unit,
    })),
    movements: movementRows.map((movement) => ({
      materialId: movement.materialId,
      quantity: movement.quantity,
    })),
    recipes: recipesForReport,
    variants: variantRows.map((variant) => ({
      id: variant.id,
      productId: variant.productId,
      productTitle: variant.productTitle,
      title: variant.title,
      sku: variant.sku,
    })),
    orders: orderRows.map((order) => ({
      id: order.id,
      name: order.name,
      createdAt: order.createdAt,
      fulfillmentStatus: order.fulfillmentStatus,
    })),
    lines: lineRows.map((line) => ({
      id: line.id,
      orderId: line.orderId,
      title: line.title,
      name: line.name,
      variantTitle: line.variantTitle,
      variantId: line.variantId,
      sku: line.sku,
      quantity: line.quantity,
      unfulfilledQuantity: line.unfulfilledQuantity,
    })),
    builds: buildRows.map((build) => ({
      id: build.id,
      lineItemId: build.lineItemId,
      quantity: build.quantity,
      createdAt: build.createdAt,
      note: build.note,
    })),
  };

  const syncedAt = [...orderRows, ...productRows].reduce<string | null>((latest, row) => {
    if (!latest || row.syncedAt > latest) return row.syncedAt;
    return latest;
  }, null);

  return {
    materialRows,
    movementRows,
    recipeRows,
    recipeLineRows,
    productRows,
    variantRows,
    orderRows,
    lineRows,
    buildRows,
    linesByRecipe,
    report: buildReport(input),
    syncedAt,
  };
});
