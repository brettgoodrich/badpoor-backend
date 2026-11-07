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
  shopifyProductId: string | null;
  customTitle: string | null;
};

export function normalizeTitle(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizePart(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase().replace(/\s+/g, " ") ?? "";
  return normalized.length > 0 ? normalized : null;
}

const SIZE_ALIASES: Record<string, string> = {
  xs: "xs",
  "extra small": "xs",
  s: "s",
  small: "s",
  m: "m",
  med: "m",
  medium: "m",
  l: "l",
  large: "l",
  xl: "xl",
  "extra large": "xl",
  xxl: "2xl",
  "2xl": "2xl",
  "2x": "2xl",
  yxs: "yxs",
  "youth xs": "yxs",
  "youth extra small": "yxs",
  ys: "ys",
  "youth s": "ys",
  "youth small": "ys",
  ym: "ym",
  "youth m": "ym",
  "youth medium": "ym",
  yl: "yl",
  "youth l": "yl",
  "youth large": "yl",
  yxl: "yxl",
  "youth xl": "yxl",
  "youth extra large": "yxl",
};

const COLOR_ALIASES: Record<string, string> = {
  black: "black",
  blk: "black",
  white: "white",
  wht: "white",
  navy: "navy",
  nav: "navy",
  red: "red",
  royal: "royal",
  "royal blue": "royal",
  grey: "gray",
  gray: "gray",
  sport: "sport grey",
  "sport grey": "sport grey",
  "sport gray": "sport grey",
};

export function canonicalSize(value: string | null | undefined) {
  const key = normalizePart(value);
  if (!key) return null;
  return SIZE_ALIASES[key] ?? key;
}

export function canonicalColor(value: string | null | undefined) {
  const key = normalizePart(value);
  if (!key) return null;
  return COLOR_ALIASES[key] ?? key;
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
 * Pick the blank variant whose size and color match, treating Small as S and YOUTH L as YL.
 * When the Shopify variant names a color, only that color matches.
 * When it has no color, match only if that size exists in exactly one color.
 */
export function matchBlank(
  variant: { options: SelectedOption[]; title: string },
  blanks: BlankCandidate[],
) {
  const { size, color } = variantSizeAndColor(variant.options, variant.title);
  const wantedSize = canonicalSize(size);
  const wantedColor = canonicalColor(color);
  const sized = blanks.filter((blank) => canonicalSize(blank.size) === wantedSize);
  if (wantedColor) {
    return sized.find((blank) => canonicalColor(blank.color) === wantedColor)?.id ?? null;
  }
  return sized.length === 1 ? (sized[0]?.id ?? null) : null;
}

export function resolveRecipeId(
  line: { variantId: string | null; title: string; name?: string | null },
  recipes: RecipeMatch[],
  productIdByVariant: Map<string, string> = new Map(),
) {
  if (line.variantId) {
    const productId = productIdByVariant.get(line.variantId);
    const productRecipe = productId
      ? recipes.find((recipe) => recipe.matchType === "product" && recipe.shopifyProductId === productId)
      : undefined;
    if (productRecipe) return productRecipe.id;
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
