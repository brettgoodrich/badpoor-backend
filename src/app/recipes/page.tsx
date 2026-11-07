import Link from "next/link";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { CardLink } from "@/components/card-link";
import { Loading } from "@/components/loading";
import { Notice } from "@/components/notice";
import { cn } from "cn";
import { one } from "@/lib/format";
import { loadShop } from "@/lib/inventory/load";

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
  const products = new Map(shop.productRows.map((product) => [product.id, product]));
  const mappedProducts = new Set(
    shop.recipeRows.map((recipe) => recipe.shopifyProductId).filter((id): id is string => Boolean(id)),
  );
  const unmappedProducts = shop.productRows.filter((product) => !mappedProducts.has(product.id));

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="font-heading text-4xl tracking-tight">Recipes</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            A recipe covers a whole Shopify product: a print plus a blank. Sizes and colors match on their own. Custom order lines, like “S-XL Shirts”, map by title.
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
            const product = recipe.shopifyProductId ? products.get(recipe.shopifyProductId) : undefined;
            const title = product ? product.title : (recipe.customTitle ?? "Custom item");
            const lines = shop.linesByRecipe.get(recipe.id) ?? [];
            const blankLine = lines.find((line) => line.role === "blank");
            const unchecked = blankLine
              ? shop.exclusionRows.filter((exclusion) => exclusion.recipeLineId === blankLine.id).length
              : 0;
            const summary = lines
              .map((line) => `${materials.get(line.materialId)?.name ?? "Missing material"} × ${line.quantity}`)
              .join(" · ");
            return (
              <CardLink key={recipe.id} href={`/recipes/${recipe.id}`}>
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-heading text-base font-medium group-hover/card:underline">{title}</span>
                  <Badge variant="outline">{recipe.matchType === "product" ? "Product" : "Custom title"}</Badge>
                </span>
                <span className="text-muted-foreground">
                  {summary || "No materials"}
                  {unchecked > 0 ? ` · ${unchecked} variant${unchecked === 1 ? "" : "s"} unchecked` : ""}
                </span>
              </CardLink>
            );
          })
        )}
      </div>

      {unmappedProducts.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Products with no recipe</CardTitle>
            <CardDescription>These products are not mapped yet. They only matter once an order includes them.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {unmappedProducts.map((product) => (
              <Badge key={product.id} variant="secondary">
                {product.title}
              </Badge>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
