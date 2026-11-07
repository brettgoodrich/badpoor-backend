import Link from "next/link";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/field";
import { Loading } from "@/components/loading";
import { NativeSelect } from "@/components/native-select";
import { Notice } from "@/components/notice";
import { Qty } from "@/components/qty";
import { one } from "@/lib/format";
import { loadShop } from "@/lib/inventory/load";
import { createBlankModel, createPrint, createPrintSeries, createSimpleMaterial } from "@/server/actions/materials";

export default function MaterialsPage({ searchParams }: PageProps<"/materials">) {
  return (
    <Suspense fallback={<Loading label="Loading materials" />}>
      <Materials searchParams={searchParams} />
    </Suspense>
  );
}

async function Materials({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const seriesFilter = one(query.series);
  const shop = await loadShop();
  const blanks = shop.materialRows.filter((material) => material.type === "blank");
  const prints = shop.materialRows.filter((material) => material.type === "print");
  const others = shop.materialRows.filter((material) => material.type !== "blank" && material.type !== "print");
  const visibleSeries = seriesFilter ? shop.seriesRows.filter((series) => series.id === seriesFilter) : shop.seriesRows;
  const showUngrouped = !seriesFilter;
  return (
    <>
      <div>
        <h1 className="font-heading text-4xl tracking-tight">Materials</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Blank models generate a size and color grid. Each cell has its own ledger. Prints are single materials and can sit in a series.
        </p>
      </div>
      <Notice notice={one(query.notice)} error={one(query.error)} />

      <section className="grid gap-3">
        <h2 className="font-heading text-2xl">Blank models</h2>
        {blanks.length === 0 ? <p className="text-sm text-muted-foreground">No blank models yet.</p> : null}
        <div className="grid gap-3 md:grid-cols-2">
          {blanks.map((model) => {
            const variants = shop.blankVariantRows.filter((variant) => variant.materialId === model.id && !variant.archivedAt);
            return (
              <Card key={model.id} size="sm">
                <CardHeader>
                  <CardTitle>
                    <Link href={`/materials/${model.id}`} className="hover:underline">
                      {model.name}
                    </Link>
                  </CardTitle>
                  <CardDescription>
                    {[model.brand, model.styleNumber].filter(Boolean).join(" · ") || "No style number yet"}
                    {" · "}
                    {variants.length} variants
                  </CardDescription>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="grid gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-heading text-2xl">Prints</h2>
          <div className="flex flex-wrap gap-2 text-sm">
            <Link
              href="/materials"
              className={`rounded-md px-2 py-1 ${seriesFilter ? "text-muted-foreground hover:text-foreground" : "bg-primary text-primary-foreground"}`}
            >
              All series
            </Link>
            {shop.seriesRows.map((series) => (
              <Link
                key={series.id}
                href={`/materials?series=${series.id}`}
                className={`rounded-md px-2 py-1 ${seriesFilter === series.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {series.name}
              </Link>
            ))}
          </div>
        </div>
        {visibleSeries.map((series) => (
          <Card key={series.id} size="sm">
            <CardHeader>
              <CardTitle>{series.name}</CardTitle>
              {series.notes ? <CardDescription>{series.notes}</CardDescription> : null}
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              {prints
                .filter((print) => print.seriesId === series.id)
                .map((print) => (
                  <div key={print.id} className="flex items-center justify-between gap-3">
                    <Link href={`/materials/${print.id}`} className="font-medium hover:underline">
                      {print.name}
                    </Link>
                    <Qty value={shop.report.onHand.get(print.id) ?? 0} unit={print.unit} />
                  </div>
                ))}
            </CardContent>
          </Card>
        ))}
        {showUngrouped && prints.some((print) => !print.seriesId) ? (
          <Card size="sm">
            <CardHeader>
              <CardTitle>Ungrouped prints</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              {prints
                .filter((print) => !print.seriesId)
                .map((print) => (
                  <Link key={print.id} href={`/materials/${print.id}`} className="hover:underline">
                    {print.name}
                  </Link>
                ))}
            </CardContent>
          </Card>
        ) : null}
      </section>

      {others.length > 0 ? (
        <section className="grid gap-2">
          <h2 className="font-heading text-2xl">Other</h2>
          {others.map((material) => (
            <div key={material.id} className="flex items-center justify-between text-sm">
              <Link href={`/materials/${material.id}`} className="font-medium hover:underline">
                {material.name}
              </Link>
              <span className="flex items-center gap-2">
                <Badge variant="secondary">{material.type}</Badge>
                <Qty value={shop.report.onHand.get(material.id) ?? 0} unit={material.unit} />
              </span>
            </div>
          ))}
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>New blank model</CardTitle>
            <CardDescription>Sizes and colors become the grid. You do not enter each variant.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createBlankModel} className="grid gap-3">
              <Field label="Name">
                <Input name="name" required placeholder="Gildan 64000" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Brand">
                  <Input name="brand" placeholder="Gildan" />
                </Field>
                <Field label="Style number">
                  <Input name="styleNumber" placeholder="64000" />
                </Field>
              </div>
              <Field label="Sizes" hint="YS, YM, YL, S, M, L, XL">
                <Input name="sizes" required placeholder="YS, S, M, L, XL" />
              </Field>
              <Field label="Colors">
                <Input name="colors" required placeholder="Black, Navy" />
              </Field>
              <Button type="submit">Create model</Button>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>New print</CardTitle>
            <CardDescription>A print is one material. Series is optional.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createPrint} className="grid gap-3">
              <Field label="Name">
                <Input name="name" required placeholder="Print A" />
              </Field>
              <Field label="Series">
                <NativeSelect name="seriesId" defaultValue="">
                  <option value="">No series</option>
                  {shop.seriesRows.map((series) => (
                    <option key={series.id} value={series.id}>
                      {series.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Notes">
                <Textarea name="notes" rows={2} />
              </Field>
              <Button type="submit">Add print</Button>
            </form>
            <form action={createPrintSeries} className="mt-4 grid gap-3 border-t border-border pt-4">
              <Field label="New series">
                <Input name="name" placeholder="PTF Uniforms 2026" />
              </Field>
              <Button type="submit" variant="outline">
                Add series
              </Button>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Trim or other</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={createSimpleMaterial} className="grid gap-3">
              <Field label="Name">
                <Input name="name" required />
              </Field>
              <Field label="Type">
                <NativeSelect name="type" defaultValue="other">
                  <option value="other">other</option>
                  <option value="trim">trim</option>
                </NativeSelect>
              </Field>
              <Field label="Unit">
                <Input name="unit" defaultValue="each" />
              </Field>
              <Button type="submit" variant="outline">
                Add material
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
