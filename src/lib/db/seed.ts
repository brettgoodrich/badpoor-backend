import { exampleInput, exampleVariantOptions, SAMPLE_SYNCED_AT } from "@/lib/inventory/example";
import { openDatabase } from "./client";
import {
  builds,
  finishedMovements,
  materialOptions,
  materials,
  materialVariants,
  movements,
  printSeries,
  recipeExclusions,
  recipeLines,
  recipeOverrides,
  recipes,
  shopifyLineItems,
  shopifyOrders,
  shopifyProducts,
  shopifyVariants,
} from "./schema";

const NOW = SAMPLE_SYNCED_AT;
const CREATED = "2026-10-20T15:00:00.000Z";

function handleFromTitle(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Replaces every local row with the fake shop. Does not call Shopify.
 */
export function seedDatabase() {
  const db = openDatabase();

  db.transaction((tx) => {
    tx.delete(recipeExclusions).run();
    tx.delete(recipeOverrides).run();
    tx.delete(recipeLines).run();
    tx.delete(recipes).run();
    tx.delete(finishedMovements).run();
    tx.delete(movements).run();
    tx.delete(builds).run();
    tx.delete(shopifyLineItems).run();
    tx.delete(shopifyOrders).run();
    tx.delete(shopifyVariants).run();
    tx.delete(shopifyProducts).run();
    tx.delete(materialVariants).run();
    tx.delete(materialOptions).run();
    tx.delete(materials).run();
    tx.delete(printSeries).run();

    tx.insert(printSeries)
      .values({
        id: "series_ptf",
        name: "PTF Uniforms 2026",
        notes: "Sample series. Three prints that can go on more than one blank.",
        createdAt: CREATED,
        updatedAt: CREATED,
      })
      .run();

    tx.insert(materials)
      .values([
        material("mat_print_a", "Print A", "print", { seriesId: "series_ptf" }),
        material("mat_print_b", "Print B", "print", { seriesId: "series_ptf" }),
        material("mat_print_c", "Print C", "print", { seriesId: "series_ptf", notes: "In the series, not on a recipe yet." }),
        material("mat_gildan", "Gildan 64000", "blank", { brand: "Gildan", styleNumber: "64000" }),
        material("mat_sweat", "Pocketed Sweatpants", "blank", { brand: "Independent", styleNumber: "PS-100" }),
        material("mat_transfer", "Heat transfer sheet", "other", {
          unit: "sheet",
          notes: "Sample shortfall. Counted five sheets short, so on hand is negative until you buy them.",
        }),
      ])
      .run();

    const gildanSizes = ["YS", "S", "M", "L", "XL"];
    const gildanColors = ["Black", "Navy"];
    tx.insert(materialOptions)
      .values([
        ...gildanSizes.map((value, position) => option("mat_gildan", "size", value, position)),
        ...gildanColors.map((value, position) => option("mat_gildan", "color", value, position)),
        ...["S", "M", "YL"].map((value, position) => option("mat_sweat", "size", value, position)),
        option("mat_sweat", "color", "Black", 0),
      ])
      .run();

    const known: Record<string, string> = {
      "mat_gildan|YS|Black": "mat_blank_youth_s",
      "mat_gildan|S|Black": "mat_blank_s",
      "mat_gildan|M|Black": "mat_blank_m",
      "mat_gildan|L|Black": "mat_blank_l",
      "mat_sweat|S|Black": "mat_blank_sweat_s",
      "mat_sweat|YL|Black": "mat_blank_sweat_youth_l",
    };
    const variantRows = [
      ...gildanSizes.flatMap((size) => gildanColors.map((color) => cell("mat_gildan", size, color, known))),
      ...["S", "M", "YL"].map((size) => cell("mat_sweat", size, "Black", known)),
    ];
    tx.insert(materialVariants).values(variantRows).run();

    tx.insert(movements)
      .values([
        move("mov_print_a_in", "mat_print_a", null, "purchase", 17, "Sample purchase.", null, "2026-10-20T15:00:00.000Z"),
        move("mov_print_b_in", "mat_print_b", null, "purchase", 2, "Sample purchase.", null, "2026-10-20T15:00:00.000Z"),
        move("mov_blank_s_in", "mat_gildan", "mat_blank_s", "purchase", 10, "Sample purchase.", null, "2026-10-21T15:00:00.000Z"),
        move("mov_blank_m_in", "mat_gildan", "mat_blank_m", "purchase", 10, "Sample purchase.", null, "2026-10-21T15:00:00.000Z"),
        move("mov_blank_ys_in", "mat_gildan", "mat_blank_youth_s", "purchase", 6, "Sample purchase.", null, "2026-10-22T15:00:00.000Z"),
        move("mov_sweat_s_in", "mat_sweat", "mat_blank_sweat_s", "receive", 1, "Sample receipt.", null, "2026-10-22T15:00:00.000Z"),
        move("mov_transfer_adj", "mat_transfer", null, "adjustment", -5, "Sample count. Already five sheets short — buy them back to zero.", null, "2026-10-25T15:00:00.000Z"),
        move("mov_print_a_consume", "mat_print_a", null, "consume", -2, "Sample build of 2 youth shorts. Shopify was not updated.", "build_youth_sample", "2026-11-05T16:00:00.000Z"),
        move("mov_blank_ys_consume", "mat_gildan", "mat_blank_youth_s", "consume", -2, "Sample build of 2 youth shorts. Shopify was not updated.", "build_youth_sample", "2026-11-05T16:00:00.000Z"),
      ])
      .run();

    const productIds = [...new Set(exampleInput.variants.map((variant) => variant.productId))];
    tx.insert(shopifyProducts)
      .values(
        productIds.map((id) => {
          const title = exampleInput.variants.find((variant) => variant.productId === id)?.productTitle ?? id;
          return { id, title, handle: handleFromTitle(title), status: "ACTIVE", syncedAt: NOW };
        }),
      )
      .run();

    tx.insert(shopifyVariants)
      .values(
        exampleInput.variants.map((variant) => ({
          id: variant.id,
          productId: variant.productId,
          title: variant.title,
          sku: variant.sku,
          selectedOptions: JSON.stringify(exampleVariantOptions[variant.id] ?? []),
          productTitle: variant.productTitle,
        })),
      )
      .run();

    tx.insert(shopifyOrders).values(exampleInput.orders.map((order) => ({ ...order, syncedAt: NOW }))).run();
    tx.insert(shopifyLineItems)
      .values(
        exampleInput.lines.map((line) => ({
          id: line.id,
          orderId: line.orderId,
          title: line.title,
          name: line.name,
          variantTitle: line.variantTitle,
          sku: line.sku,
          variantId: line.variantId,
          quantity: line.quantity,
          unfulfilledQuantity: line.unfulfilledQuantity,
        })),
      )
      .run();

    tx.insert(recipes)
      .values(
        exampleInput.recipes.map((recipe) => ({
          id: recipe.id,
          matchType: recipe.matchType,
          shopifyProductId: recipe.shopifyProductId,
          customTitle: recipe.customTitle,
          notes: "Sample recipe: one print plus a whole blank. Navy cells are unchecked on the shorts.",
          createdAt: CREATED,
          updatedAt: CREATED,
        })),
      )
      .run();

    const lineRows = exampleInput.recipes.flatMap((recipe) =>
      recipe.lines.map((line, index) => ({
        id: `${recipe.id}_line_${index + 1}`,
        recipeId: recipe.id,
        materialId: line.materialId,
        role: line.role,
        quantity: line.quantity,
        excludedVariantIds: line.excludedVariantIds ?? [],
      })),
    );
    tx.insert(recipeLines)
      .values(
        lineRows.map((line) => ({
          id: line.id,
          recipeId: line.recipeId,
          materialId: line.materialId,
          role: line.role,
          quantity: line.quantity,
        })),
      )
      .run();
    const exclusions = lineRows.flatMap((line) =>
      line.excludedVariantIds.map((variantId) => ({
        id: `${line.id}_ex_${variantId}`,
        recipeLineId: line.id,
        variantId,
      })),
    );
    if (exclusions.length > 0) tx.insert(recipeExclusions).values(exclusions).run();

    if (exampleInput.finished.length > 0) {
      tx.insert(finishedMovements)
        .values(
          exampleInput.finished.map((row, index) => ({
            id: `finished_${index + 1}`,
            shopifyVariantId: row.shopifyVariantId,
            type: "make",
            quantity: row.quantity,
            note: "Sample make-ahead. Materials were already counted in the opening ledger.",
            buildId: null,
            createdAt: "2026-10-26T15:00:00.000Z",
          })),
        )
        .run();
    }

    tx.insert(builds)
      .values(
        exampleInput.builds.map((build) => {
          const line = exampleInput.lines.find((entry) => entry.id === build.lineItemId);
          if (!line) throw new Error(`Sample build ${build.id} has no line item.`);
          return {
            id: build.id,
            orderId: line.orderId,
            lineItemId: build.lineItemId,
            quantity: build.quantity,
            note: build.note,
            blankVariantId: "mat_blank_youth_s",
            createdAt: build.createdAt,
          };
        }),
      )
      .run();
  });
}

function material(
  id: string,
  name: string,
  type: string,
  extra: { seriesId?: string; brand?: string; styleNumber?: string; unit?: string; notes?: string } = {},
) {
  return {
    id,
    name,
    type,
    unit: extra.unit ?? "each",
    notes: extra.notes ?? "Sample material. Not a real supplier item.",
    brand: extra.brand ?? null,
    styleNumber: extra.styleNumber ?? null,
    ssStyleId: null,
    seriesId: extra.seriesId ?? null,
    createdAt: CREATED,
    updatedAt: CREATED,
  };
}

function option(materialId: string, axis: string, value: string, position: number) {
  return {
    id: `${materialId}_${axis}_${value.toLowerCase().replace(/\s+/g, "_")}`,
    materialId,
    axis,
    value,
    position,
    archivedAt: null,
  };
}

function cell(materialId: string, size: string, color: string, known: Record<string, string>) {
  return {
    id: known[`${materialId}|${size}|${color}`] ?? `${materialId}_${size}_${color}`.toLowerCase().replace(/\s+/g, "_"),
    materialId,
    size,
    color,
    archivedAt: null,
  };
}

function move(
  id: string,
  materialId: string,
  variantId: string | null,
  type: string,
  quantity: number,
  note: string,
  buildId: string | null,
  createdAt: string,
) {
  return { id, materialId, variantId, type, quantity, note, buildId, createdAt };
}
