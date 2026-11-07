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
import { canonicalSize, resolveRecipeId, type RecipeMatch, type SelectedOption } from "./matching";
import { concreteLines, type ModelRecipeLine, type VariantOverride } from "./resolve";

export type ReportMaterial = {
  id: string;
  name: string;
  type: string;
  size: string | null;
  color: string | null;
  unit: string;
  modelId?: string;
  modelName?: string;
  seriesName?: string | null;
};

export type ReportMovement = {
  materialId: string;
  quantity: number;
};

export type ReportRecipe = {
  id: string;
  matchType: "product" | "custom_title";
  shopifyProductId: string | null;
  customTitle: string | null;
  lines: ModelRecipeLine[];
  overrides: VariantOverride[];
};

export type ReportVariant = {
  id: string;
  productId: string;
  productTitle: string;
  title: string;
  sku: string | null;
  options: SelectedOption[];
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
  needs: { materialId: string; materialName: string; quantity: number; role: string }[];
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

export type BuyGroup = {
  key: string;
  title: string;
  rows: InventoryReport["needs"];
};

export type InventoryReport = {
  onHand: Map<string, number>;
  needs: {
    materialId: string;
    materialName: string;
    type: string;
    unit: string;
    modelId: string;
    onHand: number;
    demand: number;
    shortfall: number;
  }[];
  buyCount: number;
  buyGroups: BuyGroup[];
  buildable: BuildableRow[];
  buildableGroups: BuildableGroup[];
  orders: ReportOrderView[];
  unitsRemaining: number;
  unmappedLines: ReportLineView[];
};

const SIZE_RANK = ["yxs", "ys", "ym", "yl", "yxl", "xs", "s", "m", "l", "xl", "2xl"];

function groupBuyList(
  needs: InventoryReport["needs"],
  materialsById: Map<string, ReportMaterial>,
): BuyGroup[] {
  const order: string[] = [];
  const groups = new Map<string, BuyGroup>();
  for (const row of needs) {
    const material = materialsById.get(row.materialId);
    const key =
      material?.type === "blank"
        ? `blank:${material.modelId ?? material.id}`
        : material?.type === "print"
          ? `print:${material.seriesName ?? ""}`
          : `item:${material?.id ?? row.materialId}`;
    const title =
      material?.type === "blank"
        ? (material.modelName ?? material.name)
        : material?.type === "print"
          ? material.seriesName || "Prints"
          : (material?.name ?? row.materialName);
    const group = groups.get(key);
    if (!group) {
      groups.set(key, { key, title, rows: [row] });
      order.push(key);
    } else {
      group.rows.push(row);
    }
  }

  return order.map((key) => {
    const group = groups.get(key);
    if (!group) return { key, title: key, rows: [] };
    group.rows.sort((a, b) => {
      const left = materialsById.get(a.materialId);
      const right = materialsById.get(b.materialId);
      const sizeDelta = sizeRank(left?.size ?? null) - sizeRank(right?.size ?? null);
      if (sizeDelta !== 0) return sizeDelta;
      return (left?.color ?? "").localeCompare(right?.color ?? "");
    });
    return group;
  });
}

function sizeRank(size: string | null) {
  const key = canonicalSize(size);
  if (!key) return 200;
  const index = SIZE_RANK.indexOf(key);
  return index === -1 ? 100 : index;
}

function materialName(materials: Map<string, ReportMaterial>, id: string) {
  return materials.get(id)?.name ?? "Unknown material";
}

function blankChoices(materials: ReportMaterial[]) {
  return materials
    .filter((material) => material.type === "blank")
    .map((material) => ({
      id: material.id,
      materialId: material.modelId ?? material.id,
      size: material.size,
      color: material.color,
    }));
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
  const productIdByVariant = new Map(input.variants.map((variant) => [variant.id, variant.productId]));
  const blanks = blankChoices(input.materials);
  const concreteByLine = new Map<string, Recipe["lines"]>();

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
        productIdByVariant,
      );
      const recipe = recipeId ? input.recipes.find((entry) => entry.id === recipeId) : undefined;
      const variant = line.variantId ? variantsById.get(line.variantId) : undefined;
      const resolved = recipe
        ? concreteLines(
            recipe,
            {
              shopifyVariantId: line.variantId,
              title: variant?.title ?? line.variantTitle ?? line.name,
              options: variant?.options ?? [],
            },
            blanks,
          )
        : null;
      const concrete = resolved?.complete ? resolved.lines : undefined;
      const mappedId = concrete ? recipeId : null;
      if (concrete) concreteByLine.set(line.id, concrete);
      demandLines.push({
        id: line.id,
        recipeId: mappedId,
        quantity: remaining,
        lines: concrete,
      });
      lineDrafts.push({
        ...line,
        built,
        remaining,
        recipeId: mappedId,
        canBuildNow: 0,
        needs: [],
      });
    }
  }

  const demand = demandByMaterial(demandLines, new Map());
  const allocations = new Map(
    allocateBuilds(onHand, demandLines, new Map()).map((allocation) => [allocation.lineId, allocation.quantity]),
  );

  for (const line of lineDrafts) {
    line.canBuildNow = allocations.get(line.id) ?? 0;
    const recipeLines = concreteByLine.get(line.id);
    if (!recipeLines || line.remaining <= 0) continue;
    line.needs = recipeLines
      .filter((recipeLine) => recipeLine.quantity > 0)
      .map((recipeLine) => ({
        materialId: recipeLine.materialId,
        materialName: materialName(materialsById, recipeLine.materialId),
        quantity: recipeLine.quantity * line.remaining,
        role: recipeLine.role ?? "other",
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
      modelId: material?.modelId ?? row.materialId,
    };
  });

  const expanded = expandRecipes(input.recipes, input.variants, blanks);
  const buildable: BuildableRow[] = expanded.map((recipe) => {
    const result = buildableAlone(onHand, recipe);
    return {
      recipeId: recipe.id,
      label: recipe.label,
      productTitle: recipe.productTitle,
      count: result.count,
      limitingMaterialId: result.limitingMaterialId,
      limitingMaterialName: result.limitingMaterialId
        ? materialName(materialsById, result.limitingMaterialId)
        : null,
    };
  });

  const caps = sharedMaterialCaps(expanded, onHand);

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
    buyGroups: groupBuyList(needs, materialsById),
    buildable,
    buildableGroups,
    orders,
    unitsRemaining,
    unmappedLines,
  };
}

function expandRecipes(recipes: ReportRecipe[], variants: ReportVariant[], blanks: ReturnType<typeof blankChoices>) {
  const expanded: Array<Recipe & { label: string; productTitle: string }> = [];
  for (const recipe of recipes) {
    if (recipe.matchType === "product" && recipe.shopifyProductId) {
      for (const variant of variants.filter((entry) => entry.productId === recipe.shopifyProductId)) {
        const resolved = concreteLines(
          recipe,
          { shopifyVariantId: variant.id, title: variant.title, options: variant.options },
          blanks,
        );
        if (!resolved.complete) continue;
        expanded.push({
          id: `${recipe.id}:${variant.id}`,
          label: `${variant.productTitle} · ${variant.title}`,
          productTitle: variant.productTitle,
          lines: resolved.lines,
        });
      }
      continue;
    }
    const resolved = concreteLines(
      recipe,
      { shopifyVariantId: null, title: recipe.customTitle ?? "", options: [] },
      blanks,
    );
    if (!resolved.complete) continue;
    expanded.push({
      id: recipe.id,
      label: recipe.customTitle ?? "Custom item",
      productTitle: "Custom items",
      lines: resolved.lines,
    });
  }
  return expanded;
}

export function orderById(report: InventoryReport, orderId: string) {
  return report.orders.find((order) => order.id === orderId) ?? null;
}
