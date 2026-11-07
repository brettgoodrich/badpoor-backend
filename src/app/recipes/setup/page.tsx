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
  const linesByVariant = new Map<string, { materialId: string; quantity: number }[]>();
  for (const recipe of shop.recipeRows) {
    if (!recipe.shopifyVariantId) continue;
    linesByVariant.set(
      recipe.shopifyVariantId,
      (shop.linesByRecipe.get(recipe.id) ?? []).map((line) => ({
        materialId: line.materialId,
        quantity: line.quantity,
      })),
    );
  }

  const products = shop.productRows.map((product) => ({
    id: product.id,
    title: product.title,
    variants: shop.variantRows
      .filter((variant) => variant.productId === product.id)
      .map((variant) => ({
        id: variant.id,
        title: variant.title,
        options: parseOptions(variant.selectedOptions),
        lines: linesByVariant.get(variant.id) ?? [],
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
          Pick one print for the whole product. Each size is matched to a blank with the same size, and the same color when the variant has one. Override any row before saving.
        </p>
      </div>
      <Notice notice={one(query.notice)} error={one(query.error)} />
      <Card>
        <CardHeader>
          <CardTitle>Variants</CardTitle>
          <CardDescription>
            Example: Print A on every HCS Gym Shorts size, Blank Shorts S on S, Blank Shorts M on M.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RecipeSetupForm
            action={saveBulkRecipes}
            products={products}
            materials={shop.materialRows.map((material) => ({
              id: material.id,
              name: material.name,
              type: material.type,
              size: material.size,
              color: material.color,
            }))}
          />
        </CardContent>
      </Card>
    </>
  );
}
