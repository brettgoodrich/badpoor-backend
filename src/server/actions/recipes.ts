"use server";

import { eq } from "drizzle-orm";
import { redirectWith, refreshShop } from "@/lib/action";
import { getDb } from "@/lib/db";
import { materials, recipeLines, recipes, shopifyVariants } from "@/lib/db/schema";
import { readString } from "@/lib/format";
import { normalizeTitle } from "@/lib/inventory/matching";

type Database = Awaited<ReturnType<typeof getDb>>;
type LineInput = { materialId: string; quantity: number };

function parseLineList(raw: string): { ok: true; lines: LineInput[] } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Recipe lines were not readable." };
  }
  if (!Array.isArray(parsed)) return { ok: false, error: "Recipe lines were not readable." };

  const lines: LineInput[] = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== "object") continue;
    const materialId = "materialId" in entry && typeof entry.materialId === "string" ? entry.materialId.trim() : "";
    const quantity = "quantity" in entry ? Number(entry.quantity) : Number.NaN;
    if (!materialId) continue;
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return { ok: false, error: "Each material needs a quantity greater than zero." };
    }
    lines.push({ materialId, quantity });
  }
  if (lines.length === 0) return { ok: false, error: "Add at least one material." };
  return { ok: true, lines };
}

function missingMaterial(database: Database, materialIds: string[]) {
  const known = new Set(database.select({ id: materials.id }).from(materials).all().map((row) => row.id));
  return materialIds.some((id) => !known.has(id)) ? "One of those materials no longer exists." : null;
}

function replaceVariantRecipe(
  database: Database,
  variantId: string,
  lines: LineInput[],
  notes: string | null,
) {
  const now = new Date().toISOString();
  database.transaction((tx) => {
    const existing = tx.select().from(recipes).where(eq(recipes.shopifyVariantId, variantId)).get();
    const id = existing?.id ?? crypto.randomUUID();
    if (existing) {
      tx.delete(recipes).where(eq(recipes.id, existing.id)).run();
    }
    tx.insert(recipes)
      .values({
        id,
        matchType: "variant",
        shopifyVariantId: variantId,
        customTitle: null,
        notes,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      })
      .run();
    tx.insert(recipeLines)
      .values(
        lines.map((line) => ({
          id: crypto.randomUUID(),
          recipeId: id,
          materialId: line.materialId,
          quantity: line.quantity,
        })),
      )
      .run();
  });
}

export async function saveBulkRecipes(formData: FormData) {
  let payload: unknown;
  try {
    payload = JSON.parse(readString(formData, "payload"));
  } catch {
    redirectWith("/recipes/setup", "error", "The recipe form was not readable.");
  }
  if (!payload || typeof payload !== "object" || !("variants" in payload) || !Array.isArray(payload.variants)) {
    redirectWith("/recipes/setup", "error", "The recipe form was not readable.");
  }

  const database = await getDb();
  const variantIds = new Set(
    database.select({ id: shopifyVariants.id }).from(shopifyVariants).all().map((row) => row.id),
  );
  const selected: { variantId: string; lines: LineInput[] }[] = [];

  for (const entry of payload.variants) {
    if (!entry || typeof entry !== "object") continue;
    const include = "include" in entry && entry.include === true;
    const variantId = "variantId" in entry && typeof entry.variantId === "string" ? entry.variantId : "";
    if (!include || !variantId) continue;
    if (!variantIds.has(variantId)) {
      redirectWith("/recipes/setup", "error", "A variant in that form is not in the local catalog.");
    }
    const parsed = parseLineList(JSON.stringify("lines" in entry ? entry.lines : []));
    if (!parsed.ok) redirectWith("/recipes/setup", "error", parsed.error);
    selected.push({ variantId, lines: parsed.lines });
  }

  if (selected.length === 0) {
    redirectWith("/recipes/setup", "error", "Check at least one variant and give it a print or a blank.");
  }
  const missing = missingMaterial(
    database,
    selected.flatMap((row) => row.lines.map((line) => line.materialId)),
  );
  if (missing) redirectWith("/recipes/setup", "error", missing);

  const notes = readString(formData, "notes") || null;
  for (const row of selected) {
    replaceVariantRecipe(database, row.variantId, row.lines, notes);
  }

  refreshShop();
  redirectWith("/recipes", "notice", `Saved recipes for ${selected.length} variant${selected.length === 1 ? "" : "s"}.`);
}

export async function saveCustomRecipe(formData: FormData) {
  const title = readString(formData, "title");
  if (!title) {
    redirectWith("/recipes/custom", "error", "Enter the custom line title exactly as it appears on the order.");
  }
  const parsed = parseLineList(readString(formData, "lines"));
  if (!parsed.ok) redirectWith("/recipes/custom", "error", parsed.error);

  const database = await getDb();
  const missing = missingMaterial(
    database,
    parsed.lines.map((line) => line.materialId),
  );
  if (missing) redirectWith("/recipes/custom", "error", missing);

  const normalized = normalizeTitle(title);
  const clash = database
    .select()
    .from(recipes)
    .all()
    .find(
      (recipe) =>
        recipe.matchType === "custom_title" &&
        recipe.customTitle !== null &&
        normalizeTitle(recipe.customTitle) === normalized,
    );
  if (clash) {
    redirectWith(`/recipes/${clash.id}`, "error", "A recipe already uses that custom title. Edit it instead.");
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  database.transaction((tx) => {
    tx.insert(recipes)
      .values({
        id,
        matchType: "custom_title",
        shopifyVariantId: null,
        customTitle: title,
        notes: readString(formData, "notes") || null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    tx.insert(recipeLines)
      .values(
        parsed.lines.map((line) => ({
          id: crypto.randomUUID(),
          recipeId: id,
          materialId: line.materialId,
          quantity: line.quantity,
        })),
      )
      .run();
  });
  refreshShop();
  redirectWith("/recipes", "notice", `Custom line “${title}” now has a recipe.`);
}

export async function updateRecipe(formData: FormData) {
  const id = readString(formData, "id");
  if (!id) redirectWith("/recipes", "error", "Missing recipe.");
  const parsed = parseLineList(readString(formData, "lines"));
  if (!parsed.ok) redirectWith(`/recipes/${id}`, "error", parsed.error);

  const database = await getDb();
  const existing = database.select().from(recipes).where(eq(recipes.id, id)).get();
  if (!existing) redirectWith("/recipes", "error", "That recipe is gone.");
  const missing = missingMaterial(
    database,
    parsed.lines.map((line) => line.materialId),
  );
  if (missing) redirectWith(`/recipes/${id}`, "error", missing);

  database.transaction((tx) => {
    tx.update(recipes)
      .set({ notes: readString(formData, "notes") || null, updatedAt: new Date().toISOString() })
      .where(eq(recipes.id, id))
      .run();
    tx.delete(recipeLines).where(eq(recipeLines.recipeId, id)).run();
    tx.insert(recipeLines)
      .values(
        parsed.lines.map((line) => ({
          id: crypto.randomUUID(),
          recipeId: id,
          materialId: line.materialId,
          quantity: line.quantity,
        })),
      )
      .run();
  });
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
