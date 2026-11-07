"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/field";
import { NativeSelect } from "@/components/native-select";
import { matchBlank, type SelectedOption } from "@/lib/inventory/matching";

type PrintOption = { id: string; name: string; seriesName: string | null };
type BlankVariant = { id: string; size: string; color: string; archived: boolean };
type BlankModel = { id: string; name: string; variants: BlankVariant[] };
type ProductOption = {
  id: string;
  title: string;
  variants: { id: string; title: string; options: SelectedOption[] }[];
};

export function ModelRecipeForm({
  action,
  mode,
  products,
  prints,
  models,
  initial,
  submitLabel,
  recipeId,
}: {
  action: (formData: FormData) => void | Promise<void>;
  mode: "product" | "custom";
  products: ProductOption[];
  prints: PrintOption[];
  models: BlankModel[];
  initial?: {
    productId?: string;
    title?: string;
    printId?: string;
    printQty?: number;
    modelId?: string;
    excludedIds?: string[];
    overrides?: { shopifyVariantId: string; blankVariantId: string }[];
    notes?: string;
  };
  submitLabel: string;
  recipeId?: string;
}) {
  const [productId, setProductId] = useState(initial?.productId ?? products[0]?.id ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [printId, setPrintId] = useState(initial?.printId ?? prints[0]?.id ?? "");
  const [printQty, setPrintQty] = useState(String(initial?.printQty ?? 1));
  const [modelId, setModelId] = useState(initial?.modelId ?? models[0]?.id ?? "");
  const [excluded, setExcluded] = useState<string[]>(initial?.excludedIds ?? []);
  const [overrides, setOverrides] = useState<Record<string, string>>(() =>
    Object.fromEntries((initial?.overrides ?? []).map((override) => [override.shopifyVariantId, override.blankVariantId])),
  );

  const product = products.find((entry) => entry.id === productId) ?? products[0];
  const model = models.find((entry) => entry.id === modelId) ?? models[0];
  const active = model?.variants.filter((variant) => !variant.archived) ?? [];
  const colors = [...new Set(active.map((variant) => variant.color))];

  const payload = useMemo(() => {
    const quantity = Number(printQty);
    const liveIds = new Set((model?.variants ?? []).filter((variant) => !variant.archived).map((variant) => variant.id));
    return {
      productId: mode === "product" ? product?.id ?? "" : null,
      title: mode === "custom" ? title : null,
      print: printId && quantity > 0 ? { materialId: printId, quantity } : null,
      blank: model
        ? {
            materialId: model.id,
            quantity: 1,
            excludedVariantIds: excluded.filter((id) => liveIds.has(id)),
          }
        : null,
      overrides:
        mode === "product"
          ? Object.entries(overrides)
              .filter(([, blankVariantId]) => blankVariantId)
              .map(([shopifyVariantId, blankVariantId]) => ({ shopifyVariantId, blankVariantId }))
          : [],
    };
  }, [excluded, mode, model, overrides, printId, printQty, product?.id, title]);

  if (!model && prints.length === 0) {
    return <p className="text-sm text-muted-foreground">Add a print and a blank before mapping a recipe.</p>;
  }

  function chooseModel(nextId: string) {
    setModelId(nextId);
    if (nextId !== initial?.modelId) setExcluded([]);
    else setExcluded(initial?.excludedIds ?? []);
  }

  return (
    <form action={action} className="grid gap-5">
      <input type="hidden" name="payload" value={JSON.stringify(payload)} />
      {recipeId ? <input type="hidden" name="id" value={recipeId} /> : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {mode === "product" ? (
          <Field label="Shopify product">
            <NativeSelect value={product?.id ?? ""} onChange={(event) => setProductId(event.target.value)}>
              {products.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.title}
                </option>
              ))}
            </NativeSelect>
          </Field>
        ) : (
          <Field label="Line title" hint="Use the title from the order, for example S-XL Shirts.">
            <Input value={title} onChange={(event) => setTitle(event.target.value)} required />
          </Field>
        )}
        <Field label="Print">
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
        <Field label="Blank">
          <NativeSelect value={model?.id ?? ""} onChange={(event) => chooseModel(event.target.value)}>
            {models.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      {model ? (
        <fieldset className="grid gap-3">
          <legend className="text-sm font-medium">Sizes and colors on {model.name}</legend>
          <p className="text-xs text-muted-foreground">
            Checked cells apply to this product. Uncheck a color or size another product uses. New cells added later are included.
          </p>
          <div className="grid gap-3">
            {colors.map((color) => (
              <div key={color} className="flex flex-wrap items-center gap-3">
                <span className="w-24 text-sm font-medium">{color}</span>
                {active
                  .filter((variant) => variant.color === color)
                  .map((variant) => {
                    const checked = !excluded.includes(variant.id);
                    return (
                      <label key={variant.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="size-4 accent-primary"
                          checked={checked}
                          aria-label={`${variant.size} / ${variant.color}`}
                          onChange={(event) =>
                            setExcluded((current) =>
                              event.target.checked ? current.filter((id) => id !== variant.id) : [...current, variant.id],
                            )
                          }
                        />
                        {variant.size}
                      </label>
                    );
                  })}
              </div>
            ))}
          </div>
        </fieldset>
      ) : null}
      {mode === "product" && product && model ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-muted-foreground">
              <tr className="border-b">
                <th className="py-2 pr-3 font-medium">Shopify variant</th>
                <th className="py-2 font-medium">Blank for this variant</th>
              </tr>
            </thead>
            <tbody>
              {product.variants.map((variant) => {
                const pool = active.filter((blank) => !excluded.includes(blank.id));
                const matched = matchBlank({ title: variant.title, options: variant.options }, pool);
                const matchedLabel = pool.find((blank) => blank.id === matched);
                return (
                  <tr key={variant.id} className="border-b border-border/70">
                    <td className="py-2 pr-3 font-medium">{variant.title}</td>
                    <td className="py-2">
                      <NativeSelect
                        aria-label={`Blank for ${variant.title}`}
                        value={overrides[variant.id] ?? ""}
                        onChange={(event) =>
                          setOverrides((current) => ({ ...current, [variant.id]: event.target.value }))
                        }
                      >
                        <option value="">
                          {matchedLabel ? `Auto · ${matchedLabel.size} / ${matchedLabel.color}` : "Auto · no match"}
                        </option>
                        {active.map((blank) => (
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
          <p className="mt-2 text-xs text-muted-foreground">
            Auto uses size and color. Small matches S, and Youth Large matches YL. Pick a row to override that variant only.
          </p>
        </div>
      ) : null}
      <Field label="Notes">
        <Textarea name="notes" rows={2} defaultValue={initial?.notes ?? ""} />
      </Field>
      <Button type="submit" className="w-fit">
        {submitLabel}
      </Button>
    </form>
  );
}
