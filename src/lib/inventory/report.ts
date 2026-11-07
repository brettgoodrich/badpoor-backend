import {
  allocateBuilds,
  buildableAlone,
  demandByMaterial,
  materialNeeds,
  onHandByMaterial,
  remainingDemand,
  sharedMaterialCaps,
  type DemandLine,
  type Recipe,
} from "./calculations";
import { resolveRecipeId, type RecipeMatch } from "./matching";

export type ReportMaterial = {
  id: string;
  name: string;
  type: string;
  size: string | null;
  color: string | null;
  unit: string;
};

export type ReportMovement = {
  materialId: string;
  quantity: number;
};

export type ReportRecipe = {
  id: string;
  matchType: "variant" | "custom_title";
  shopifyVariantId: string | null;
  customTitle: string | null;
  lines: { materialId: string; quantity: number }[];
};

export type ReportVariant = {
  id: string;
  productId: string;
  productTitle: string;
  title: string;
  sku: string | null;
};

export type ReportOrder = {
  id: string;
  name: string;
  createdAt: string;
  fulfillmentStatus: string;
};

export type ReportLine = {
  id: string;
  orderId: string;
  title: string;
  name: string;
  variantTitle: string | null;
  variantId: string | null;
  sku: string | null;
  quantity: number;
  unfulfilledQuantity: number;
};

export type ReportBuild = {
  id: string;
  lineItemId: string;
  quantity: number;
  createdAt: string;
  note: string | null;
};

export type ReportInput = {
  materials: ReportMaterial[];
  movements: ReportMovement[];
  recipes: ReportRecipe[];
  variants: ReportVariant[];
  orders: ReportOrder[];
  lines: ReportLine[];
  builds: ReportBuild[];
};

export type ReportLineView = ReportLine & {
  built: number;
  remaining: number;
  recipeId: string | null;
  canBuildNow: number;
  needs: { materialId: string; materialName: string; quantity: number }[];
};

export type ReportOrderView = ReportOrder & {
  lines: ReportLineView[];
  unitsRemaining: number;
  unmappedCount: number;
};

export type BuildableRow = {
  recipeId: string;
  label: string;
  productTitle: string;
  count: number;
  limitingMaterialId: string | null;
  limitingMaterialName: string | null;
};

export type BuildableGroup = {
  productTitle: string;
  rows: BuildableRow[];
  shared: {
    materialId: string;
    materialName: string;
    onHand: number;
    quantityPerUnit: number | null;
    maxUnits: number | null;
  }[];
};

export type InventoryReport = {
  onHand: Map<string, number>;
  needs: {
    materialId: string;
    materialName: string;
    type: string;
    unit: string;
    onHand: number;
    demand: number;
    shortfall: number;
  }[];
  buyCount: number;
  buildable: BuildableRow[];
  buildableGroups: BuildableGroup[];
  orders: ReportOrderView[];
  unitsRemaining: number;
  unmappedLines: ReportLineView[];
};

function materialName(materials: Map<string, ReportMaterial>, id: string) {
  return materials.get(id)?.name ?? "Unknown material";
}

function recipeLabel(recipe: ReportRecipe, variants: Map<string, ReportVariant>) {
  if (recipe.matchType === "variant" && recipe.shopifyVariantId) {
    const variant = variants.get(recipe.shopifyVariantId);
    if (variant) return `${variant.productTitle} · ${variant.title}`;
  }
  return recipe.customTitle ?? "Custom item";
}

function productTitleForRecipe(recipe: ReportRecipe, variants: Map<string, ReportVariant>) {
  if (recipe.matchType === "variant" && recipe.shopifyVariantId) {
    return variants.get(recipe.shopifyVariantId)?.productTitle ?? "Catalog";
  }
  return "Custom items";
}

export function buildReport(input: ReportInput): InventoryReport {
  const materialsById = new Map(input.materials.map((material) => [material.id, material]));
  const variantsById = new Map(input.variants.map((variant) => [variant.id, variant]));
  const onHand = onHandByMaterial(input.movements);
  const builtByLine = new Map<string, number>();
  for (const build of input.builds) {
    builtByLine.set(build.lineItemId, (builtByLine.get(build.lineItemId) ?? 0) + build.quantity);
  }

  const recipeMatches: RecipeMatch[] = input.recipes;
  const recipesById = new Map<string, Recipe>(
    input.recipes.map((recipe) => [recipe.id, { id: recipe.id, lines: recipe.lines }]),
  );

  const linesByOrder = new Map<string, ReportLine[]>();
  for (const line of input.lines) {
    const list = linesByOrder.get(line.orderId) ?? [];
    list.push(line);
    linesByOrder.set(line.orderId, list);
  }

  const orderedOrders = [...input.orders].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.name.localeCompare(b.name));

  const demandLines: DemandLine[] = [];
  const lineDrafts: ReportLineView[] = [];

  for (const order of orderedOrders) {
    for (const line of linesByOrder.get(order.id) ?? []) {
      const built = builtByLine.get(line.id) ?? 0;
      const remaining = remainingDemand(line.unfulfilledQuantity, built);
      const recipeId = resolveRecipeId(
        { variantId: line.variantId, title: line.title, name: line.name },
        recipeMatches,
      );
      demandLines.push({ id: line.id, recipeId, quantity: remaining });
      lineDrafts.push({
        ...line,
        built,
        remaining,
        recipeId,
        canBuildNow: 0,
        needs: [],
      });
    }
  }

  const demand = demandByMaterial(demandLines, recipesById);
  const allocations = new Map(
    allocateBuilds(onHand, demandLines, recipesById).map((allocation) => [allocation.lineId, allocation.quantity]),
  );

  for (const line of lineDrafts) {
    line.canBuildNow = allocations.get(line.id) ?? 0;
    const recipe = line.recipeId ? recipesById.get(line.recipeId) : undefined;
    if (!recipe || line.remaining <= 0) continue;
    line.needs = recipe.lines
      .filter((recipeLine) => recipeLine.quantity > 0)
      .map((recipeLine) => ({
        materialId: recipeLine.materialId,
        materialName: materialName(materialsById, recipeLine.materialId),
        quantity: recipeLine.quantity * line.remaining,
      }));
  }

  const linesById = new Map(lineDrafts.map((line) => [line.id, line]));
  const orders: ReportOrderView[] = orderedOrders.map((order) => {
    const lines = (linesByOrder.get(order.id) ?? [])
      .map((line) => linesById.get(line.id))
      .filter((line): line is ReportLineView => Boolean(line));
    return {
      ...order,
      lines,
      unitsRemaining: lines.reduce((sum, line) => sum + line.remaining, 0),
      unmappedCount: lines.filter((line) => line.remaining > 0 && !line.recipeId).length,
    };
  });

  const needs = materialNeeds(
    input.materials.map((material) => material.id),
    onHand,
    demand,
  ).map((row) => {
    const material = materialsById.get(row.materialId);
    return {
      ...row,
      materialName: material?.name ?? row.materialId,
      type: material?.type ?? "other",
      unit: material?.unit ?? "each",
    };
  });

  const buildable: BuildableRow[] = input.recipes.map((recipe) => {
    const result = buildableAlone(onHand, recipe);
    return {
      recipeId: recipe.id,
      label: recipeLabel(recipe, variantsById),
      productTitle: productTitleForRecipe(recipe, variantsById),
      count: result.count,
      limitingMaterialId: result.limitingMaterialId,
      limitingMaterialName: result.limitingMaterialId
        ? materialName(materialsById, result.limitingMaterialId)
        : null,
    };
  });

  const caps = sharedMaterialCaps(
    input.recipes.map((recipe) => ({ id: recipe.id, lines: recipe.lines })),
    onHand,
  );

  const groupOrder: string[] = [];
  const grouped = new Map<string, BuildableRow[]>();
  for (const row of buildable) {
    const list = grouped.get(row.productTitle) ?? [];
    if (list.length === 0) groupOrder.push(row.productTitle);
    list.push(row);
    grouped.set(row.productTitle, list);
  }

  const buildableGroups: BuildableGroup[] = groupOrder.map((productTitle) => {
    const rows = grouped.get(productTitle) ?? [];
    const recipeIds = new Set(rows.map((row) => row.recipeId));
    return {
      productTitle,
      rows,
      shared: caps
        .filter((cap) => cap.recipeIds.some((id) => recipeIds.has(id)))
        .map((cap) => ({
          materialId: cap.materialId,
          materialName: materialName(materialsById, cap.materialId),
          onHand: cap.onHand,
          quantityPerUnit: cap.quantityPerUnit,
          maxUnits: cap.maxUnits,
        })),
    };
  });

  const unmappedLines = lineDrafts.filter((line) => line.remaining > 0 && !line.recipeId);
  const unitsRemaining = orders.reduce((sum, order) => sum + order.unitsRemaining, 0);

  return {
    onHand,
    needs,
    buyCount: needs.filter((row) => row.shortfall > 0).length,
    buildable,
    buildableGroups,
    orders,
    unitsRemaining,
    unmappedLines,
  };
}

export function orderById(report: InventoryReport, orderId: string) {
  return report.orders.find((order) => order.id === orderId) ?? null;
}
