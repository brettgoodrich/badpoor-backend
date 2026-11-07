"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/field";
import { NativeSelect } from "@/components/native-select";
import { matchBlank, type SelectedOption } from "@/lib/inventory/matching";

type MaterialOption = {
  id: string;
  name: string;
  type: string;
  size: string | null;
  color: string | null;
};

type VariantOption = {
  id: string;
  title: string;
  options: SelectedOption[];
  lines: { materialId: string; quantity: number }[];
};

type ProductOption = {
  id: string;
  title: string;
  variants: VariantOption[];
};

type RowState = {
  include: boolean;
  blankId: string;
  blankQty: string;
  printOverride: string;
  extraCount: number;
};

export function RecipeSetupForm({
  action,
  products,
  materials,
}: {
  action: (formData: FormData) => void | Promise<void>;
  products: ProductOption[];
  materials: MaterialOption[];
}) {
  const prints = materials.filter((material) => material.type === "print");
  const blanks = materials.filter((material) => material.type === "blank");
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const product = products.find((entry) => entry.id === productId) ?? products[0];
  const [printId, setPrintId] = useState(prints[0]?.id ?? "");
  const [printQty, setPrintQty] = useState("1");
  const [rows, setRows] = useState<Record<string, RowState>>(() =>
    initialRows(products[0], materials, prints[0]?.id ?? ""),
  );

  const payload = useMemo(() => {
    if (!product) return { variants: [] };
    return {
      variants: product.variants.map((variant) => {
        const row = rows[variant.id];
        const lines: { materialId: string; quantity: number }[] = [];
        const chosenPrint = row?.printOverride || printId;
        const printAmount = Number(printQty);
        const blankAmount = Number(row?.blankQty);
        if (chosenPrint && printAmount > 0) lines.push({ materialId: chosenPrint, quantity: printAmount });
        if (row?.blankId && blankAmount > 0) lines.push({ materialId: row.blankId, quantity: blankAmount });
        return {
          variantId: variant.id,
          include: Boolean(row?.include) && lines.length > 0,
          lines,
        };
      }),
    };
  }, [printId, printQty, product, rows]);

  if (!product) {
    return <p className="text-sm text-muted-foreground">Sync products from Shopify, or seed the sample shop, before mapping variants.</p>;
  }

  function chooseProduct(nextId: string) {
    const next = products.find((entry) => entry.id === nextId);
    setProductId(nextId);
    setRows(initialRows(next, materials, printId));
  }

  return (
    <form action={action} className="grid gap-5">
      <input type="hidden" name="payload" value={JSON.stringify(payload)} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Product">
          <NativeSelect value={product.id} onChange={(event) => chooseProduct(event.target.value)}>
            {products.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.title}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Print for every checked size" hint="Leave blank if a size should not consume a print.">
          <NativeSelect value={printId} onChange={(event) => setPrintId(event.target.value)}>
            <option value="">No shared print</option>
            {prints.map((material) => (
              <option key={material.id} value={material.id}>
                {material.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Print quantity">
          <Input inputMode="decimal" value={printQty} onChange={(event) => setPrintQty(event.target.value)} />
        </Field>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-muted-foreground">
            <tr className="border-b">
              <th className="py-2 pr-3 font-medium">Use</th>
              <th className="py-2 pr-3 font-medium">Variant</th>
              <th className="py-2 pr-3 font-medium">Blank</th>
              <th className="py-2 pr-3 font-medium">Qty</th>
              <th className="py-2 font-medium">Print override</th>
            </tr>
          </thead>
          <tbody>
            {product.variants.map((variant) => {
              const row = rows[variant.id] ?? {
                include: false,
                blankId: "",
                blankQty: "1",
                printOverride: "",
                extraCount: 0,
              };
              return (
                <tr key={variant.id} className="border-b border-border/70 align-top">
                  <td className="py-2 pr-3">
                    <input
                      type="checkbox"
                      className="size-4"
                      checked={row.include}
                      aria-label={`Include ${variant.title}`}
                      onChange={(event) => updateRow(setRows, variant.id, { include: event.target.checked })}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <div className="font-medium">{variant.title}</div>
                    {row.extraCount > 0 ? (
                      <p className="mt-1 max-w-56 text-xs text-muted-foreground">
                        This recipe has {row.extraCount} extra material{row.extraCount === 1 ? "" : "s"}. Saving replaces them with the print and blank shown here.
                      </p>
                    ) : null}
                  </td>
                  <td className="py-2 pr-3">
                    <NativeSelect
                      aria-label={`Blank for ${variant.title}`}
                      value={row.blankId}
                      onChange={(event) => updateRow(setRows, variant.id, { blankId: event.target.value })}
                    >
                      <option value="">No blank</option>
                      {blanks.map((material) => (
                        <option key={material.id} value={material.id}>
                          {material.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </td>
                  <td className="py-2 pr-3">
                    <Input
                      aria-label={`Blank quantity for ${variant.title}`}
                      className="w-20"
                      inputMode="decimal"
                      value={row.blankQty}
                      onChange={(event) => updateRow(setRows, variant.id, { blankQty: event.target.value })}
                    />
                  </td>
                  <td className="py-2">
                    <NativeSelect
                      aria-label={`Print override for ${variant.title}`}
                      value={row.printOverride}
                      onChange={(event) => updateRow(setRows, variant.id, { printOverride: event.target.value })}
                    >
                      <option value="">Use the shared print</option>
                      {prints.map((material) => (
                        <option key={material.id} value={material.id}>
                          {material.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Checked variants are replaced. Unchecked variants are left alone. Size matching prefers a blank with the same size, and the same color when the variant has one.
      </p>
      <Button type="submit" className="w-fit">
        Save recipes
      </Button>
    </form>
  );
}

function updateRow(
  setRows: React.Dispatch<React.SetStateAction<Record<string, RowState>>>,
  id: string,
  patch: Partial<RowState>,
) {
  setRows((current) => {
    const previous = current[id] ?? {
      include: false,
      blankId: "",
      blankQty: "1",
      printOverride: "",
      extraCount: 0,
    };
    return { ...current, [id]: { ...previous, ...patch } };
  });
}

function initialRows(
  product: ProductOption | undefined,
  materials: MaterialOption[],
  sharedPrintId: string,
): Record<string, RowState> {
  if (!product) return {};
  const blanks = materials.filter((material) => material.type === "blank");
  const prints = new Set(materials.filter((material) => material.type === "print").map((material) => material.id));
  const blankIds = new Set(blanks.map((material) => material.id));
  const next: Record<string, RowState> = {};

  for (const variant of product.variants) {
    const printLine = variant.lines.find((line) => prints.has(line.materialId));
    const blankLine = variant.lines.find((line) => blankIds.has(line.materialId));
    const matched = matchBlank({ title: variant.title, options: variant.options }, blanks);
    const accounted = new Set([printLine?.materialId, blankLine?.materialId].filter(Boolean));
    next[variant.id] = {
      include: variant.lines.length > 0 || Boolean(matched),
      blankId: blankLine?.materialId ?? matched ?? "",
      blankQty: String(blankLine?.quantity ?? 1),
      printOverride: printLine && printLine.materialId !== sharedPrintId ? printLine.materialId : "",
      extraCount: variant.lines.filter((line) => !accounted.has(line.materialId)).length,
    };
  }
  return next;
}
