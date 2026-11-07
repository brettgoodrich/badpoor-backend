export type AxisValue = {
  value: string;
  position: number;
  archived?: boolean;
};

export type MatrixPair = {
  size: string;
  color: string;
};

export type ExistingVariant = MatrixPair & {
  id: string;
  archived?: boolean;
};

export function parseOptionList(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  const pieces = trimmed.includes(",") || trimmed.includes("\n") || trimmed.includes("|")
    ? trimmed.split(/[,|\n]/)
    : trimmed.split(/\s+/);
  const seen = new Set<string>();
  const values: string[] = [];
  for (const piece of pieces) {
    const value = piece.trim().replace(/\s+/g, " ");
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    values.push(value);
  }
  return values;
}

export function activePairs(sizes: AxisValue[], colors: AxisValue[]): MatrixPair[] {
  const orderedSizes = sizes.filter((size) => !size.archived).sort((a, b) => a.position - b.position);
  const orderedColors = colors.filter((color) => !color.archived).sort((a, b) => a.position - b.position);
  return orderedSizes.flatMap((size) => orderedColors.map((color) => ({ size: size.value, color: color.value })));
}

export function missingCombos(wanted: MatrixPair[], existing: MatrixPair[]) {
  const have = new Set(existing.map((pair) => pairKey(pair.size, pair.color)));
  return wanted.filter((pair) => !have.has(pairKey(pair.size, pair.color)));
}

export function pairKey(size: string, color: string) {
  return `${size.trim().toLowerCase()}\0${color.trim().toLowerCase()}`;
}

export type RemovalPlan = {
  deleteIds: string[];
  archiveIds: string[];
};

/** Drop an axis value. Unreferenced variants are deleted. Referenced ones are archived. */
export function planAxisRemoval(
  variants: Array<ExistingVariant & { referenced: boolean }>,
  axis: "size" | "color",
  value: string,
): RemovalPlan {
  const key = value.trim().toLowerCase();
  const affected = variants.filter((variant) => (axis === "size" ? variant.size : variant.color).trim().toLowerCase() === key);
  const referenced = affected.some((variant) => variant.referenced);
  if (referenced) {
    return {
      deleteIds: [],
      archiveIds: affected.filter((variant) => !variant.archived).map((variant) => variant.id),
    };
  }
  return {
    deleteIds: affected.map((variant) => variant.id),
    archiveIds: [],
  };
}
