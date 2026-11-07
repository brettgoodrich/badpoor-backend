import { describe, expect, it } from "vitest";
import { activePairs, missingCombos, parseOptionList, planAxisRemoval } from "./matrix";

describe("blank matrix", () => {
  const sizes = [
    { value: "YS", position: 0 },
    { value: "S", position: 1 },
    { value: "M", position: 2 },
  ];
  const colors = [
    { value: "Black", position: 0 },
    { value: "Navy", position: 1 },
  ];

  it("generates every size and color combination", () => {
    expect(activePairs(sizes, colors)).toEqual([
      { size: "YS", color: "Black" },
      { size: "YS", color: "Navy" },
      { size: "S", color: "Black" },
      { size: "S", color: "Navy" },
      { size: "M", color: "Black" },
      { size: "M", color: "Navy" },
    ]);
  });

  it("adds only the missing combinations when a size or color is new", () => {
    const existing = activePairs(sizes, colors);
    const withXl = [...sizes, { value: "XL", position: 3 }];
    expect(missingCombos(activePairs(withXl, colors), existing)).toEqual([
      { size: "XL", color: "Black" },
      { size: "XL", color: "Navy" },
    ]);
  });

  it("parses comma or space separated lists without duplicates", () => {
    expect(parseOptionList("YS, YM, YL, S, M, L, XL")).toEqual(["YS", "YM", "YL", "S", "M", "L", "XL"]);
    expect(parseOptionList("Black Navy Black")).toEqual(["Black", "Navy"]);
  });

  it("deletes an unused size and archives a size that already has stock history", () => {
    const variants = [
      { id: "s-black", size: "S", color: "Black", referenced: false },
      { id: "s-navy", size: "S", color: "Navy", referenced: false },
      { id: "m-black", size: "M", color: "Black", referenced: true },
    ];
    expect(planAxisRemoval(variants, "size", "S")).toEqual({
      deleteIds: ["s-black", "s-navy"],
      archiveIds: [],
    });
    expect(planAxisRemoval(variants, "size", "M")).toEqual({
      deleteIds: [],
      archiveIds: ["m-black"],
    });
  });
});
