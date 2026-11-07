import type { ReportInput } from "./report";

/**
 * Clearly fake shop data. Numbers are chosen so the dashboard shows the
 * owner's example: 15 of Print A, 10 Blank S, and 10 Blank M can build
 * 10 of size S alone, and 15 garments total across sizes that share the print.
 */
export const SAMPLE_SYNCED_AT = "2026-11-06T18:00:00.000Z";

const printA = "mat_print_a";
const printB = "mat_print_b";
const blankS = "mat_blank_s";
const blankM = "mat_blank_m";
const blankL = "mat_blank_l";
const blankYouthS = "mat_blank_youth_s";
const blankSweatS = "mat_blank_sweat_s";
const blankSweatYouthL = "mat_blank_sweat_youth_l";
const transfer = "mat_transfer";

const shorts = "gid://shopify/Product/9001";
const sweatpants = "gid://shopify/Product/9002";

export const exampleVariantOptions: Record<string, { name: string; value: string }[]> = {
  "gid://shopify/ProductVariant/9101": [{ name: "Size", value: "XS" }],
  "gid://shopify/ProductVariant/9102": [{ name: "Size", value: "S" }],
  "gid://shopify/ProductVariant/9103": [{ name: "Size", value: "M" }],
  "gid://shopify/ProductVariant/9104": [{ name: "Size", value: "L" }],
  "gid://shopify/ProductVariant/9105": [{ name: "Size", value: "YOUTH S" }],
  "gid://shopify/ProductVariant/9106": [{ name: "Size", value: "YOUTH M" }],
  "gid://shopify/ProductVariant/9107": [{ name: "Size", value: "YOUTH L" }],
  "gid://shopify/ProductVariant/9201": [
    { name: "Size", value: "S" },
    { name: "Color", value: "Black" },
  ],
  "gid://shopify/ProductVariant/9202": [
    { name: "Size", value: "M" },
    { name: "Color", value: "Black" },
  ],
  "gid://shopify/ProductVariant/9203": [
    { name: "Size", value: "L" },
    { name: "Color", value: "Black" },
  ],
  "gid://shopify/ProductVariant/9204": [
    { name: "Size", value: "YOUTH L" },
    { name: "Color", value: "Black" },
  ],
};

export const exampleInput: ReportInput = {
  materials: [
    stock(printA, "Print A", "print", null, null, "each", { modelId: printA, modelName: "Print A", seriesName: "PTF Uniforms 2026" }),
    stock(printB, "Print B", "print", null, null, "each", { modelId: printB, modelName: "Print B", seriesName: "PTF Uniforms 2026" }),
    stock(blankS, "Gildan 64000 · S / Black", "blank", "S", "Black", "each", { modelId: "mat_gildan", modelName: "Gildan 64000" }),
    stock(blankM, "Gildan 64000 · M / Black", "blank", "M", "Black", "each", { modelId: "mat_gildan", modelName: "Gildan 64000" }),
    stock(blankL, "Gildan 64000 · L / Black", "blank", "L", "Black", "each", { modelId: "mat_gildan", modelName: "Gildan 64000" }),
    stock(blankYouthS, "Gildan 64000 · YS / Black", "blank", "YS", "Black", "each", { modelId: "mat_gildan", modelName: "Gildan 64000" }),
    stock("mat_gildan_s_navy", "Gildan 64000 · S / Navy", "blank", "S", "Navy", "each", { modelId: "mat_gildan", modelName: "Gildan 64000" }),
    stock("mat_gildan_m_navy", "Gildan 64000 · M / Navy", "blank", "M", "Navy", "each", { modelId: "mat_gildan", modelName: "Gildan 64000" }),
    stock("mat_gildan_l_navy", "Gildan 64000 · L / Navy", "blank", "L", "Navy", "each", { modelId: "mat_gildan", modelName: "Gildan 64000" }),
    stock("mat_gildan_ys_navy", "Gildan 64000 · YS / Navy", "blank", "YS", "Navy", "each", { modelId: "mat_gildan", modelName: "Gildan 64000" }),
    stock(blankSweatS, "Pocketed Sweatpants · S / Black", "blank", "S", "Black", "each", {
      modelId: "mat_sweat",
      modelName: "Pocketed Sweatpants",
    }),
    stock(blankSweatYouthL, "Pocketed Sweatpants · YL / Black", "blank", "YL", "Black", "each", {
      modelId: "mat_sweat",
      modelName: "Pocketed Sweatpants",
    }),
    stock(transfer, "Heat transfer sheet", "other", null, null, "sheet", { modelId: transfer, modelName: "Heat transfer sheet" }),
  ],
  movements: [
    { materialId: printA, quantity: 17 },
    { materialId: printA, quantity: -2 },
    { materialId: printB, quantity: 2 },
    { materialId: blankS, quantity: 10 },
    { materialId: blankM, quantity: 10 },
    { materialId: blankYouthS, quantity: 6 },
    { materialId: blankYouthS, quantity: -2 },
    { materialId: blankSweatS, quantity: 1 },
    { materialId: transfer, quantity: -5 },
  ],
  variants: [
    variant(shorts, "HCS Gym Shorts", "9101", "XS"),
    variant(shorts, "HCS Gym Shorts", "9102", "S"),
    variant(shorts, "HCS Gym Shorts", "9103", "M"),
    variant(shorts, "HCS Gym Shorts", "9104", "L"),
    variant(shorts, "HCS Gym Shorts", "9105", "YOUTH S"),
    variant(shorts, "HCS Gym Shorts", "9106", "YOUTH M"),
    variant(shorts, "HCS Gym Shorts", "9107", "YOUTH L"),
    variant(sweatpants, "HCS Gym Sweatpants", "9201", "S / Black"),
    variant(sweatpants, "HCS Gym Sweatpants", "9202", "M / Black"),
    variant(sweatpants, "HCS Gym Sweatpants", "9203", "L / Black"),
    variant(sweatpants, "HCS Gym Sweatpants", "9204", "YOUTH L / Black"),
  ],
  recipes: [
    {
      id: "recipe_shorts",
      matchType: "product",
      shopifyProductId: shorts,
      customTitle: null,
      overrides: [],
      lines: [
        { materialId: printA, role: "print", quantity: 1 },
        {
          materialId: "mat_gildan",
          role: "blank",
          quantity: 1,
          excludedVariantIds: [
            "mat_gildan_ys_navy",
            "mat_gildan_s_navy",
            "mat_gildan_m_navy",
            "mat_gildan_l_navy",
            "mat_gildan_xl_navy",
          ],
        },
      ],
    },
    {
      id: "recipe_sweat",
      matchType: "product",
      shopifyProductId: sweatpants,
      customTitle: null,
      overrides: [],
      lines: [
        { materialId: printB, role: "print", quantity: 1 },
        { materialId: "mat_sweat", role: "blank", quantity: 1 },
      ],
    },
  ],
  orders: [
    {
      id: "gid://shopify/Order/1042",
      name: "#1042",
      createdAt: "2026-10-28T15:00:00.000Z",
      fulfillmentStatus: "UNFULFILLED",
    },
    {
      id: "gid://shopify/Order/1048",
      name: "#1048",
      createdAt: "2026-10-30T15:00:00.000Z",
      fulfillmentStatus: "PARTIALLY_FULFILLED",
    },
    {
      id: "gid://shopify/Order/1051",
      name: "#1051",
      createdAt: "2026-11-02T15:00:00.000Z",
      fulfillmentStatus: "UNFULFILLED",
    },
    {
      id: "gid://shopify/Order/1055",
      name: "#1055",
      createdAt: "2026-11-04T15:00:00.000Z",
      fulfillmentStatus: "UNFULFILLED",
    },
  ],
  lines: [
    line("gid://shopify/Order/1042", "line_1042_s", "HCS Gym Shorts", "S", "9102", 8, 8),
    line("gid://shopify/Order/1042", "line_1042_m", "HCS Gym Shorts", "M", "9103", 6, 6),
    line("gid://shopify/Order/1048", "line_1048_sweat", "HCS Gym Sweatpants", "S / Black", "9201", 5, 3),
    line("gid://shopify/Order/1051", "line_1051_custom", "S-XL Shirts", null, null, 35, 35),
    line("gid://shopify/Order/1051", "line_1051_l", "HCS Gym Shorts", "L", "9104", 4, 4),
    line("gid://shopify/Order/1051", "line_1051_xs", "HCS Gym Shorts", "XS", "9101", 2, 2),
    line("gid://shopify/Order/1055", "line_1055_ys", "HCS Gym Shorts", "YOUTH S", "9105", 5, 5),
  ],
  builds: [
    {
      id: "build_youth_sample",
      lineItemId: "line_1055_ys",
      quantity: 2,
      createdAt: "2026-11-05T16:00:00.000Z",
      note: "Sample build recorded locally. Shopify was not updated.",
    },
  ],
  finished: [
    { shopifyVariantId: "gid://shopify/ProductVariant/9102", quantity: 3 },
    { shopifyVariantId: "gid://shopify/ProductVariant/9201", quantity: 1 },
  ],
};

function stock(
  id: string,
  name: string,
  type: string,
  size: string | null,
  color: string | null,
  unit: string,
  extra: { modelId: string; modelName: string; seriesName?: string | null },
): ReportInput["materials"][number] {
  return { id, name, type, size, color, unit, ...extra };
}

function variant(
  productId: string,
  productTitle: string,
  numericId: string,
  title: string,
): ReportInput["variants"][number] {
  return {
    id: `gid://shopify/ProductVariant/${numericId}`,
    productId,
    productTitle,
    title,
    sku: null,
    options: exampleVariantOptions[`gid://shopify/ProductVariant/${numericId}`] ?? [],
  };
}

function line(
  orderId: string,
  id: string,
  title: string,
  variantTitle: string | null,
  variantNumericId: string | null,
  quantity: number,
  unfulfilledQuantity: number,
): ReportInput["lines"][number] {
  const name = variantTitle ? `${title} - ${variantTitle}` : title;
  return {
    id,
    orderId,
    title,
    name,
    variantTitle,
    variantId: variantNumericId ? `gid://shopify/ProductVariant/${variantNumericId}` : null,
    sku: null,
    quantity,
    unfulfilledQuantity,
  };
}
