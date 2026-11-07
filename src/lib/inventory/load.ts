import { cache } from "react";
import { asc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  builds,
  finishedMovements,
  materialOptions,
  materials,
  materialVariants,
  movements,
  printSeries,
  recipeExclusions,
  recipeLines,
  recipeOverrides,
  recipes,
  shopifyLineItems,
  shopifyOrders,
  shopifyProducts,
  shopifyVariants,
  stockId,
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

export function variantLabel(modelName: string, size: string, color: string) {
  return `${modelName} · ${size} / ${color}`;
}

export function stockChoices(input: {
  seriesRows: { id: string; name: string }[];
  materialRows: { id: string; name: string; type: string; unit: string; seriesId: string | null }[];
  blankVariantRows: { id: string; materialId: string; size: string; color: string; archivedAt: string | null }[];
}) {
  const seriesName = new Map(input.seriesRows.map((series) => [series.id, series.name]));
  const models = new Map(input.materialRows.map((material) => [material.id, material]));
  return [
    ...input.materialRows
      .filter((material) => material.type === "print")
      .map((material) => ({
        id: material.id,
        name: material.seriesId ? `${seriesName.get(material.seriesId) ?? "Series"} · ${material.name}` : material.name,
        unit: material.unit,
        materialId: material.id,
        variantId: null as string | null,
        role: "print",
      })),
    ...input.blankVariantRows
      .filter((variant) => !variant.archivedAt)
      .map((variant) => ({
        id: variant.id,
        name: variantLabel(models.get(variant.materialId)?.name ?? "Blank", variant.size, variant.color),
        unit: models.get(variant.materialId)?.unit ?? "each",
        materialId: variant.materialId,
        variantId: variant.id as string | null,
        role: "blank",
      })),
    ...input.materialRows
      .filter((material) => material.type !== "print" && material.type !== "blank")
      .map((material) => ({
        id: material.id,
        name: material.name,
        unit: material.unit,
        materialId: material.id,
        variantId: null as string | null,
        role: "other",
      })),
  ];
}

export const loadShop = cache(async () => {
  const db = await getDb();
  const seriesRows = db.select().from(printSeries).orderBy(asc(printSeries.name)).all();
  const materialRows = db.select().from(materials).orderBy(asc(materials.name)).all();
  const optionRows = db.select().from(materialOptions).orderBy(asc(materialOptions.position), asc(materialOptions.value)).all();
  const blankVariantRows = db.select().from(materialVariants).all();
  const movementRows = db.select().from(movements).orderBy(asc(movements.createdAt), asc(movements.id)).all();
  const recipeRows = db.select().from(recipes).all();
  const recipeLineRows = db.select().from(recipeLines).all();
  const exclusionRows = db.select().from(recipeExclusions).all();
  const overrideRows = db.select().from(recipeOverrides).all();
  const productRows = db.select().from(shopifyProducts).orderBy(asc(shopifyProducts.title)).all();
  const variantRows = db.select().from(shopifyVariants).orderBy(asc(shopifyVariants.productTitle), asc(shopifyVariants.title)).all();
  const orderRows = db.select().from(shopifyOrders).orderBy(asc(shopifyOrders.createdAt)).all();
  const lineRows = db.select().from(shopifyLineItems).all();
  const buildRows = db.select().from(builds).orderBy(asc(builds.createdAt)).all();
  const finishedRows = db.select().from(finishedMovements).orderBy(asc(finishedMovements.createdAt), asc(finishedMovements.id)).all();

  const linesByRecipe = new Map<string, typeof recipeLineRows>();
  for (const line of recipeLineRows) {
    const list = linesByRecipe.get(line.recipeId) ?? [];
    list.push(line);
    linesByRecipe.set(line.recipeId, list);
  }

  const seriesName = new Map(seriesRows.map((series) => [series.id, series.name]));
  const materialById = new Map(materialRows.map((material) => [material.id, material]));
  const stockMaterials: ReportInput["materials"] = [
    ...materialRows
      .filter((material) => material.type !== "blank")
      .map((material) => ({
        id: material.id,
        name: material.name,
        type: material.type,
        size: null,
        color: null,
        unit: material.unit,
        modelId: material.id,
        modelName: material.name,
        seriesName: material.seriesId ? (seriesName.get(material.seriesId) ?? null) : null,
      })),
    ...blankVariantRows.map((variant) => {
      const model = materialById.get(variant.materialId);
      const modelName = model?.name ?? "Blank";
      return {
        id: variant.id,
        name: variantLabel(modelName, variant.size, variant.color),
        type: "blank",
        size: variant.size,
        color: variant.color,
        unit: model?.unit ?? "each",
        modelId: variant.materialId,
        modelName,
        seriesName: null,
      };
    }),
  ];

  const recipesForReport: ReportRecipe[] = recipeRows.map((recipe) => ({
    id: recipe.id,
    matchType: recipe.matchType === "custom_title" ? "custom_title" : "product",
    shopifyProductId: recipe.shopifyProductId,
    customTitle: recipe.customTitle,
    overrides: overrideRows
      .filter((override) => override.recipeId === recipe.id)
      .map((override) => ({ shopifyVariantId: override.shopifyVariantId, blankVariantId: override.blankVariantId })),
    lines: (linesByRecipe.get(recipe.id) ?? []).map((line) => ({
      materialId: line.materialId,
      quantity: line.quantity,
      role: line.role,
      excludedVariantIds: exclusionRows.filter((exclusion) => exclusion.recipeLineId === line.id).map((exclusion) => exclusion.variantId),
    })),
  }));

  const input: ReportInput = {
    materials: stockMaterials,
    movements: movementRows.map((movement) => ({
      materialId: stockId(movement.materialId, movement.variantId),
      quantity: movement.quantity,
    })),
    recipes: recipesForReport,
    variants: variantRows.map((variant) => ({
      id: variant.id,
      productId: variant.productId,
      productTitle: variant.productTitle,
      title: variant.title,
      sku: variant.sku,
      options: parseOptions(variant.selectedOptions),
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
    finished: finishedRows.map((movement) => ({
      shopifyVariantId: movement.shopifyVariantId,
      quantity: movement.quantity,
    })),
  };

  const syncedAt = [...orderRows, ...productRows].reduce<string | null>((latest, row) => {
    if (!latest || row.syncedAt > latest) return row.syncedAt;
    return latest;
  }, null);

  return {
    seriesRows,
    materialRows,
    optionRows,
    blankVariantRows,
    movementRows,
    recipeRows,
    recipeLineRows,
    exclusionRows,
    overrideRows,
    productRows,
    variantRows,
    orderRows,
    lineRows,
    buildRows,
    finishedRows,
    linesByRecipe,
    report: buildReport(input),
    syncedAt,
  };
});
