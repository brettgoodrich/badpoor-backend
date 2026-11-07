import Link from "next/link";
import { Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateDisclosure } from "@/components/create-disclosure";
import { Loading } from "@/components/loading";
import { ModelRecipeForm } from "@/components/model-recipe-form";
import { Notice } from "@/components/notice";
import { one } from "@/lib/format";
import { loadShop } from "@/lib/inventory/load";
import { saveCustomRecipe } from "@/server/actions/recipes";

export default function CustomRecipePage({ searchParams }: PageProps<"/recipes/custom">) {
  return (
    <Suspense fallback={<Loading label="Loading materials" />}>
      <CustomRecipe searchParams={searchParams} />
    </Suspense>
  );
}

async function CustomRecipe({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const shop = await loadShop();
  const suggestions = [
    ...new Set(shop.report.unmappedLines.filter((line) => !line.variantId).map((line) => line.title)),
  ];
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
        label="New custom recipe"
        heading={
          <div>
            <Link href="/recipes" className="text-sm text-muted-foreground hover:underline">
              All recipes
            </Link>
            <h1 className="mt-2 font-heading text-4xl tracking-tight">Map a custom title</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Custom line items have no Shopify variant. The title is matched ignoring case and extra spaces, and the size in that title picks the blank variant.
              {suggestions.length > 0 ? ` Open unmapped titles: ${suggestions.join(", ")}.` : ""}
            </p>
          </div>
        }
      >
        <Card>
          <CardHeader>
            <CardTitle>Custom line</CardTitle>
          </CardHeader>
          <CardContent>
            <ModelRecipeForm
              action={saveCustomRecipe}
              mode="custom"
              products={[]}
              prints={prints}
              models={models}
              initial={{ title: suggestions[0] ?? "" }}
              submitLabel="Save custom recipe"
            />
          </CardContent>
        </Card>
      </CreateDisclosure>
    </>
  );
}
