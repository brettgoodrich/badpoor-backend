import Link from "next/link";
import { Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateDisclosure } from "@/components/create-disclosure";
import { Loading } from "@/components/loading";
import { ModelRecipeForm } from "@/components/model-recipe-form";
import { Notice } from "@/components/notice";
import { one } from "@/lib/format";
import { loadShop, parseOptions } from "@/lib/inventory/load";
import { saveProductRecipe } from "@/server/actions/recipes";

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
  const products = shop.productRows.map((product) => ({
    id: product.id,
    title: product.title,
    variants: shop.variantRows
      .filter((variant) => variant.productId === product.id)
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
      <Notice notice={one(query.notice)} error={one(query.error)} />
      <CreateDisclosure
        label="New recipe"
        heading={
          <div>
            <Link href="/recipes" className="text-sm text-muted-foreground hover:underline">
              All recipes
            </Link>
            <h1 className="mt-2 font-heading text-4xl tracking-tight">Map a product</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              One recipe covers the whole product. Pick a print and a blank, then uncheck sizes or colors that belong to a different product. Small matches S.
            </p>
          </div>
        }
      >
        <Card>
          <CardHeader>
            <CardTitle>Product recipe</CardTitle>
          </CardHeader>
          <CardContent>
            <ModelRecipeForm
              action={saveProductRecipe}
              mode="product"
              products={products}
              prints={prints}
              models={models}
              submitLabel="Save recipe"
            />
          </CardContent>
        </Card>
      </CreateDisclosure>
    </>
  );
}
