"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/field";
import { NativeSelect } from "@/components/native-select";
import { matchBlank, type SelectedOption } from "@/lib/inventory/matching";

type PrintOption = { id: string; name: string; seriesName: string | null };
type BlankVariant = { id: string; size: string; color: string; archived: boolean };
type BlankModel = { id: string; name: string; variants: BlankVariant[] };
type VariantOption = {
  id: string;
  title: string;
  options: SelectedOption[];
  blankVariantId: string | null;
  printIds: string[];
};
type ProductOption = { id: string; title: string; variants: VariantOption[] };

export function RecipeSetupForm({
  action,
  products,
  prints,
  models,
}: {
  action: (formData: FormData) => void | Promise<void>;
  products: ProductOption[];
  prints: PrintOption[];
  models: BlankModel[];
}) {
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const product = products.find((entry) => entry.id === productId) ?? products[0];
  const [printId, setPrintId] = useState(prints[0]?.id ?? "");
  const [printQty, setPrintQty] = useState("1");
  const [modelId, setModelId] = useState(models[0]?.id ?? "");
  const model = models.find((entry) => entry.id === modelId) ?? models[0];
  const [rows, setRows] = useState<Record<string, { include: boolean; blankId: string }>>(() =>
    initialRows(products[0], models[0]),
  );

  const payload = useMemo(() => {
    if (!product) return { variants: [] };
    const printAmount = Number(printQty);
    return {
      variants: product.variants.map((variant) => {
        const row = rows[variant.id];
        const lines = [];
        if (printId && printAmount > 0) {
          lines.push({ materialId: printId, variantId: null, role: "print", quantity: printAmount });
        }
        if (row?.blankId) {
          lines.push({ materialId: model?.id ?? "", variantId: row.blankId, role: "blank", quantity: 1 });
        }
        return { variantId: variant.id, include: Boolean(row?.include) && lines.length > 0, lines };
      }),
    };
  }, [model?.id, printId, printQty, product, rows]);

  if (!product || !model) {
    return <p className="text-sm text-muted-foreground">Add a print and a blank model before mapping a Shopify product.</p>;
  }

  function chooseProduct(nextId: string) {
    const next = products.find((entry) => entry.id === nextId);
    setProductId(nextId);
    setRows(initialRows(next, model));
  }

  function chooseModel(nextId: string) {
    const next = models.find((entry) => entry.id === nextId);
    setModelId(nextId);
    setRows(initialRows(product, next));
  }

  const activeVariants = model.variants.filter((variant) => !variant.archived);

  return (
    <form action={action} className="grid gap-5">
      <input type="hidden" name="payload" value={JSON.stringify(payload)} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Shopify product">
          <NativeSelect value={product.id} onChange={(event) => chooseProduct(event.target.value)}>
            {products.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.title}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Print" hint="Prints have no size. The same print goes on every checked variant unless you edit the recipe later.">
          <NativeSelect value={printId} onChange={(event) => setPrintId(event.target.value)}>
            <option value="">No print</option>
            {prints.map((print) => (
              <option key={print.id} value={print.id}>
                {print.seriesName ? `${print.seriesName} · ${print.name}` : print.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Print quantity">
          <Input inputMode="decimal" value={printQty} onChange={(event) => setPrintQty(event.target.value)} />
        </Field>
        <Field label="Blank model">
          <NativeSelect value={model.id} onChange={(event) => chooseModel(event.target.value)}>
            {models.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-muted-foreground">
            <tr className="border-b">
              <th className="py-2 pr-3 font-medium">Use</th>
              <th className="py-2 pr-3 font-medium">Shopify variant</th>
              <th className="py-2 font-medium">Blank variant</th>
            </tr>
          </thead>
          <tbody>
            {product.variants.map((variant) => {
              const row = rows[variant.id] ?? { include: false, blankId: "" };
              return (
                <tr key={variant.id} className="border-b border-border/70">
                  <td className="py-2 pr-3">
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={row.include}
                      aria-label={`Include ${variant.title}`}
                      onChange={(event) =>
                        setRows((current) => ({ ...current, [variant.id]: { ...row, include: event.target.checked } }))
                      }
                    />
                  </td>
                  <td className="py-2 pr-3 font-medium">{variant.title}</td>
                  <td className="py-2">
                    <NativeSelect
                      aria-label={`Blank for ${variant.title}`}
                      value={row.blankId}
                      onChange={(event) =>
                        setRows((current) => ({ ...current, [variant.id]: { ...row, blankId: event.target.value } }))
                      }
                    >
                      <option value="">No matching blank</option>
                      {activeVariants.map((blank) => (
                        <option key={blank.id} value={blank.id}>
                          {blank.size} / {blank.color}
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
        Size and color matching treats Small as S and Youth Large as YL. Change a row to override that variant without affecting the others.
      </p>
      <Button type="submit" className="w-fit">
        Save recipes
      </Button>
    </form>
  );
}

function initialRows(product: ProductOption | undefined, model: BlankModel | undefined) {
  const rows: Record<string, { include: boolean; blankId: string }> = {};
  if (!product || !model) return rows;
  const blanks = model.variants.filter((variant) => !variant.archived);
  for (const variant of product.variants) {
    const matched = matchBlank({ title: variant.title, options: variant.options }, blanks);
    const existing = variant.blankVariantId && blanks.some((blank) => blank.id === variant.blankVariantId)
      ? variant.blankVariantId
      : null;
    const blankId = existing ?? matched ?? "";
    rows[variant.id] = { include: Boolean(blankId), blankId };
  }
  return rows;
}
