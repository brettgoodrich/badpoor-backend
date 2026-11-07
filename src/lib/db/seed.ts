import { exampleInput, exampleVariantOptions, SAMPLE_SYNCED_AT } from "@/lib/inventory/example";
import { openDatabase } from "./client";
import {
  builds,
  materials,
  movements,
  recipeLines,
  recipes,
  shopifyLineItems,
  shopifyOrders,
  shopifyProducts,
  shopifyVariants,
} from "./schema";

const NOW = SAMPLE_SYNCED_AT;

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
  const created = "2026-10-20T15:00:00.000Z";

  db.transaction((tx) => {
    tx.delete(recipeLines).run();
    tx.delete(recipes).run();
    tx.delete(movements).run();
    tx.delete(builds).run();
    tx.delete(shopifyLineItems).run();
    tx.delete(shopifyOrders).run();
    tx.delete(shopifyVariants).run();
    tx.delete(shopifyProducts).run();
    tx.delete(materials).run();

    tx.insert(materials)
      .values(
        exampleInput.materials.map((material) => ({
          ...material,
          notes:
            material.id === "mat_transfer"
              ? "Sample shortfall. Counted five sheets short, so on hand is negative until you buy them."
              : "Sample material. Not a real supplier item.",
          createdAt: created,
          updatedAt: created,
        })),
      )
      .run();

    const movementRows: {
      id: string;
      materialId: string;
      type: string;
      quantity: number;
      note: string;
      buildId: string | null;
      createdAt: string;
    }[] = [
      {
        id: "mov_print_a_in",
        materialId: "mat_print_a",
        type: "purchase",
        quantity: 17,
        note: "Sample purchase.",
        buildId: null,
        createdAt: "2026-10-20T15:00:00.000Z",
      },
      {
        id: "mov_print_b_in",
        materialId: "mat_print_b",
        type: "purchase",
        quantity: 2,
        note: "Sample purchase.",
        buildId: null,
        createdAt: "2026-10-20T15:00:00.000Z",
      },
      {
        id: "mov_blank_s_in",
        materialId: "mat_blank_s",
        type: "purchase",
        quantity: 10,
        note: "Sample purchase.",
        buildId: null,
        createdAt: "2026-10-21T15:00:00.000Z",
      },
      {
        id: "mov_blank_m_in",
        materialId: "mat_blank_m",
        type: "purchase",
        quantity: 10,
        note: "Sample purchase.",
        buildId: null,
        createdAt: "2026-10-21T15:00:00.000Z",
      },
      {
        id: "mov_blank_ys_in",
        materialId: "mat_blank_youth_s",
        type: "purchase",
        quantity: 6,
        note: "Sample purchase.",
        buildId: null,
        createdAt: "2026-10-22T15:00:00.000Z",
      },
      {
        id: "mov_sweat_s_in",
        materialId: "mat_blank_sweat_s",
        type: "receive",
        quantity: 1,
        note: "Sample receipt.",
        buildId: null,
        createdAt: "2026-10-22T15:00:00.000Z",
      },
      {
        id: "mov_transfer_adj",
        materialId: "mat_transfer",
        type: "adjustment",
        quantity: -5,
        note: "Sample count. Already five sheets short — buy them back to zero.",
        buildId: null,
        createdAt: "2026-10-25T15:00:00.000Z",
      },
      {
        id: "mov_print_a_consume",
        materialId: "mat_print_a",
        type: "consume",
        quantity: -2,
        note: "Sample build of 2 youth shorts. Shopify was not updated.",
        buildId: "build_youth_sample",
        createdAt: "2026-11-05T16:00:00.000Z",
      },
      {
        id: "mov_blank_ys_consume",
        materialId: "mat_blank_youth_s",
        type: "consume",
        quantity: -2,
        note: "Sample build of 2 youth shorts. Shopify was not updated.",
        buildId: "build_youth_sample",
        createdAt: "2026-11-05T16:00:00.000Z",
      },
    ];
    tx.insert(movements).values(movementRows).run();

    const productIds = [...new Set(exampleInput.variants.map((variant) => variant.productId))];
    tx.insert(shopifyProducts)
      .values(
        productIds.map((id) => {
          const title = exampleInput.variants.find((variant) => variant.productId === id)?.productTitle ?? id;
          return {
            id,
            title,
            handle: handleFromTitle(title),
            status: "ACTIVE",
            syncedAt: NOW,
          };
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

    tx.insert(shopifyOrders)
      .values(
        exampleInput.orders.map((order) => ({
          ...order,
          syncedAt: NOW,
        })),
      )
      .run();

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
          shopifyVariantId: recipe.shopifyVariantId,
          customTitle: recipe.customTitle,
          notes: "Sample recipe: one print plus the matching blank.",
          createdAt: created,
          updatedAt: created,
        })),
      )
      .run();

    tx.insert(recipeLines)
      .values(
        exampleInput.recipes.flatMap((recipe) =>
          recipe.lines.map((line, index) => ({
            id: `${recipe.id}_line_${index + 1}`,
            recipeId: recipe.id,
            materialId: line.materialId,
            quantity: line.quantity,
          })),
        ),
      )
      .run();

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
            createdAt: build.createdAt,
          };
        }),
      )
      .run();
  });
}
