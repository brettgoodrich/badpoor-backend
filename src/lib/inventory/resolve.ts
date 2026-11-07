import type { RecipeLine } from "./calculations";
import { matchBlank, type SelectedOption } from "./matching";

export type ModelRecipeLine = {
  materialId: string;
  role: string;
  quantity: number;
  excludedVariantIds?: string[];
};

export type VariantOverride = {
  shopifyVariantId: string;
  blankVariantId: string;
};

export type BlankChoice = {
  id: string;
  materialId: string;
  size: string | null;
  color: string | null;
  archived?: boolean;
};

export type ResolveSubject = {
  shopifyVariantId: string | null;
  title: string;
  options: SelectedOption[];
};

/**
 * Turn a model-level recipe into the stock lines for one Shopify variant.
 * Blank lines match size and color, skip excluded variants, and honor an override.
 * `complete` is false when a blank line has no variant to consume.
 */
export function concreteLines(
  recipe: { lines: ModelRecipeLine[]; overrides?: VariantOverride[] },
  subject: ResolveSubject,
  blanks: BlankChoice[],
) {
  const lines: RecipeLine[] = [];
  let complete = true;

  for (const line of recipe.lines) {
    if (line.quantity <= 0) continue;
    if (line.role !== "blank") {
      lines.push({ materialId: line.materialId, quantity: line.quantity, role: line.role });
      continue;
    }

    const chosen = resolveBlankVariant(line, recipe.overrides ?? [], subject, blanks);
    if (!chosen) {
      complete = false;
      continue;
    }
    lines.push({ materialId: chosen, quantity: line.quantity, role: "blank" });
  }

  if (lines.length === 0) complete = false;
  return { lines, complete };
}

export function resolveBlankVariant(
  line: ModelRecipeLine,
  overrides: VariantOverride[],
  subject: ResolveSubject,
  blanks: BlankChoice[],
) {
  const active = blanks.filter((blank) => blank.materialId === line.materialId && !blank.archived);
  const overrideId = subject.shopifyVariantId
    ? overrides.find((override) => override.shopifyVariantId === subject.shopifyVariantId)?.blankVariantId
    : undefined;
  if (overrideId && active.some((blank) => blank.id === overrideId)) return overrideId;

  const excluded = new Set(line.excludedVariantIds ?? []);
  return matchBlank(
    { title: subject.title, options: subject.options },
    active.filter((blank) => !excluded.has(blank.id)),
  );
}
