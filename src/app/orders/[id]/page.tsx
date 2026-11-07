import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FulfillForm } from "@/components/fulfill-form";
import { Loading } from "@/components/loading";
import { Notice } from "@/components/notice";
import { formatDate, formatWhen, fulfillmentLabel, one, sameOrder } from "@/lib/format";
import { loadShop, variantLabel } from "@/lib/inventory/load";
import { markLineBuilt, markOrderBuilt } from "@/server/actions/orders";

export default function OrderPage({ params, searchParams }: PageProps<"/orders/[id]">) {
  return (
    <Suspense fallback={<Loading label="Loading order" />}>
      <OrderScreen params={params} searchParams={searchParams} />
    </Suspense>
  );
}

function blankChoices(
  line: { needs: { materialId: string; role: string }[] },
  shop: Awaited<ReturnType<typeof loadShop>>,
) {
  const blankNeed = line.needs.find((need) => need.role === "blank");
  const variant = blankNeed ? shop.blankVariantRows.find((entry) => entry.id === blankNeed.materialId) : undefined;
  if (!variant) return [];
  const model = shop.materialRows.find((entry) => entry.id === variant.materialId);
  const choices = shop.blankVariantRows.filter((entry) => entry.materialId === variant.materialId && !entry.archivedAt);
  const selected = choices.find((entry) => entry.id === variant.id);
  const ordered = selected ? [selected, ...choices.filter((entry) => entry.id !== selected.id)] : choices;
  return ordered.map((choice) => ({
    id: choice.id,
    label: variantLabel(model?.name ?? "Blank", choice.size, choice.color),
  }));
}

async function OrderScreen({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const shop = await loadShop();
  const order = shop.report.orders.find((entry) => sameOrder(entry.id, id));
  if (!order) notFound();
  const builds = shop.buildRows.filter((build) => build.orderId === id);
  const mappedRemaining = order.lines.filter((line) => line.recipeId && line.remaining > 0);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/orders" className="text-sm text-muted-foreground hover:underline">
            All orders
          </Link>
          <h1 className="mt-2 font-heading text-4xl tracking-tight">{order.name}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {formatDate(order.createdAt)} · {fulfillmentLabel(order.fulfillmentStatus)} · {order.unitsRemaining} still to build
          </p>
        </div>
        {mappedRemaining.length > 0 ? (
          <form action={markOrderBuilt}>
            <input type="hidden" name="orderId" value={order.id} />
            <Button type="submit">Mark all mapped lines built</Button>
          </form>
        ) : null}
      </div>
      <Notice notice={one(query.notice)} error={one(query.error)} />
      <p className="text-sm text-muted-foreground">
        Marking built writes consume movements for the recipe. The Shopify order stays as it is.
      </p>

      <div className="grid gap-3">
        {order.lines.map((line) => (
          <Card key={line.id}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                {line.name}
                {!line.recipeId && line.remaining > 0 ? <Badge variant="destructive">No recipe</Badge> : null}
              </CardTitle>
              <CardDescription>
                Ordered {line.quantity} · unfulfilled on Shopify {line.unfulfilledQuantity} · built here {line.built} · left {line.remaining}
                {line.finishedCover > 0 ? ` · ${line.finishedCover} covered by finished stock` : ""}
                {line.recipeId && line.remaining > 0 ? ` · can build ${line.canBuildNow} more from materials` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              {line.finishedCover > 0 && line.needs.length === 0 ? (
                <p className="text-sm text-muted-foreground">Finished stock covers what is still open on this line.</p>
              ) : line.needs.length > 0 ? (
                <ul className="text-sm text-muted-foreground">
                  {line.needs.map((need) => (
                    <li key={need.materialId}>
                      <Link href={`/materials/${need.materialId}`} className="hover:underline">
                        {need.materialName}
                      </Link>{" "}
                      × {need.quantity} still to make
                    </li>
                  ))}
                </ul>
              ) : line.remaining > 0 ? (
                <p className="text-sm">
                  <Link href={line.variantId ? "/recipes/setup" : "/recipes/custom"} className="font-medium text-primary hover:underline">
                    Add a recipe
                  </Link>{" "}
                  before this line can be marked built.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">Nothing left to build on this line.</p>
              )}

              {line.recipeId && line.remaining > 0 ? (
                <FulfillForm
                  action={markLineBuilt}
                  lineItemId={line.id}
                  orderId={order.id}
                  remaining={line.remaining}
                  finishedCover={line.finishedCover}
                  blanks={blankChoices(line, shop)}
                />
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>

      {builds.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Builds recorded here</CardTitle>
            <CardDescription>These did not change the Shopify order.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {builds.map((build) => {
              const line = order.lines.find((entry) => entry.id === build.lineItemId);
              return (
                <div key={build.id}>
                  <span className="font-medium">{formatWhen(build.createdAt)}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {build.quantity} × {line?.name ?? build.lineItemId}
                    {build.note ? ` · ${build.note}` : ""}
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
