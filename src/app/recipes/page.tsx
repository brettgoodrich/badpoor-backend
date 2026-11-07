import Link from "next/link";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Loading } from "@/components/loading";
import { Notice } from "@/components/notice";
import { cn } from "cn";
import { one } from "@/lib/format";
import { loadShop, variantLabel } from "@/lib/inventory/load";

export default function RecipesPage({ searchParams }: PageProps<"/recipes">) {
  return (
    <Suspense fallback={<Loading label="Loading recipes" />}>
      <Recipes searchParams={searchParams} />
    </Suspense>
  );
}

async function Recipes({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const shop = await loadShop();
  const materials = new Map(shop.materialRows.map((material) => [material.id, material]));
  const variants = new Map(shop.variantRows.map((variant) => [variant.id, variant]));
  const mappedVariants = new Set(
    shop.recipeRows.map((recipe) => recipe.shopifyVariantId).filter((id): id is string => Boolean(id)),
  );
  const unmappedVariants = shop.variantRows.filter((variant) => !mappedVariants.has(variant.id));

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="font-heading text-4xl tracking-tight">Recipes</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            A recipe says which materials one finished unit consumes. Variants map by Shopify id. Custom order lines, like “S-XL Shirts”, map by title because they have no variant.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/recipes/setup" className={cn(buttonVariants())}>
            Map a product
          </Link>
          <Link href="/recipes/custom" className={cn(buttonVariants({ variant: "outline" }))}>
            Map a custom title
          </Link>
        </div>
      </div>
      <Notice notice={one(query.notice)} error={one(query.error)} />

      {shop.report.unmappedLines.length > 0 ? (
        <Card className="border-destructive/40 bg-destructive/10">
          <CardHeader>
            <CardTitle>Open lines waiting for a recipe</CardTitle>
            <CardDescription>Until these are mapped, their materials stay off the buy list.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {shop.report.unmappedLines.map((line) => (
              <div key={line.id} className="flex flex-wrap justify-between gap-2">
                <span>{line.name}</span>
                <span className="text-muted-foreground">
                  {line.variantId ? "variant" : "custom title"} · {line.remaining} unbuilt
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3">
        {shop.recipeRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recipes yet.</p>
        ) : (
          shop.recipeRows.map((recipe) => {
            const variant = recipe.shopifyVariantId ? variants.get(recipe.shopifyVariantId) : undefined;
            const title = variant
              ? `${variant.productTitle} · ${variant.title}`
              : (recipe.customTitle ?? "Custom item");
            const lines = shop.linesByRecipe.get(recipe.id) ?? [];
            return (
              <Card key={recipe.id} size="sm">
                <CardHeader>
                  <CardTitle>
                    <Link href={`/recipes/${recipe.id}`} className="hover:underline">
                      {title}
                    </Link>
                  </CardTitle>
                  <CardDescription>
                    <Badge variant="outline">{recipe.matchType === "variant" ? "Variant" : "Custom title"}</Badge>
                    {recipe.notes ? <span className="ml-2">{recipe.notes}</span> : null}
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {lines
                    .map((line) => {
                      const material = materials.get(line.materialId);
                      const blank = line.variantId
                        ? shop.blankVariantRows.find((variant) => variant.id === line.variantId)
                        : undefined;
                      const name = blank
                        ? variantLabel(material?.name ?? "Blank", blank.size, blank.color)
                        : (material?.name ?? "Missing material");
                      return `${name} × ${line.quantity}`;
                    })
                    .join(" · ") || "No materials"}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {unmappedVariants.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Variants with no recipe</CardTitle>
            <CardDescription>
              {unmappedVariants.length} catalog variants are not mapped. They only matter once an order includes them.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {unmappedVariants.map((variant) => (
              <Badge key={variant.id} variant="secondary">
                {variant.productTitle} · {variant.title}
              </Badge>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
