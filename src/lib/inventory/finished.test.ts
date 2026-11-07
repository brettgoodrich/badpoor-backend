import { describe, expect, it } from "vitest";
import {
  consumptionForBuild,
  coverWithFinished,
  deficitsAfter,
  demandByMaterial,
} from "./calculations";

describe("finished stock", () => {
  it("lets the oldest order take finished garments before a newer one", () => {
    const covered = coverWithFinished(
      [
        { id: "older", variantId: "shorts-s", quantity: 8 },
        { id: "newer", variantId: "shorts-s", quantity: 4 },
        { id: "other", variantId: "sweat-s", quantity: 3 },
      ],
      new Map([
        ["shorts-s", 3],
        ["sweat-s", 1],
      ]),
    );
    expect(covered.get("older")).toBe(3);
    expect(covered.get("newer")).toBe(0);
    expect(covered.get("other")).toBe(1);
  });

  it("drives material demand with only the units finished stock does not cover", () => {
    const demand = demandByMaterial(
      [
        {
          id: "s",
          recipeId: "shorts",
          quantity: 5,
          lines: [
            { materialId: "print", quantity: 1, role: "print" },
            { materialId: "blank-s", quantity: 1, role: "blank" },
          ],
        },
      ],
      new Map(),
    );
    expect(demand.get("print")).toBe(5);
    expect(demand.get("blank-s")).toBe(5);
  });

  it("make-ahead consumes the resolved print and blank, and names a deficit without refusing it", () => {
    const consumed = consumptionForBuild(
      [
        { materialId: "print", quantity: 1, role: "print" },
        { materialId: "blank-s", quantity: 1, role: "blank" },
      ],
      4,
      null,
    );
    expect(consumed).toEqual([
      { materialId: "print", quantity: -4 },
      { materialId: "blank-s", quantity: -4 },
    ]);
    expect(deficitsAfter(new Map([["print", 2], ["blank-s", 10]]), consumed)).toEqual([
      { materialId: "print", quantity: -2 },
    ]);
  });

  it("fulfilling from finished stock does not consume materials", () => {
    const fromStock = { finishedDelta: -2, materials: [] as { materialId: string; quantity: number }[] };
    const builtNow = consumptionForBuild(
      [
        { materialId: "print", quantity: 1, role: "print" },
        { materialId: "blank-ys", quantity: 1, role: "blank" },
      ],
      2,
      "blank-adult-s",
    );
    expect(fromStock.materials).toEqual([]);
    expect(fromStock.finishedDelta).toBe(-2);
    expect(builtNow).toEqual([
      { materialId: "print", quantity: -2 },
      { materialId: "blank-adult-s", quantity: -2 },
    ]);
  });
});
