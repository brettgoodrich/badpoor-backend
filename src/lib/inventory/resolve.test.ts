import { describe, expect, it } from "vitest";
import { demandByMaterial, shortfall } from "./calculations";
import { concreteLines, resolveBlankVariant, type BlankChoice } from "./resolve";

const gildan: BlankChoice[] = [
  { id: "s-black", materialId: "gildan", size: "S", color: "Black" },
  { id: "s-navy", materialId: "gildan", size: "S", color: "Navy" },
  { id: "m-black", materialId: "gildan", size: "M", color: "Black" },
  { id: "ys-black", materialId: "gildan", size: "YS", color: "Black" },
];

const shorts = {
  lines: [
    { materialId: "print-lions", role: "print", quantity: 1 },
    {
      materialId: "gildan",
      role: "blank",
      quantity: 1,
      excludedVariantIds: ["s-navy"],
    },
  ],
  overrides: [{ shopifyVariantId: "shop-ys", blankVariantId: "s-black" }],
};

describe("model recipes", () => {
  it("matches a whole blank by size alias and skips excluded colors", () => {
    const resolved = concreteLines(
      shorts,
      { shopifyVariantId: "shop-s", title: "Small", options: [{ name: "Size", value: "Small" }] },
      gildan,
    );
    expect(resolved.complete).toBe(true);
    expect(resolved.lines).toEqual([
      { materialId: "print-lions", quantity: 1, role: "print" },
      { materialId: "s-black", quantity: 1, role: "blank" },
    ]);
  });

  it("does not use an excluded color when that is the color the order asked for", () => {
    expect(
      resolveBlankVariant(
        shorts.lines[1],
        [],
        { shopifyVariantId: "shop-navy", title: "S / Navy", options: [{ name: "Size", value: "S" }, { name: "Color", value: "Navy" }] },
        gildan,
      ),
    ).toBeNull();
  });

  it("lets a per-variant override replace the size match, including youth to adult", () => {
    const resolved = concreteLines(
      shorts,
      { shopifyVariantId: "shop-ys", title: "YXL", options: [{ name: "Size", value: "Youth Extra Large" }] },
      gildan,
    );
    expect(resolved.lines.find((line) => line.role === "blank")?.materialId).toBe("s-black");
  });

  it("counts shortfall on the matched variant, not the blank itself", () => {
    const resolved = concreteLines(
      shorts,
      { shopifyVariantId: "shop-m", title: "M", options: [{ name: "Size", value: "M" }] },
      gildan,
    );
    const demand = demandByMaterial(
      [{ id: "line", recipeId: "shorts", quantity: 6, lines: resolved.lines }],
      new Map(),
    );
    expect(demand.get("m-black")).toBe(6);
    expect(demand.has("gildan")).toBe(false);
    expect(shortfall(0, demand.get("m-black") ?? 0)).toBe(6);
  });
});
