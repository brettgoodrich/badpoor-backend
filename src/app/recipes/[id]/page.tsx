import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loading } from "@/components/loading";
import { ModelRecipeForm } from "@/components/model-recipe-form";
import { Notice } from "@/components/notice";
import { one } from "@/lib/format";
import { loadShop, parseOptions } from "@/lib/inventory/load";
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
