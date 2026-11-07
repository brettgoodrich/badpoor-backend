import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FormToggles } from "@/components/create-disclosure";
import { Field } from "@/components/field";
import { Loading } from "@/components/loading";
import { ModelRecipeForm } from "@/components/model-recipe-form";
import { NativeSelect } from "@/components/native-select";
import { Notice } from "@/components/notice";
import { one } from "@/lib/format";
import { loadShop, parseOptions } from "@/lib/inventory/load";
import { concreteLines } from "@/lib/inventory/resolve";
import { adjustFinished, makeAhead } from "@/server/actions/finished";
import { deleteRecipe, updateRecipe } from "@/server/actions/recipes";

export default function RecipePage({ params, searchParams }: PageProps<"/recipes/[id]">) {
  return (
    <Suspense fallback={<Loading label="Loading recipe" />}>
      <RecipeScreen params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function RecipeScreen({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const shop = await loadShop();
  const recipe = shop.recipeRows.find((entry) => entry.id === id);
  if (!recipe) notFound();
  const product = recipe.shopifyProductId
    ? shop.productRows.find((entry) => entry.id === recipe.shopifyProductId)
    : undefined;
  const title = product ? product.title : (recipe.customTitle ?? "Custom item");
  const lines = shop.linesByRecipe.get(recipe.id) ?? [];
  const printLine = lines.find((line) => line.role === "print");
  const blankLine = lines.find((line) => line.role === "blank");
  const products = shop.productRows.map((entry) => ({
    id: entry.id,
    title: entry.title,
    variants: shop.variantRows
      .filter((variant) => variant.productId === entry.id)
      .map((variant) => ({
        id: variant.id,
        title: variant.title,
        options: parseOptions(variant.selectedOptions),
      })),
  }));
  const prints = shop.materialRows
    .filter((material) => material.type === "print")
    .map((material) => ({
      id: material.id,
      name: material.name,
      seriesName: shop.seriesRows.find((series) => series.id === material.seriesId)?.name ?? null,
    }));
  const models = shop.materialRows
    .filter((material) => material.type === "blank")
    .map((material) => ({
      id: material.id,
      name: material.name,
      variants: shop.blankVariantRows
        .filter((variant) => variant.materialId === material.id)
        .map((variant) => ({
          id: variant.id,
          size: variant.size,
          color: variant.color,
          archived: Boolean(variant.archivedAt),
        })),
    }));
  const modelRecipe = {
    lines: lines.map((line) => ({
      materialId: line.materialId,
      role: line.role,
      quantity: line.quantity,
      excludedVariantIds: shop.exclusionRows
        .filter((exclusion) => exclusion.recipeLineId === line.id)
        .map((exclusion) => exclusion.variantId),
    })),
    overrides: shop.overrideRows
      .filter((override) => override.recipeId === recipe.id)
      .map((override) => ({ shopifyVariantId: override.shopifyVariantId, blankVariantId: override.blankVariantId })),
  };
  const cells = shop.variantRows
    .filter((variant) => variant.productId === recipe.shopifyProductId)
    .flatMap((variant) => {
      const resolved = concreteLines(
        modelRecipe,
        { shopifyVariantId: variant.id, title: variant.title, options: parseOptions(variant.selectedOptions) },
        shop.blankVariantRows,
      );
      if (!resolved.complete) return [];
      const blankId = resolved.lines.find((line) => line.role === "blank")?.materialId;
      const blank = shop.blankVariantRows.find((entry) => entry.id === blankId);
      return [
        {
          id: variant.id,
          title: variant.title,
          size: blank?.size ?? variant.title,
          color: blank?.color ?? "One color",
          onHand: shop.report.finishedOnHand.get(variant.id) ?? 0,
        },
      ];
    });
  const colors = [...new Set(cells.map((cell) => cell.color))];
  const sizeOrder = ["YXS", "YS", "YM", "YL", "YXL", "XS", "S", "M", "L", "XL", "2XL"];
  const sizes = [...new Set(cells.map((cell) => cell.size))].sort((a, b) => {
    const left = sizeOrder.indexOf(a.toUpperCase());
    const right = sizeOrder.indexOf(b.toUpperCase());
    return (left === -1 ? 50 : left) - (right === -1 ? 50 : right);
  });

  return (
    <>
      <div>
        <Link href="/recipes" className="text-sm text-muted-foreground hover:underline">
          All recipes
        </Link>
        <h1 className="mt-2 font-heading text-4xl tracking-tight">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          {recipe.matchType === "product"
            ? "This recipe covers the whole product. Unchecked sizes and colors are left for other products. Shopify variants match by size and color."
            : "Matched to a custom line title. The size in the title picks the blank variant."}
        </p>
      </div>
      <Notice notice={one(query.notice)} error={one(query.error)} />
      {cells.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Finished stock</CardTitle>
            <CardDescription>
              Garments already made. Making more consumes the print and the matched blank. An adjustment only changes this count.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr>
                    <th className="p-2 text-left font-medium text-muted-foreground">Color</th>
                    {sizes.map((size) => (
                      <th key={size} className="p-2 text-center font-medium">
                        {size}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {colors.map((color) => (
                    <tr key={color} className="border-t border-border">
                      <th className="p-2 text-left font-medium">{color}</th>
                      {sizes.map((size) => {
                        const cell = cells.find((entry) => entry.color === color && entry.size === size);
                        return (
                          <td key={size} className="p-2 text-center tabular-nums">
                            {cell ? cell.onHand : "—"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <FormToggles
              forms={[
                {
                  label: "Make ahead",
                  content: (
                    <form action={makeAhead} className="grid gap-4">
                      <input type="hidden" name="recipeId" value={recipe.id} />
                      <p className="text-sm text-muted-foreground">
                        Enter how many to make. Empty cells are skipped. The print and matched blank are consumed.
                      </p>
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[520px] text-sm">
                          <thead>
                            <tr>
                              <th className="p-2 text-left font-medium text-muted-foreground">Color</th>
                              {sizes.map((size) => (
                                <th key={size} className="p-2 text-center font-medium">
                                  {size}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {colors.map((color) => (
                              <tr key={color} className="border-t border-border">
                                <th className="p-2 text-left font-medium">{color}</th>
                                {sizes.map((size) => {
                                  const cell = cells.find((entry) => entry.color === color && entry.size === size);
                                  return (
                                    <td key={size} className="p-2">
                                      {cell ? (
                                        <Input
                                          name={`qty:${cell.id}`}
                                          inputMode="numeric"
                                          aria-label={`Make ${cell.size} / ${cell.color}`}
                                          placeholder="0"
                                          className="text-center"
                                        />
                                      ) : (
                                        <span className="block text-center text-muted-foreground">—</span>
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <Field label="Note">
                        <Input name="note" placeholder="Made a run of black before the orders landed" />
                      </Field>
                      <Button type="submit" className="w-fit">
                        Make ahead
                      </Button>
                    </form>
                  ),
                },
                {
                  label: "Adjust finished stock",
                  content: (
                    <form action={adjustFinished} className="grid max-w-md gap-3">
                      <input type="hidden" name="recipeId" value={recipe.id} />
                      <Field label="Variant">
                        <NativeSelect name="shopifyVariantId" defaultValue={cells[0]?.id ?? ""}>
                          {cells.map((cell) => (
                            <option key={cell.id} value={cell.id}>
                              {cell.size} / {cell.color} · {cell.onHand} on hand
                            </option>
                          ))}
                        </NativeSelect>
                      </Field>
                      <Field label="Change" hint="Negative numbers count stock down. Materials are not touched.">
                        <Input name="quantity" inputMode="numeric" required placeholder="-1" />
                      </Field>
                      <Field label="Reason">
                        <Input name="note" required placeholder="Counted the shelf" />
                      </Field>
                      <Button type="submit" className="w-fit">
                        Adjust
                      </Button>
                    </form>
                  ),
                },
              ]}
            />
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Materials</CardTitle>
          <CardDescription>Saving replaces the print, the blank, and any unchecked variants.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          <ModelRecipeForm
            action={updateRecipe}
            mode={recipe.matchType === "custom_title" ? "custom" : "product"}
            products={products}
            prints={prints}
            models={models}
            submitLabel="Save recipe"
            recipeId={recipe.id}
            initial={{
              productId: recipe.shopifyProductId ?? undefined,
              title: recipe.customTitle ?? undefined,
              printId: printLine?.materialId,
              printQty: printLine?.quantity,
              modelId: blankLine?.materialId,
              excludedIds: shop.exclusionRows
                .filter((exclusion) => exclusion.recipeLineId === blankLine?.id)
                .map((exclusion) => exclusion.variantId),
              overrides: shop.overrideRows
                .filter((override) => override.recipeId === recipe.id)
                .map((override) => ({ shopifyVariantId: override.shopifyVariantId, blankVariantId: override.blankVariantId })),
              notes: recipe.notes ?? "",
            }}
          />
          <form action={deleteRecipe}>
            <input type="hidden" name="id" value={recipe.id} />
            <Button type="submit" variant="destructive">
              Delete recipe
            </Button>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
