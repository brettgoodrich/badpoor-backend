import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CardLink } from "@/components/card-link";
import { Loading } from "@/components/loading";
import { Notice } from "@/components/notice";
import { formatDate, fulfillmentLabel, one, orderPath } from "@/lib/format";
import { loadShop } from "@/lib/inventory/load";
import { shopifySetupMessage } from "@/lib/shopify/client";
import { syncShopify } from "@/server/actions/shopify";

export default function OrdersPage({ searchParams }: PageProps<"/orders">) {
  return (
    <Suspense fallback={<Loading label="Loading orders" />}>
      <Orders searchParams={searchParams} />
    </Suspense>
  );
}

async function Orders({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const shop = await loadShop();
  const setup = shopifySetupMessage();

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="font-heading text-4xl tracking-tight">Orders</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Open and partially fulfilled Shopify orders, kept as a local copy. Sync reads the store. It never fulfills, edits, or writes an order.
          </p>
        </div>
        <form action={syncShopify}>
          <Button type="submit">Sync from Shopify</Button>
        </form>
      </div>
      <Notice notice={one(query.notice)} error={one(query.error)} />
      {setup ? <p className="text-sm text-muted-foreground">{setup}</p> : null}
      <p className="text-xs text-muted-foreground">
        {shop.syncedAt
          ? `Local copy updated ${formatDate(shop.syncedAt)}. ${shop.productRows.length} products, ${shop.variantRows.length} variants.`
          : "Nothing synced yet."}
      </p>

      {shop.report.orders.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No open orders</CardTitle>
            <CardDescription>Sync the store, or run npm run db:seed for the sample shop.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-3">
          {shop.report.orders.map((order) => (
            <CardLink key={order.id} href={orderPath(order.id)}>
              <span className="font-heading text-base font-medium group-hover/card:underline">{order.name}</span>
              <span className="text-muted-foreground">
                {formatDate(order.createdAt)} · {fulfillmentLabel(order.fulfillmentStatus)} · {order.unitsRemaining} to build
                {order.unmappedCount > 0 ? ` · ${order.unmappedCount} without a recipe` : ""}
              </span>
              <span className="mt-2 flex flex-wrap gap-2">
                {order.lines.map((line) => (
                  <Badge key={line.id} variant={line.recipeId || line.remaining === 0 ? "secondary" : "destructive"}>
                    {line.name} × {line.remaining}
                  </Badge>
                ))}
              </span>
            </CardLink>
          ))}
        </div>
      )}
    </>
  );
}
