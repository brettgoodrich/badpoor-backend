"use server";

import { eq } from "drizzle-orm";
import { redirectWith, refreshShop } from "@/lib/action";
import { getDb } from "@/lib/db";
import {
  finishedMovements,
  materialVariants,
  materials,
  movements,
  recipeExclusions,
  recipeLines,
  recipeOverrides,
  recipes,
  shopifyVariants,
} from "@/lib/db/schema";
import { readString } from "@/lib/format";
import { consumptionForBuild, deficitsAfter, onHandByMaterial } from "@/lib/inventory/calculations";
import { parseOptions } from "@/lib/inventory/load";
import { concreteLines } from "@/lib/inventory/resolve";

export async function makeAhead(formData: FormData) {
  const recipeId = readString(formData, "recipeId");
  const back = recipeId ? `/recipes/${recipeId}` : "/recipes";
  if (!recipeId) redirectWith("/recipes", "error", "Missing recipe.");

  const entries: { shopifyVariantId: string; quantity: number }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("qty:") || typeof value !== "string" || value.trim() === "") continue;
    const quantity = Number(value);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      redirectWith(back, "error", "Make-ahead quantities are whole numbers greater than zero. Leave a cell blank to skip it.");
    }
    entries.push({ shopifyVariantId: key.slice(4), quantity });
  }
  if (entries.length === 0) redirectWith(back, "error", "Enter a quantity for at least one size.");

  const database = await getDb();
  const recipe = database.select().from(recipes).where(eq(recipes.id, recipeId)).get();
  if (!recipe) redirectWith("/recipes", "error", "That recipe is gone.");
  const lines = database.select().from(recipeLines).where(eq(recipeLines.recipeId, recipeId)).all();
  const exclusions = database.select().from(recipeExclusions).all();
  const overrides = database.select().from(recipeOverrides).where(eq(recipeOverrides.recipeId, recipeId)).all();
  const blanks = database.select().from(materialVariants).all();
  const catalog = database.select().from(shopifyVariants).all();
  const materialNames = new Map(database.select().from(materials).all().map((material) => [material.id, material.name]));

  const planned: { shopifyVariantId: string; quantity: number; consumed: { materialId: string; quantity: number }[]; label: string }[] = [];
  for (const entry of entries) {
    const variant = catalog.find((item) => item.id === entry.shopifyVariantId);
    if (!variant || variant.productId !== recipe.shopifyProductId) {
      redirectWith(back, "error", "That size is not on this product.");
    }
    const resolved = concreteLines(
      {
        lines: lines.map((line) => ({
          materialId: line.materialId,
          role: line.role,
          quantity: line.quantity,
          excludedVariantIds: exclusions.filter((row) => row.recipeLineId === line.id).map((row) => row.variantId),
        })),
        overrides: overrides.map((row) => ({ shopifyVariantId: row.shopifyVariantId, blankVariantId: row.blankVariantId })),
      },
      { shopifyVariantId: variant.id, title: variant.title, options: parseOptions(variant.selectedOptions) },
      blanks,
    );
    if (!resolved.complete) redirectWith(back, "error", `${variant.title} does not match a size and color on this blank.`);
    planned.push({
      shopifyVariantId: variant.id,
      quantity: entry.quantity,
      label: variant.title,
      consumed: consumptionForBuild(resolved.lines, entry.quantity, null),
    });
  }

  const onHand = onHandByMaterial(
    database.select().from(movements).all().map((movement) => ({
      materialId: movement.variantId ?? movement.materialId,
      quantity: movement.quantity,
    })),
  );
  const deficits = deficitsAfter(
    onHand,
    planned.flatMap((entry) => entry.consumed),
  );
  const now = new Date().toISOString();
  const note = readString(formData, "note") || `Made ahead ${planned.map((entry) => `${entry.quantity} ${entry.label}`).join(", ")}.`;

  database.transaction((tx) => {
    for (const entry of planned) {
      tx.insert(finishedMovements)
        .values({
          id: crypto.randomUUID(),
          shopifyVariantId: entry.shopifyVariantId,
          type: "make",
          quantity: entry.quantity,
          note,
          buildId: null,
          createdAt: now,
        })
        .run();
      for (const consumed of entry.consumed) {
        const variant = blanks.find((item) => item.id === consumed.materialId);
        tx.insert(movements)
          .values({
            id: crypto.randomUUID(),
            materialId: variant?.materialId ?? consumed.materialId,
            variantId: variant?.id ?? null,
            type: "consume",
            quantity: consumed.quantity,
            note,
            buildId: null,
            createdAt: now,
          })
          .run();
      }
    }
  });

  refreshShop();
  const warning = deficits
    .map((row) => `${materialNames.get(row.materialId) ?? row.materialId} is now ${row.quantity}`)
    .join(", ");
  redirectWith(
    back,
    "notice",
    warning
      ? `Made ${planned.reduce((sum, entry) => sum + entry.quantity, 0)} ahead. ${warning}.`
      : `Made ${planned.reduce((sum, entry) => sum + entry.quantity, 0)} ahead. Materials were consumed. Shopify was not changed.`,
  );
}

export async function adjustFinished(formData: FormData) {
  const recipeId = readString(formData, "recipeId");
  const shopifyVariantId = readString(formData, "shopifyVariantId");
  const quantity = Number(readString(formData, "quantity"));
  const note = readString(formData, "note");
  const back = recipeId ? `/recipes/${recipeId}` : "/recipes";
  if (!shopifyVariantId) redirectWith(back, "error", "Choose a variant.");
  if (!Number.isInteger(quantity) || quantity === 0) {
    redirectWith(back, "error", "Enter a whole number other than zero. Use a negative number to count down.");
  }
  if (!note) redirectWith(back, "error", "Add a note so the adjustment has a reason.");

  const database = await getDb();
  const variant = database.select().from(shopifyVariants).where(eq(shopifyVariants.id, shopifyVariantId)).get();
  if (!variant) redirectWith(back, "error", "That variant is not in the local catalog.");
  database
    .insert(finishedMovements)
    .values({
      id: crypto.randomUUID(),
      shopifyVariantId,
      type: "adjustment",
      quantity,
      note,
      buildId: null,
      createdAt: new Date().toISOString(),
    })
    .run();
  refreshShop();
  redirectWith(back, "notice", "Finished count adjusted. Materials were not changed.");
}
