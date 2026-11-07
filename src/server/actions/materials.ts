"use server";

import { and, eq } from "drizzle-orm";
import { redirectWith, refreshShop, isSqliteConstraint } from "@/lib/action";
import { getDb } from "@/lib/db";
import {
  materialOptions,
  materialVariants,
  materials,
  movements,
  movementTypes,
  printSeries,
  recipeLines,
} from "@/lib/db/schema";
import { readString } from "@/lib/format";
import { activePairs, missingCombos, pairKey, parseOptionList, planAxisRemoval } from "@/lib/inventory/matrix";

const movementTypeSet = new Set<string>(movementTypes);

function nowIso() {
  return new Date().toISOString();
}

export async function createBlankModel(formData: FormData) {
  const name = readString(formData, "name");
  const sizes = parseOptionList(readString(formData, "sizes"));
  const colors = parseOptionList(readString(formData, "colors"));
  if (!name) redirectWith("/materials", "error", "Name the blank model.");
  if (sizes.length === 0 || colors.length === 0) {
    redirectWith("/materials", "error", "A blank model needs at least one size and one color. The grid is generated from those.");
  }

  const database = await getDb();
  const id = crypto.randomUUID();
  const now = nowIso();
  database.transaction((tx) => {
    tx.insert(materials)
      .values({
        id,
        name,
        type: "blank",
        unit: readString(formData, "unit") || "each",
        notes: readString(formData, "notes") || null,
        brand: readString(formData, "brand") || null,
        styleNumber: readString(formData, "styleNumber") || null,
        ssStyleId: null,
        seriesId: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    tx.insert(materialOptions)
      .values([
        ...sizes.map((value, position) => ({
          id: crypto.randomUUID(),
          materialId: id,
          axis: "size",
          value,
          position,
          archivedAt: null,
        })),
        ...colors.map((value, position) => ({
          id: crypto.randomUUID(),
          materialId: id,
          axis: "color",
          value,
          position,
          archivedAt: null,
        })),
      ])
      .run();
    tx.insert(materialVariants)
      .values(
        sizes.flatMap((size) =>
          colors.map((color) => ({
            id: crypto.randomUUID(),
            materialId: id,
            size,
            color,
            archivedAt: null,
          })),
        ),
      )
      .run();
  });
  refreshShop();
  redirectWith(`/materials/${id}`, "notice", `Created ${sizes.length * colors.length} variants for ${name}.`);
}

export async function createPrintSeries(formData: FormData) {
  const name = readString(formData, "name");
  if (!name) redirectWith("/materials", "error", "Name the print series.");
  const database = await getDb();
  const id = crypto.randomUUID();
  const now = nowIso();
  database.insert(printSeries).values({ id, name, notes: readString(formData, "notes") || null, createdAt: now, updatedAt: now }).run();
  refreshShop();
  redirectWith("/materials", "notice", `Series “${name}” is ready for prints.`);
}

export async function createPrint(formData: FormData) {
  const name = readString(formData, "name");
  if (!name) redirectWith("/materials", "error", "Name the print.");
  const seriesId = readString(formData, "seriesId") || null;
  const database = await getDb();
  const id = crypto.randomUUID();
  const now = nowIso();
  database
    .insert(materials)
    .values({
      id,
      name,
      type: "print",
      unit: "each",
      notes: readString(formData, "notes") || null,
      brand: null,
      styleNumber: null,
      ssStyleId: null,
      seriesId,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  refreshShop();
  redirectWith(`/materials/${id}`, "notice", "Print saved. On hand stays at zero until you record a purchase.");
}

export async function createSimpleMaterial(formData: FormData) {
  const name = readString(formData, "name");
  const type = readString(formData, "type");
  if (!name) redirectWith("/materials", "error", "Name the material.");
  if (type !== "trim" && type !== "other") redirectWith("/materials", "error", "Use a blank model or a print for those types.");
  const database = await getDb();
  const id = crypto.randomUUID();
  const now = nowIso();
  database
    .insert(materials)
    .values({
      id,
      name,
      type,
      unit: readString(formData, "unit") || "each",
      notes: readString(formData, "notes") || null,
      brand: null,
      styleNumber: null,
      ssStyleId: null,
      seriesId: null,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  refreshShop();
  redirectWith(`/materials/${id}`, "notice", "Material saved.");
}

export async function addAxisValues(formData: FormData) {
  const materialId = readString(formData, "materialId");
  const axis = readString(formData, "axis");
  const back = `/materials/${materialId}`;
  if (axis !== "size" && axis !== "color") redirectWith(back, "error", "Choose size or color.");
  const values = parseOptionList(readString(formData, "values"));
  if (values.length === 0) redirectWith(back, "error", "Enter at least one value.");

  const database = await getDb();
  const model = database.select().from(materials).where(eq(materials.id, materialId)).get();
  if (!model || model.type !== "blank") redirectWith("/materials", "error", "That is not a blank model.");

  const existingOptions = database.select().from(materialOptions).where(eq(materialOptions.materialId, materialId)).all();
  const existingVariants = database.select().from(materialVariants).where(eq(materialVariants.materialId, materialId)).all();
  const onThisAxis = existingOptions.filter((option) => option.axis === axis);
  const fresh = values.filter((value) => !onThisAxis.some((option) => option.value.toLowerCase() === value.toLowerCase()));
  const revive = onThisAxis.filter(
    (option) => option.archivedAt && values.some((value) => value.toLowerCase() === option.value.toLowerCase()),
  );
  let position = onThisAxis.reduce((max, option) => Math.max(max, option.position), -1);

  const nextOptions = existingOptions.map((option) => ({
    value: option.value,
    position: option.position,
    archived: Boolean(option.archivedAt) && !revive.some((item) => item.id === option.id),
    axis: option.axis,
  }));
  for (const value of fresh) {
    nextOptions.push({ value, position: ++position, archived: false, axis });
  }
  const wantedPairs = activePairs(
    nextOptions.filter((option) => option.axis === "size"),
    nextOptions.filter((option) => option.axis === "color"),
  );
  const missing = missingCombos(wantedPairs, existingVariants);
  const wantedKeys = new Set(wantedPairs.map((pair) => pairKey(pair.size, pair.color)));

  database.transaction((tx) => {
    if (fresh.length > 0) {
      tx.insert(materialOptions)
        .values(
          fresh.map((value, index) => ({
            id: crypto.randomUUID(),
            materialId,
            axis,
            value,
            position: position - fresh.length + index + 1,
            archivedAt: null,
          })),
        )
        .run();
    }
    for (const option of revive) {
      tx.update(materialOptions).set({ archivedAt: null }).where(eq(materialOptions.id, option.id)).run();
    }
    for (const variant of existingVariants) {
      if (variant.archivedAt && wantedKeys.has(pairKey(variant.size, variant.color))) {
        tx.update(materialVariants).set({ archivedAt: null }).where(eq(materialVariants.id, variant.id)).run();
      }
    }
    for (const pair of missing) {
      const previous = existingVariants.find(
        (variant) => variant.size.toLowerCase() === pair.size.toLowerCase() && variant.color.toLowerCase() === pair.color.toLowerCase(),
      );
      if (previous) {
        tx.update(materialVariants).set({ archivedAt: null }).where(eq(materialVariants.id, previous.id)).run();
      } else {
        tx.insert(materialVariants)
          .values({ id: crypto.randomUUID(), materialId, size: pair.size, color: pair.color, archivedAt: null })
          .run();
      }
    }
    tx.update(materials).set({ updatedAt: nowIso() }).where(eq(materials.id, materialId)).run();
  });

  refreshShop();
  redirectWith(back, "notice", missing.length > 0 ? `Added ${missing.length} new variants.` : "Those values were already on the model.");
}

export async function removeAxisValue(formData: FormData) {
  const materialId = readString(formData, "materialId");
  const axis = readString(formData, "axis");
  const value = readString(formData, "value");
  const back = `/materials/${materialId}`;
  if ((axis !== "size" && axis !== "color") || !value) redirectWith(back, "error", "Missing size or color.");

  const database = await getDb();
  const variants = database.select().from(materialVariants).where(eq(materialVariants.materialId, materialId)).all();
  const movementVariantIds = new Set(
    database
      .select({ variantId: movements.variantId })
      .from(movements)
      .all()
      .map((row) => row.variantId)
      .filter((id): id is string => Boolean(id)),
  );
  const recipeVariantIds = new Set(
    database
      .select({ variantId: recipeLines.variantId })
      .from(recipeLines)
      .all()
      .map((row) => row.variantId)
      .filter((id): id is string => Boolean(id)),
  );
  const plan = planAxisRemoval(
    variants.map((variant) => ({
      ...variant,
      referenced: movementVariantIds.has(variant.id) || recipeVariantIds.has(variant.id),
    })),
    axis,
    value,
  );

  const now = nowIso();
  database.transaction((tx) => {
    for (const id of plan.deleteIds) {
      tx.delete(materialVariants).where(eq(materialVariants.id, id)).run();
    }
    for (const id of plan.archiveIds) {
      tx.update(materialVariants).set({ archivedAt: now }).where(eq(materialVariants.id, id)).run();
    }
    const option = tx
      .select()
      .from(materialOptions)
      .where(and(eq(materialOptions.materialId, materialId), eq(materialOptions.axis, axis), eq(materialOptions.value, value)))
      .get();
    if (option) {
      if (plan.archiveIds.length > 0) {
        tx.update(materialOptions).set({ archivedAt: now }).where(eq(materialOptions.id, option.id)).run();
      } else {
        tx.delete(materialOptions).where(eq(materialOptions.id, option.id)).run();
      }
    }
  });
  refreshShop();
  redirectWith(
    back,
    "notice",
    plan.archiveIds.length > 0
      ? `${value} is archived because a variant already has stock history or a recipe.`
      : `Removed ${value}.`,
  );
}

export async function recordBulkMovement(formData: FormData) {
  const materialId = readString(formData, "materialId");
  const color = readString(formData, "color");
  const type = readString(formData, "type");
  const note = readString(formData, "note");
  const back = `/materials/${materialId}`;
  if (!movementTypeSet.has(type) || type === "consume") redirectWith(back, "error", "Choose a purchase, receipt, or adjustment.");

  const parsed: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("qty:") && typeof value === "string") parsed[key.slice(4)] = value;
  }
  const rawJson = readString(formData, "quantities");
  if (Object.keys(parsed).length === 0 && rawJson) {
    try {
      const decoded = JSON.parse(rawJson) as unknown;
      if (decoded && typeof decoded === "object") Object.assign(parsed, decoded);
    } catch {
      redirectWith(back, "error", "The size quantities were not readable.");
    }
  }
  if (Object.keys(parsed).length === 0) redirectWith(back, "error", "Enter a quantity for at least one size.");

  const database = await getDb();
  const variants = database
    .select()
    .from(materialVariants)
    .where(and(eq(materialVariants.materialId, materialId), eq(materialVariants.color, color)))
    .all();
  const entries: { variantId: string; quantity: number }[] = [];
  for (const [size, raw] of Object.entries(parsed as Record<string, unknown>)) {
    const quantity = Number(raw);
    if (!Number.isFinite(quantity) || quantity === 0) continue;
    if ((type === "purchase" || type === "receive") && quantity < 0) {
      redirectWith(back, "error", "Purchases and receipts have to be greater than zero.");
    }
    const variant = variants.find((entry) => entry.size === size && !entry.archivedAt);
    if (!variant) redirectWith(back, "error", `No active ${size} / ${color} variant on this model.`);
    entries.push({ variantId: variant.id, quantity });
  }
  if (entries.length === 0) redirectWith(back, "error", "Enter a quantity for at least one size.");

  const createdAt = nowIso();
  database.insert(movements)
    .values(
      entries.map((entry) => ({
        id: crypto.randomUUID(),
        materialId,
        variantId: entry.variantId,
        type,
        quantity: entry.quantity,
        note: note || null,
        buildId: null,
        createdAt,
      })),
    )
    .run();
  refreshShop();
  redirectWith(back, "notice", `Recorded ${entries.length} size${entries.length === 1 ? "" : "s"} on the ledger.`);
}

export async function recordMovement(formData: FormData) {
  const materialId = readString(formData, "materialId");
  const type = readString(formData, "type");
  const quantity = Number(readString(formData, "quantity"));
  const back = materialId ? `/materials/${materialId}` : "/materials";
  if (!movementTypeSet.has(type) || type === "consume") redirectWith(back, "error", "Choose a purchase, receipt, or adjustment.");
  if (!Number.isFinite(quantity) || ((type === "purchase" || type === "receive") && quantity <= 0) || quantity === 0) {
    redirectWith(back, "error", "Enter a non-zero quantity. Purchases and receipts must be positive.");
  }
  const database = await getDb();
  const material = database.select().from(materials).where(eq(materials.id, materialId)).get();
  if (!material) redirectWith("/materials", "error", "That material is gone.");
  if (material.type === "blank") redirectWith(back, "error", "Record blank stock on the size and color grid.");
  database
    .insert(movements)
    .values({
      id: crypto.randomUUID(),
      materialId,
      variantId: null,
      type,
      quantity,
      note: readString(formData, "note") || null,
      buildId: null,
      createdAt: nowIso(),
    })
    .run();
  refreshShop();
  redirectWith(back, "notice", "Ledger updated.");
}

export async function updateMaterial(formData: FormData) {
  const id = readString(formData, "id");
  const name = readString(formData, "name");
  if (!id || !name) redirectWith("/materials", "error", "Name is required.");
  const database = await getDb();
  database
    .update(materials)
    .set({
      name,
      brand: readString(formData, "brand") || null,
      styleNumber: readString(formData, "styleNumber") || null,
      ssStyleId: readString(formData, "ssStyleId") || null,
      seriesId: readString(formData, "seriesId") || null,
      unit: readString(formData, "unit") || "each",
      notes: readString(formData, "notes") || null,
      updatedAt: nowIso(),
    })
    .where(eq(materials.id, id))
    .run();
  refreshShop();
  redirectWith(`/materials/${id}`, "notice", "Details saved. The ledger was not changed.");
}

export async function deleteMaterial(formData: FormData) {
  const id = readString(formData, "id");
  if (!id) redirectWith("/materials", "error", "Missing material.");
  const database = await getDb();
  try {
    const result = database.transaction((tx) => {
      tx.delete(materialOptions).where(eq(materialOptions.materialId, id)).run();
      tx.delete(materialVariants).where(eq(materialVariants.materialId, id)).run();
      return tx.delete(materials).where(eq(materials.id, id)).run();
    });
    if (result.changes === 0) redirectWith("/materials", "error", "That material is already gone.");
  } catch (error) {
    if (isSqliteConstraint(error)) {
      redirectWith(`/materials/${id}`, "error", "This model still has ledger history or a recipe, so it stays.");
    }
    throw error;
  }
  refreshShop();
  redirectWith("/materials", "notice", "Deleted.");
}
