import { describe, expect, it } from "vitest";
import {
  allocateBuilds,
  buildableAlone,
  consumptionForBuild,
  demandByMaterial,
  materialNeeds,
  onHandByMaterial,
  remainingDemand,
  sharedMaterialCaps,
  shortfall,
  type Recipe,
} from "./calculations";
import { exampleInput, exampleVariantOptions } from "./example";
import { canonicalSize, matchBlank } from "./matching";
import { buildReport } from "./report";

const printA = "mat_print_a";
const blankS = "mat_blank_s";
const blankM = "mat_blank_m";

function recipe(id: string, lines: [string, number][]): Recipe {
  return {
    id,
    lines: lines.map(([materialId, quantity]) => ({ materialId, quantity })),
  };
}

describe("on hand and demand", () => {
  it("sums a signed ledger, including negative stock", () => {
    const onHand = onHandByMaterial([
      { materialId: "print", quantity: 15 },
      { materialId: "print", quantity: -4 },
      { materialId: "blank", quantity: -3 },
    ]);
    expect(onHand.get("print")).toBe(11);
    expect(onHand.get("blank")).toBe(-3);
  });

  it("multiplies recipe quantities by remaining units and skips unmapped lines", () => {
    const recipes = new Map<string, Recipe>([
      ["shorts-s", recipe("shorts-s", [["print", 1], ["blank-s", 1]])],
      ["shorts-m", recipe("shorts-m", [["print", 1], ["blank-m", 2]])],
    ]);
    const demand = demandByMaterial(
      [
        { id: "a", recipeId: "shorts-s", quantity: 8 },
        { id: "b", recipeId: "shorts-m", quantity: 3 },
        { id: "custom", recipeId: null, quantity: 35 },
        { id: "done", recipeId: "shorts-s", quantity: 0 },
      ],
      recipes,
    );
    expect(demand.get("print")).toBe(11);
    expect(demand.get("blank-s")).toBe(8);
    expect(demand.get("blank-m")).toBe(6);
    expect(demand.has("custom")).toBe(false);
  });

  it("reduces demand by what was already marked built", () => {
    expect(remainingDemand(5, 2)).toBe(3);
    expect(remainingDemand(2, 5)).toBe(0);
    expect(remainingDemand(0, 0)).toBe(0);
  });
});

describe("shortfall", () => {
  it("is zero when on hand covers the open orders", () => {
    expect(shortfall(10, 8)).toBe(0);
  });

  it("is the gap when on hand is short", () => {
    expect(shortfall(15, 21)).toBe(6);
  });

  it("treats negative on hand as units to buy even with no open demand", () => {
    expect(shortfall(-5, 0)).toBe(5);
    expect(shortfall(-2, 3)).toBe(5);
  });

  it("hides idle surplus and keeps covered demand plus buy-list rows", () => {
    const rows = materialNeeds(
      ["print", "blank", "transfer", "idle"],
      new Map([
        ["print", 15],
        ["blank", 10],
        ["transfer", -5],
        ["idle", 4],
      ]),
      new Map([
        ["print", 21],
        ["blank", 8],
      ]),
    );
    expect(rows.map((row) => [row.materialId, row.shortfall])).toEqual([
      ["print", 6],
      ["transfer", 5],
      ["blank", 0],
    ]);
  });
});

describe("buildable counts", () => {
  const onHand = new Map<string, number>([
    [printA, 15],
    [blankS, 10],
    [blankM, 10],
  ]);
  const shortsS = recipe("shorts-s", [
    [printA, 1],
    [blankS, 1],
  ]);
  const shortsM = recipe("shorts-m", [
    [printA, 1],
    [blankM, 1],
  ]);

  it("limits one variant to its scarcest material", () => {
    expect(buildableAlone(onHand, shortsS)).toEqual({
      count: 10,
      limitingMaterialId: blankS,
    });
    expect(buildableAlone(onHand, shortsM)).toEqual({
      count: 10,
      limitingMaterialId: blankM,
    });
  });

  it("caps the shared print across sizes without lowering each size's own blank", () => {
    const caps = sharedMaterialCaps([shortsS, shortsM], onHand);
    expect(caps).toEqual([
      {
        materialId: printA,
        recipeIds: ["shorts-s", "shorts-m"],
        onHand: 15,
        quantityPerUnit: 1,
        maxUnits: 15,
      },
    ]);
  });

  it("builds nothing when stock is negative or a material is missing", () => {
    expect(
      buildableAlone(new Map([[printA, -1], [blankS, 10]]), shortsS).count,
    ).toBe(0);
    expect(buildableAlone(new Map([[blankS, 10]]), shortsS)).toEqual({
      count: 0,
      limitingMaterialId: printA,
    });
  });

  it("floors fractional consumption", () => {
    expect(
      buildableAlone(new Map([["fabric", 5]]), recipe("panel", [["fabric", 2]])),
    ).toEqual({ count: 2, limitingMaterialId: "fabric" });
  });

  it("does not double-count a shared print when allocating open orders", () => {
    const recipes = new Map<string, Recipe>([
      ["shorts-s", shortsS],
      ["shorts-m", shortsM],
    ]);
    expect(
      allocateBuilds(
        onHand,
        [
          { id: "s", recipeId: "shorts-s", quantity: 10 },
          { id: "m", recipeId: "shorts-m", quantity: 10 },
        ],
        recipes,
      ),
    ).toEqual([
      { lineId: "s", quantity: 10 },
      { lineId: "m", quantity: 5 },
    ]);
  });
});

describe("sample shop", () => {
  const report = buildReport(exampleInput);

  it("keeps the print-and-blank example on the buildable board", () => {
    expect(report.buildable.find((row) => row.label === "HCS Gym Shorts · S")).toMatchObject({
      count: 10,
      limitingMaterialName: "Gildan 64000 · S / Black",
    });
    expect(report.buildable.find((row) => row.label === "HCS Gym Shorts · M")).toMatchObject({
      count: 10,
      limitingMaterialName: "Gildan 64000 · M / Black",
    });
    const shorts = report.buildableGroups.find((group) => group.productTitle === "HCS Gym Shorts");
    expect(shorts?.shared).toEqual([
      {
        materialId: printA,
        materialName: "Print A",
        onHand: 15,
        quantityPerUnit: 1,
        maxUnits: 15,
      },
    ]);
    expect(report.onHand.get(printA)).toBe(15);
    expect(report.onHand.get(blankS)).toBe(10);
    expect(report.onHand.get(blankM)).toBe(10);
  });

  it("rolls open orders into a buy list and flags lines with no recipe", () => {
    const need = (id: string) => report.needs.find((row) => row.materialId === id);
    expect(need(printA)).toMatchObject({ onHand: 15, demand: 21, shortfall: 6 });
    expect(need("mat_blank_l")).toMatchObject({ onHand: 0, demand: 4, shortfall: 4 });
    expect(need("mat_print_b")).toMatchObject({ onHand: 2, demand: 3, shortfall: 1 });
    expect(need("mat_blank_sweat_s")).toMatchObject({ onHand: 1, demand: 3, shortfall: 2 });
    expect(need("mat_blank_youth_s")).toMatchObject({ onHand: 4, demand: 3, shortfall: 0 });
    expect(need("mat_transfer")).toMatchObject({ onHand: -5, demand: 0, shortfall: 5 });
    expect(need(blankS)?.shortfall).toBe(0);
    expect(report.unmappedLines.map((line) => line.title).sort()).toEqual(["HCS Gym Shorts", "S-XL Shirts"]);
    expect(report.unitsRemaining).toBe(61);
    expect(report.buyCount).toBe(5);
    const gildan = report.buyGroups.find((group) => group.title === "Gildan 64000");
    expect(gildan?.rows.map((row) => row.materialId)).toEqual([
      "mat_blank_youth_s",
      "mat_blank_s",
      "mat_blank_m",
      "mat_blank_l",
    ]);
    expect(report.buyGroups.some((group) => group.title === "PTF Uniforms 2026")).toBe(true);
  });

  it("reserves shared stock for older orders before newer ones", () => {
    const line = (id: string) =>
      report.orders.flatMap((order) => order.lines).find((entry) => entry.id === id);
    expect(line("line_1042_s")?.canBuildNow).toBe(8);
    expect(line("line_1042_m")?.canBuildNow).toBe(6);
    expect(line("line_1048_sweat")?.canBuildNow).toBe(1);
    expect(line("line_1051_l")?.canBuildNow).toBe(0);
    expect(line("line_1051_custom")?.recipeId).toBeNull();
    expect(line("line_1055_ys")).toMatchObject({ built: 2, remaining: 3, canBuildNow: 1 });
  });
});

describe("build override consumption", () => {
  it("consumes the chosen blank for this build and leaves the print on the recipe", () => {
    expect(
      consumptionForBuild(
        [
          { materialId: "print-a", quantity: 1, role: "print" },
          { materialId: "blank-ys", quantity: 1, role: "blank" },
        ],
        2,
        "blank-adult-s",
      ),
    ).toEqual([
      { materialId: "print-a", quantity: -2 },
      { materialId: "blank-adult-s", quantity: -2 },
    ]);
  });

  it("uses the recipe blank when the build has no override", () => {
    expect(
      consumptionForBuild(
        [
          { materialId: "print-a", quantity: 1, role: "print" },
          { materialId: "blank-ys", quantity: 1, role: "blank" },
        ],
        1,
        null,
      ),
    ).toEqual([
      { materialId: "print-a", quantity: -1 },
      { materialId: "blank-ys", quantity: -1 },
    ]);
  });
});

describe("blank matching", () => {
  const blanks = exampleInput.materials
    .filter((material) => material.type === "blank")
    .map((material) => ({ id: material.id, size: material.size, color: material.color }));

  it("maps a size-only variant when that size has one color", () => {
    expect(
      matchBlank(
        { title: "S", options: exampleVariantOptions["gid://shopify/ProductVariant/9102"] },
        blanks.filter((blank) => blank.id === blankS),
      ),
    ).toBe(blankS);
  });

  it("does not guess when a size-only variant could be more than one color", () => {
    expect(
      matchBlank(
        { title: "S", options: [{ name: "Size", value: "S" }] },
        [
          { id: "s-black", size: "S", color: "Black" },
          { id: "s-navy", size: "S", color: "Navy" },
        ],
      ),
    ).toBeNull();
  });

  it("prefers the color-specific blank when the variant names a color", () => {
    expect(
      matchBlank(
        {
          title: "S / Black",
          options: exampleVariantOptions["gid://shopify/ProductVariant/9201"],
        },
        [
          { id: "s-navy", size: "S", color: "Navy" },
          { id: "mat_blank_sweat_s", size: "S", color: "Black" },
        ],
      ),
    ).toBe("mat_blank_sweat_s");
  });

  it("treats size words and youth aliases as the same size", () => {
    expect(canonicalSize("Small")).toBe("s");
    expect(canonicalSize("YOUTH L")).toBe("yl");
    expect(canonicalSize("Youth Large")).toBe("yl");
    expect(
      matchBlank(
        { title: "Small / Black", options: [{ name: "Size", value: "Small" }, { name: "Color", value: "Black" }] },
        [
          { id: "adult-s", size: "S", color: "Black" },
          { id: "youth", size: "YS", color: "Black" },
        ],
      ),
    ).toBe("adult-s");
  });

  it("reads size and color out of a title when options are missing", () => {
    expect(matchBlank({ title: "YOUTH L / Black", options: [] }, blanks)).toBe(
      "mat_blank_sweat_youth_l",
    );
  });
});
