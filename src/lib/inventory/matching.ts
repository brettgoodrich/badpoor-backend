export type SelectedOption = {
  name: string;
  value: string;
};

export type BlankCandidate = {
  id: string;
  size: string | null;
  color: string | null;
};

export type RecipeMatch = {
  id: string;
  matchType: string;
  shopifyVariantId: string | null;
  customTitle: string | null;
};

export function normalizeTitle(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizePart(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase().replace(/\s+/g, " ") ?? "";
  return normalized.length > 0 ? normalized : null;
}

export function variantSizeAndColor(options: SelectedOption[], variantTitle: string) {
  const sizeOption = options.find((option) => /size/i.test(option.name));
  const colorOption = options.find((option) => /colou?r/i.test(option.name));
  if (sizeOption || colorOption) {
    return {
      size: sizeOption?.value ?? null,
      color: colorOption?.value ?? null,
    };
  }

  const parts = variantTitle
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && part.toLowerCase() !== "default title");

  if (parts.length >= 2) {
    return { size: parts[0] ?? null, color: parts[1] ?? null };
  }
  if (parts.length === 1) {
    return { size: parts[0] ?? null, color: null };
  }
  return { size: null, color: null };
}

/**
 * Pick the blank whose size matches the variant, preferring a color match when both sides have one.
 * A color-specific blank does not match a variant that has no color.
 */
export function matchBlank(
  variant: { options: SelectedOption[]; title: string },
  blanks: BlankCandidate[],
) {
  const { size, color } = variantSizeAndColor(variant.options, variant.title);
  const wantedSize = normalizePart(size);
  const wantedColor = normalizePart(color);
  let best: { id: string; score: number } | null = null;

  for (const blank of blanks) {
    const blankSize = normalizePart(blank.size);
    const blankColor = normalizePart(blank.color);
    if (wantedSize !== blankSize) continue;
    if (blankColor && wantedColor && blankColor !== wantedColor) continue;
    if (blankColor && !wantedColor) continue;

    let score = 1;
    if (wantedSize && blankSize === wantedSize) score += 2;
    if (wantedColor && blankColor === wantedColor) score += 3;
    if (wantedColor && !blankColor) score += 1;

    if (!best || score > best.score) {
      best = { id: blank.id, score };
    }
  }

  return best?.id ?? null;
}

export function resolveRecipeId(
  line: { variantId: string | null; title: string; name?: string | null },
  recipes: RecipeMatch[],
) {
  if (line.variantId) {
    return (
      recipes.find(
        (recipe) => recipe.matchType === "variant" && recipe.shopifyVariantId === line.variantId,
      )?.id ?? null
    );
  }

  const titles = [line.title, line.name].filter((value): value is string => Boolean(value));
  for (const title of titles) {
    const normalized = normalizeTitle(title);
    const match = recipes.find(
      (recipe) =>
        recipe.matchType === "custom_title" &&
        recipe.customTitle !== null &&
        normalizeTitle(recipe.customTitle) === normalized,
    );
    if (match) return match.id;
  }

  return null;
}
