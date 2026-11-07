import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/field";
import { Loading } from "@/components/loading";
import { Notice } from "@/components/notice";
import { RecipeLinesForm } from "@/components/recipe-lines-form";
import { one } from "@/lib/format";
import { loadShop } from "@/lib/inventory/load";
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
  const variant = recipe.shopifyVariantId
    ? shop.variantRows.find((entry) => entry.id === recipe.shopifyVariantId)
    : undefined;
  const title = variant
    ? `${variant.productTitle} · ${variant.title}`
    : (recipe.customTitle ?? "Custom item");
  const lines = shop.linesByRecipe.get(recipe.id) ?? [];

  return (
    <>
      <div>
        <Link href="/recipes" className="text-sm text-muted-foreground hover:underline">
          All recipes
        </Link>
        <h1 className="mt-2 font-heading text-4xl tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {recipe.matchType === "variant" ? "Matched to a Shopify variant." : "Matched to a custom line title."}{" "}
          Quantities are per finished garment.
        </p>
      </div>
      <Notice notice={one(query.notice)} error={one(query.error)} />
      <Card>
        <CardHeader>
          <CardTitle>Materials per unit</CardTitle>
          <CardDescription>Saving replaces the whole bill of materials for this recipe.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          <RecipeLinesForm
            action={updateRecipe}
            materials={shop.materialRows.map((material) => ({
              id: material.id,
              name: material.name,
              unit: material.unit,
            }))}
            initialLines={lines.map((line) => ({ materialId: line.materialId, quantity: line.quantity }))}
            submitLabel="Save recipe"
          >
            <input type="hidden" name="id" value={recipe.id} />
            <Field label="Notes">
              <Textarea name="notes" rows={2} defaultValue={recipe.notes ?? ""} />
            </Field>
          </RecipeLinesForm>
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
