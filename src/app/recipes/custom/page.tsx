import Link from "next/link";
import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/field";
import { Loading } from "@/components/loading";
import { Notice } from "@/components/notice";
import { RecipeLinesForm } from "@/components/recipe-lines-form";
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
  const { materialRows, report } = await loadShop();
  const suggestions = [
    ...new Set(report.unmappedLines.filter((line) => !line.variantId).map((line) => line.title)),
  ];

  return (
    <>
      <div>
        <Link href="/recipes" className="text-sm text-muted-foreground hover:underline">
          All recipes
        </Link>
        <h1 className="mt-2 font-heading text-4xl tracking-tight">Map a custom title</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Custom line items have no variant. Matching ignores case and extra spaces, and uses the line title, then the full line name.
        </p>
      </div>
      <Notice notice={one(query.notice)} error={one(query.error)} />
      <Card>
        <CardHeader>
          <CardTitle>Custom line</CardTitle>
          <CardDescription>
            {suggestions.length > 0
              ? `Open unmapped titles: ${suggestions.join(", ")}`
              : "No unmapped custom lines in the current orders."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RecipeLinesForm
            action={saveCustomRecipe}
            materials={materialRows.map((material) => ({
              id: material.id,
              name: material.name,
              unit: material.unit,
            }))}
            initialLines={[]}
            submitLabel="Save custom recipe"
          >
            <Field label="Line title" hint="Use the title from the order, for example S-XL Shirts.">
              <Input name="title" required defaultValue={suggestions[0] ?? ""} />
            </Field>
            <Field label="Notes">
              <Textarea name="notes" rows={2} />
            </Field>
          </RecipeLinesForm>
        </CardContent>
      </Card>
    </>
  );
}
