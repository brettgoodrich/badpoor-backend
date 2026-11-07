import Link from "next/link";
import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loading } from "@/components/loading";
import { Notice } from "@/components/notice";
import { RecipeSetupForm } from "@/components/recipe-setup-form";
import { one } from "@/lib/format";
import { loadShop, parseOptions } from "@/lib/inventory/load";
import { saveBulkRecipes } from "@/server/actions/recipes";

export default function SetupPage({ searchParams }: PageProps<"/recipes/setup">) {
  return (
    <Suspense fallback={<Loading label="Loading the catalog" />}>
      <Setup searchParams={searchParams} />
    </Suspense>
  );
}

async function Setup({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const shop = await loadShop();
  const linesByVariant = new Map<string, { variantId: string | null; role: string }[]>();
  for (const recipe of shop.recipeRows) {
    if (!recipe.shopifyVariantId) continue;
    linesByVariant.set(
      recipe.shopifyVariantId,
      (shop.linesByRecipe.get(recipe.id) ?? []).map((line) => ({
        variantId: line.variantId,
        role: line.role,
      })),
    );
  }

  const products = shop.productRows.map((product) => ({
    id: product.id,
    title: product.title,
    variants: shop.variantRows
      .filter((variant) => variant.productId === product.id)
      .map((variant) => {
        const lines = linesByVariant.get(variant.id) ?? [];
        return {
          id: variant.id,
          title: variant.title,
          options: parseOptions(variant.selectedOptions),
          blankVariantId: lines.find((line) => line.role === "blank")?.variantId ?? null,
          printIds: [],
        };
      }),
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
        <h1 className="mt-2 font-heading text-4xl tracking-tight">Map a product</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Choose the print and the blank model. Each Shopify variant is matched to a size and color on that model. Small matches S. Override any row before saving.
        </p>
      </div>
      <Notice notice={one(query.notice)} error={one(query.error)} />
      <Card>
        <CardHeader>
          <CardTitle>Variants</CardTitle>
          <CardDescription>
            Example: Print A from PTF Uniforms 2026 on every HCS Gym Shorts size, matched to Gildan 64000 in black.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RecipeSetupForm action={saveBulkRecipes} products={products} prints={prints} models={models} />
        </CardContent>
      </Card>
    </>
  );
}
