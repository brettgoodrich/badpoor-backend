import Link from "next/link";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CardLink } from "@/components/card-link";
import { CreateDisclosure } from "@/components/create-disclosure";
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
          Blanks generate a size and color grid. Each cell has its own ledger. Prints are single materials and can sit in a series.
        </p>
      </div>
      <Notice notice={one(query.notice)} error={one(query.error)} />

      <section className="grid gap-3">
        <CreateDisclosure
          label="New blank"
          heading={<h2 className="font-heading text-2xl">Blanks</h2>}
        >
          <Card>
            <CardHeader>
              <CardTitle>New blank</CardTitle>
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
                <Button type="submit" className="w-fit">
                  Create blank
                </Button>
              </form>
            </CardContent>
          </Card>
        </CreateDisclosure>
        {blanks.length === 0 ? <p className="text-sm text-muted-foreground">No blanks yet.</p> : null}
        <div className="grid gap-3 md:grid-cols-2">
          {blanks.map((model) => {
            const variants = shop.blankVariantRows.filter((variant) => variant.materialId === model.id && !variant.archivedAt);
            const detail = [model.brand, model.styleNumber].filter(Boolean).join(" · ");
            return (
              <CardLink key={model.id} href={`/materials/${model.id}`}>
                <span className="font-heading text-base font-medium group-hover/card:underline">{model.name}</span>
                <span className="text-muted-foreground">
                  {detail || "No style number yet"} · {variants.length} variants
                </span>
              </CardLink>
            );
          })}
        </div>
      </section>

      <section className="grid gap-3">
        <CreateDisclosure
          label="New print"
          heading={
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
          }
        >
          <div className="grid gap-4 lg:grid-cols-2">
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
                  <Button type="submit" className="w-fit">
                    Add print
                  </Button>
                </form>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>New series</CardTitle>
              </CardHeader>
              <CardContent>
                <form action={createPrintSeries} className="grid gap-3">
                  <Field label="Name">
                    <Input name="name" placeholder="PTF Uniforms 2026" />
                  </Field>
                  <Field label="Notes">
                    <Textarea name="notes" rows={2} />
                  </Field>
                  <Button type="submit" variant="outline" className="w-fit">
                    Add series
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </CreateDisclosure>
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

      <section className="grid gap-3">
        <CreateDisclosure label="New material" heading={<h2 className="font-heading text-2xl">Other</h2>}>
          <Card>
            <CardHeader>
              <CardTitle>Trim or other</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={createSimpleMaterial} className="grid max-w-md gap-3">
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
                <Button type="submit" variant="outline" className="w-fit">
                  Add material
                </Button>
              </form>
            </CardContent>
          </Card>
        </CreateDisclosure>
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
    </>
  );
}
