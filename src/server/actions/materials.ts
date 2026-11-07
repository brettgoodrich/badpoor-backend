"use server";

import { eq } from "drizzle-orm";
import { redirectWith, refreshShop, isSqliteConstraint } from "@/lib/action";
import { getDb } from "@/lib/db";
import { materialTypes, materials, movements, movementTypes } from "@/lib/db/schema";
import { readString } from "@/lib/format";

const types = new Set<string>(materialTypes);
const movementTypeSet = new Set<string>(movementTypes);

function materialInput(formData: FormData) {
  const name = readString(formData, "name");
  const type = readString(formData, "type");
  const unit = readString(formData, "unit") || "each";
  if (!name) return { ok: false as const, error: "Give the material a name." };
  if (!types.has(type)) return { ok: false as const, error: "Choose a type: print, blank, trim, or other." };
  if (name.length > 120) return { ok: false as const, error: "Name is too long." };
  return {
    ok: true as const,
    value: {
      name,
      type,
      unit,
      size: readString(formData, "size") || null,
      color: readString(formData, "color") || null,
      notes: readString(formData, "notes") || null,
    },
  };
}

export async function createMaterial(formData: FormData) {
  const parsed = materialInput(formData);
  if (!parsed.ok) redirectWith("/materials", "error", parsed.error);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const db = await getDb();
  db.insert(materials)
    .values({ id, ...parsed.value, createdAt: now, updatedAt: now })
    .run();
  refreshShop();
  redirectWith(`/materials/${id}`, "notice", "Material saved. On hand stays at zero until you record a purchase or receipt.");
}

export async function updateMaterial(formData: FormData) {
  const id = readString(formData, "id");
  const parsed = materialInput(formData);
  if (!id) redirectWith("/materials", "error", "Missing material.");
  if (!parsed.ok) redirectWith(`/materials/${id}`, "error", parsed.error);
  const db = await getDb();
  const existing = db.select().from(materials).where(eq(materials.id, id)).get();
  if (!existing) redirectWith("/materials", "error", "That material is gone.");
  db.update(materials)
    .set({ ...parsed.value, updatedAt: new Date().toISOString() })
    .where(eq(materials.id, id))
    .run();
  refreshShop();
  redirectWith(`/materials/${id}`, "notice", "Material updated. The ledger was not changed.");
}

export async function deleteMaterial(formData: FormData) {
  const id = readString(formData, "id");
  if (!id) redirectWith("/materials", "error", "Missing material.");
  const db = await getDb();
  try {
    const result = db.delete(materials).where(eq(materials.id, id)).run();
    if (result.changes === 0) redirectWith("/materials", "error", "That material is already gone.");
  } catch (error) {
    if (isSqliteConstraint(error)) {
      redirectWith(
        `/materials/${id}`,
        "error",
        "This material still has ledger history or a recipe, so it stays. Adjust the count to zero instead of deleting it.",
      );
    }
    throw error;
  }
  refreshShop();
  redirectWith("/materials", "notice", "Material deleted.");
}

export async function recordMovement(formData: FormData) {
  const materialId = readString(formData, "materialId");
  const type = readString(formData, "type");
  const note = readString(formData, "note");
  const quantity = Number(readString(formData, "quantity"));
  const back = materialId ? `/materials/${materialId}` : "/materials";

  if (!materialId) redirectWith("/materials", "error", "Missing material.");
  if (!movementTypeSet.has(type) || type === "consume") {
    redirectWith(back, "error", "Choose a purchase, receipt, or adjustment. Builds record consumption on their own.");
  }
  if (!Number.isFinite(quantity)) redirectWith(back, "error", "Enter a number.");
  if ((type === "purchase" || type === "receive") && quantity <= 0) {
    redirectWith(back, "error", "Purchases and receipts have to be greater than zero.");
  }
  if (type === "adjustment" && quantity === 0) {
    redirectWith(back, "error", "An adjustment has to change the count.");
  }

  const db = await getDb();
  const material = db.select().from(materials).where(eq(materials.id, materialId)).get();
  if (!material) redirectWith("/materials", "error", "That material is gone.");

  db.insert(movements)
    .values({
      id: crypto.randomUUID(),
      materialId,
      type,
      quantity,
      note: note || null,
      buildId: null,
      createdAt: new Date().toISOString(),
    })
    .run();
  refreshShop();
  const verb = type === "adjustment" ? "Adjustment recorded" : type === "receive" ? "Receipt recorded" : "Purchase recorded";
  redirectWith(back, "notice", `${verb}. On hand is the sum of the ledger.`);
}
