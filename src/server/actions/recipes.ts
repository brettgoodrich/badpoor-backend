"use server";

import { eq } from "drizzle-orm";
import { redirectWith, refreshShop } from "@/lib/action";
import { getDb } from "@/lib/db";
import {
  materialVariants,
  materials,
  recipeExclusions,
  recipeLines,
  recipeOverrides,
  recipes,
  shopifyProducts,
  shopifyVariants,
} from "@/lib/db/schema";
import { readString } from "@/lib/format";
import { normalizeTitle } from "@/lib/inventory/matching";

type Database = Awaited<ReturnType<typeof getDb>>;

type RecipePayload = {
  productId: string | null;
  title: string | null;
  print: { materialId: string; quantity: number } | null;
  blank: { materialId: string; quantity: number; excludedVariantIds: string[] } | null;
  overrides: { shopifyVariantId: string; blankVariantId: string }[];
};

function parsePayload(raw: string): { ok: true; payload: RecipePayload } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "The recipe form was not readable." };
  }
  if (!parsed || typeof parsed !== "object") return { ok: false, error: "The recipe form was not readable." };
  const record = parsed as Record<string, unknown>;
  const productId = typeof record.productId === "string" && record.productId.trim() ? record.productId.trim() : null;
  const title = typeof record.title === "string" && record.title.trim() ? record.title.trim() : null;
  const print = readPart(record.print);
  const blankRecord = record.blank;
  let blank: RecipePayload["blank"] = null;
  if (blankRecord && typeof blankRecord === "object") {
    const part = readPart(blankRecord);
    const excluded = Array.isArray((blankRecord as { excludedVariantIds?: unknown }).excludedVariantIds)
      ? (blankRecord as { excludedVariantIds: unknown[] }).excludedVariantIds.filter((id): id is string => typeof id === "string" && id.length > 0)
      : [];
    if (part) blank = { ...part, excludedVariantIds: excluded };
  }
  const overrides = Array.isArray(record.overrides)
    ? record.overrides.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const shopifyVariantId = "shopifyVariantId" in entry && typeof entry.shopifyVariantId === "string" ? entry.shopifyVariantId : "";
        const blankVariantId = "blankVariantId" in entry && typeof entry.blankVariantId === "string" ? entry.blankVariantId : "";
        return shopifyVariantId && blankVariantId ? [{ shopifyVariantId, blankVariantId }] : [];
      })
    : [];
  if (!print && !blank) return { ok: false, error: "Add a print or a blank." };
  return { ok: true, payload: { productId, title, print, blank, overrides } };
}

function readPart(value: unknown): { materialId: string; quantity: number } | null {
  if (!value || typeof value !== "object") return null;
  const materialId = "materialId" in value && typeof value.materialId === "string" ? value.materialId.trim() : "";
  const quantity = "quantity" in value ? Number(value.quantity) : Number.NaN;
  if (!materialId) return null;
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  return { materialId, quantity };
}

function validatePayload(database: Database, payload: RecipePayload, productId: string | null) {
  const materialRows = database.select().from(materials).all();
  const known = new Map(materialRows.map((material) => [material.id, material]));
  const variantRows = database.select().from(materialVariants).all();
  if (payload.print) {
    const print = known.get(payload.print.materialId);
    if (!print || print.type !== "print") return "Pick a print.";
  }
  if (payload.blank) {
    const blank = known.get(payload.blank.materialId);
    if (!blank || blank.type !== "blank") return "Pick a blank.";
    const owned = new Set(variantRows.filter((variant) => variant.materialId === blank.id).map((variant) => variant.id));
    if (payload.blank.excludedVariantIds.some((id) => !owned.has(id))) return "An unchecked size or color is not on that blank.";
    for (const override of payload.overrides) {
      const variant = variantRows.find((entry) => entry.id === override.blankVariantId);
      if (!variant || variant.materialId !== blank.id || variant.archivedAt) return "An override points at a size or color that is not on this blank.";
    }
  } else if (payload.overrides.length > 0) {
    return "Overrides need a blank.";
  }
  if (productId) {
    const productVariants = new Set(
      database.select().from(shopifyVariants).all().filter((variant) => variant.productId === productId).map((variant) => variant.id),
    );
    if (payload.overrides.some((override) => !productVariants.has(override.shopifyVariantId))) {
      return "An override is for a variant that is not on this product.";
    }
  }
  return null;
}

function writeRecipe(
  database: Database,
  id: string,
  matchType: "product" | "custom_title",
  productId: string | null,
  title: string | null,
  notes: string | null,
  payload: RecipePayload,
  createdAt: string | null,
) {
  const now = new Date().toISOString();
  database.transaction((tx) => {
    tx.delete(recipes).where(eq(recipes.id, id)).run();
    tx.insert(recipes)
      .values({
        id,
        matchType,
        shopifyProductId: productId,
        customTitle: title,
        notes,
        createdAt: createdAt ?? now,
        updatedAt: now,
      })
      .run();
    const lines = [
      payload.print ? { ...payload.print, role: "print" as const, excluded: [] as string[] } : null,
      payload.blank ? { materialId: payload.blank.materialId, quantity: payload.blank.quantity, role: "blank" as const, excluded: payload.blank.excludedVariantIds } : null,
    ].filter((line): line is NonNullable<typeof line> => Boolean(line));
    for (const line of lines) {
      const lineId = crypto.randomUUID();
      tx.insert(recipeLines)
        .values({ id: lineId, recipeId: id, materialId: line.materialId, role: line.role, quantity: line.quantity })
        .run();
      if (line.excluded.length > 0) {
        tx.insert(recipeExclusions)
          .values(line.excluded.map((variantId) => ({ id: crypto.randomUUID(), recipeLineId: lineId, variantId })))
          .run();
      }
    }
    if (payload.overrides.length > 0) {
      tx.insert(recipeOverrides)
        .values(
          payload.overrides.map((override) => ({
            id: crypto.randomUUID(),
            recipeId: id,
            shopifyVariantId: override.shopifyVariantId,
            blankVariantId: override.blankVariantId,
          })),
        )
        .run();
    }
  });
}

export async function saveProductRecipe(formData: FormData) {
  const parsed = parsePayload(readString(formData, "payload"));
  if (!parsed.ok) redirectWith("/recipes/setup", "error", parsed.error);
  const productId = parsed.payload.productId;
  if (!productId) redirectWith("/recipes/setup", "error", "Choose a Shopify product.");

  const database = await getDb();
  const product = database.select().from(shopifyProducts).where(eq(shopifyProducts.id, productId)).get();
  if (!product) redirectWith("/recipes/setup", "error", "That product is not in the local catalog.");
  const invalid = validatePayload(database, parsed.payload, productId);
  if (invalid) redirectWith("/recipes/setup", "error", invalid);

  const existing = database.select().from(recipes).where(eq(recipes.shopifyProductId, productId)).get();
  writeRecipe(
    database,
    existing?.id ?? crypto.randomUUID(),
    "product",
    productId,
    null,
    readString(formData, "notes") || null,
    parsed.payload,
    existing?.createdAt ?? null,
  );
  refreshShop();
  redirectWith("/recipes", "notice", `Saved one recipe for ${product.title}. Every checked size and color is included.`);
}

export async function saveCustomRecipe(formData: FormData) {
  const parsed = parsePayload(readString(formData, "payload"));
  if (!parsed.ok) redirectWith("/recipes/custom", "error", parsed.error);
  const title = parsed.payload.title ?? readString(formData, "title");
  if (!title) redirectWith("/recipes/custom", "error", "Enter the custom line title exactly as it appears on the order.");

  const database = await getDb();
  const invalid = validatePayload(database, { ...parsed.payload, overrides: [] }, null);
  if (invalid) redirectWith("/recipes/custom", "error", invalid);
  const normalized = normalizeTitle(title);
  const clash = database
    .select()
    .from(recipes)
    .all()
    .find((recipe) => recipe.matchType === "custom_title" && recipe.customTitle && normalizeTitle(recipe.customTitle) === normalized);
  if (clash) redirectWith(`/recipes/${clash.id}`, "error", "A recipe already uses that custom title. Edit it instead.");

  writeRecipe(database, crypto.randomUUID(), "custom_title", null, title, readString(formData, "notes") || null, { ...parsed.payload, overrides: [] }, null);
  refreshShop();
  redirectWith("/recipes", "notice", `Custom line “${title}” now has a recipe.`);
}

export async function updateRecipe(formData: FormData) {
  const id = readString(formData, "id");
  if (!id) redirectWith("/recipes", "error", "Missing recipe.");
  const parsed = parsePayload(readString(formData, "payload"));
  if (!parsed.ok) redirectWith(`/recipes/${id}`, "error", parsed.error);
  const database = await getDb();
  const existing = database.select().from(recipes).where(eq(recipes.id, id)).get();
  if (!existing) redirectWith("/recipes", "error", "That recipe is gone.");
  const invalid = validatePayload(database, parsed.payload, existing.shopifyProductId);
  if (invalid) redirectWith(`/recipes/${id}`, "error", invalid);
  writeRecipe(
    database,
    id,
    existing.matchType === "custom_title" ? "custom_title" : "product",
    existing.shopifyProductId,
    existing.customTitle,
    readString(formData, "notes") || null,
    existing.matchType === "custom_title" ? { ...parsed.payload, overrides: [] } : parsed.payload,
    existing.createdAt,
  );
  refreshShop();
  redirectWith(`/recipes/${id}`, "notice", "Recipe updated.");
}

export async function deleteRecipe(formData: FormData) {
  const id = readString(formData, "id");
  if (!id) redirectWith("/recipes", "error", "Missing recipe.");
  const database = await getDb();
  database.delete(recipes).where(eq(recipes.id, id)).run();
  refreshShop();
  redirectWith("/recipes", "notice", "Recipe removed. Open orders that used it are unmapped again.");
}
