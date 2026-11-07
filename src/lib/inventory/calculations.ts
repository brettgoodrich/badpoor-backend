export type Movement = {
  materialId: string;
  quantity: number;
};

export type RecipeLine = {
  materialId: string;
  quantity: number;
  role?: string;
};

export type Recipe = {
  id: string;
  lines: RecipeLine[];
};

export type DemandLine = {
  id: string;
  recipeId: string | null;
  quantity: number;
};

export type MaterialNeed = {
  materialId: string;
  onHand: number;
  demand: number;
  shortfall: number;
};

export type BuildableResult = {
  count: number;
  limitingMaterialId: string | null;
};

export type SharedCap = {
  materialId: string;
  recipeIds: string[];
  onHand: number;
  quantityPerUnit: number | null;
  maxUnits: number | null;
};

export type Allocation = {
  lineId: string;
  quantity: number;
};

/** Quantities are shop-floor counts. Round so 0.1 + 0.2 does not drift. */
export function roundQty(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function onHandByMaterial(movements: Movement[]) {
  const totals = new Map<string, number>();
  for (const movement of movements) {
    totals.set(movement.materialId, roundQty((totals.get(movement.materialId) ?? 0) + movement.quantity));
  }
  return totals;
}

/** Units still to make: Shopify's unfulfilled count, minus what we already recorded as built. */
export function remainingDemand(unfulfilledQuantity: number, builtQuantity: number) {
  return Math.max(0, unfulfilledQuantity - builtQuantity);
}

export function demandByMaterial(lines: DemandLine[], recipesById: Map<string, Recipe>) {
  const demand = new Map<string, number>();
  for (const line of lines) {
    if (!line.recipeId || line.quantity <= 0) continue;
    const recipe = recipesById.get(line.recipeId);
    if (!recipe) continue;
    for (const recipeLine of recipe.lines) {
      if (recipeLine.quantity <= 0) continue;
      const next = (demand.get(recipeLine.materialId) ?? 0) + recipeLine.quantity * line.quantity;
      demand.set(recipeLine.materialId, roundQty(next));
    }
  }
  return demand;
}

/**
 * How many to buy so on-hand covers open-order demand.
 * Negative on-hand is already a shortfall, even when nothing is on order.
 */
export function shortfall(onHand: number, demand: number) {
  return roundQty(Math.max(0, demand - onHand));
}

export function materialNeeds(
  materialIds: Iterable<string>,
  onHand: Map<string, number>,
  demand: Map<string, number>,
): MaterialNeed[] {
  const ids = new Set<string>([...materialIds, ...onHand.keys(), ...demand.keys()]);
  const rows: MaterialNeed[] = [];
  for (const materialId of ids) {
    const have = onHand.get(materialId) ?? 0;
    const need = demand.get(materialId) ?? 0;
    const gap = shortfall(have, need);
    if (need <= 0 && have >= 0) continue;
    rows.push({ materialId, onHand: have, demand: need, shortfall: gap });
  }
  rows.sort((a, b) => b.shortfall - a.shortfall || b.demand - a.demand || a.materialId.localeCompare(b.materialId));
  return rows;
}

/**
 * How many of this recipe could be built if nothing else is built.
 * Limited by the scarcest material. Negative stock builds zero.
 */
export function buildableAlone(onHand: Map<string, number>, recipe: Recipe): BuildableResult {
  const constraining = recipe.lines.filter((line) => line.quantity > 0);
  if (constraining.length === 0) {
    return { count: 0, limitingMaterialId: null };
  }

  let count = Number.POSITIVE_INFINITY;
  let limitingMaterialId: string | null = null;
  let limitingOnHand = Number.POSITIVE_INFINITY;

  for (const line of constraining) {
    const available = onHand.get(line.materialId) ?? 0;
    const possible = Math.max(0, Math.floor(available / line.quantity));
    if (
      possible < count ||
      (possible === count && available < limitingOnHand)
    ) {
      count = possible;
      limitingMaterialId = line.materialId;
      limitingOnHand = available;
    }
  }

  return {
    count: Number.isFinite(count) ? count : 0,
    limitingMaterialId,
  };
}

/**
 * When several recipes share a material (one print across sizes), report how many
 * garments that material can cover in total. Per-size blanks still cap each variant.
 */
export function sharedMaterialCaps(recipes: Recipe[], onHand: Map<string, number>): SharedCap[] {
  const grouped = new Map<string, { recipeIds: string[]; quantities: number[] }>();

  for (const recipe of recipes) {
    const seen = new Set<string>();
    for (const line of recipe.lines) {
      if (line.quantity <= 0 || seen.has(line.materialId)) continue;
      seen.add(line.materialId);
      const entry = grouped.get(line.materialId) ?? { recipeIds: [], quantities: [] };
      entry.recipeIds.push(recipe.id);
      entry.quantities.push(line.quantity);
      grouped.set(line.materialId, entry);
    }
  }

  const caps: SharedCap[] = [];
  for (const [materialId, entry] of grouped) {
    if (entry.recipeIds.length < 2) continue;
    const available = onHand.get(materialId) ?? 0;
    const first = entry.quantities[0] ?? 0;
    const uniform = entry.quantities.every((quantity) => quantity === first) ? first : null;
    caps.push({
      materialId,
      recipeIds: entry.recipeIds,
      onHand: available,
      quantityPerUnit: uniform,
      maxUnits: uniform !== null && uniform > 0 ? Math.max(0, Math.floor(available / uniform)) : null,
    });
  }

  caps.sort((a, b) => a.materialId.localeCompare(b.materialId));
  return caps;
}

/**
 * Walk lines in the given order (oldest open order first) and reserve stock.
 * Later lines see what earlier lines already claimed, so a shared print is not double-counted.
 */
export function allocateBuilds(
  onHand: Map<string, number>,
  lines: DemandLine[],
  recipesById: Map<string, Recipe>,
): Allocation[] {
  const stock = new Map(onHand);
  const allocations: Allocation[] = [];

  for (const line of lines) {
    const recipe = line.recipeId ? recipesById.get(line.recipeId) : undefined;
    const constraining = recipe?.lines.filter((recipeLine) => recipeLine.quantity > 0) ?? [];
    if (!recipe || constraining.length === 0 || line.quantity <= 0) {
      allocations.push({ lineId: line.id, quantity: 0 });
      continue;
    }

    let possible = Math.floor(line.quantity);
    for (const recipeLine of constraining) {
      const available = stock.get(recipeLine.materialId) ?? 0;
      possible = Math.min(possible, Math.max(0, Math.floor(available / recipeLine.quantity)));
    }

    if (possible > 0) {
      for (const recipeLine of constraining) {
        const used = recipeLine.quantity * possible;
        stock.set(recipeLine.materialId, roundQty((stock.get(recipeLine.materialId) ?? 0) - used));
      }
    }

    allocations.push({ lineId: line.id, quantity: possible });
  }

  return allocations;
}

/**
 * Ledger rows for marking a quantity built.
 * A blank override replaces only the blank line for this build. The recipe stays as it was.
 */
export function consumptionForBuild(lines: RecipeLine[], quantity: number, blankOverrideId: string | null) {
  return lines
    .filter((line) => line.quantity > 0)
    .map((line) => ({
      materialId: line.role === "blank" && blankOverrideId ? blankOverrideId : line.materialId,
      quantity: roundQty(-line.quantity * quantity),
    }));
}
