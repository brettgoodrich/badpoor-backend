import Link from "next/link";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loading } from "@/components/loading";
import { Notice } from "@/components/notice";
import { Qty } from "@/components/qty";
import { formatDate, fulfillmentLabel, one, orderPath } from "@/lib/format";
import { loadShop } from "@/lib/inventory/load";

export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <Suspense fallback={<Loading label="Loading the bench" />}>
      <Dashboard searchParams={searchParams} />
    </Suspense>
  );
}

async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const { report } = await loadShop();
  const openOrders = report.orders.filter((order) => order.unitsRemaining > 0 || order.lines.length > 0);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <p className="text-xs font-medium tracking-[0.16em] text-primary uppercase">Shop floor</p>
          <h1 className="mt-1 font-heading text-4xl tracking-tight">What to cut, and what to buy</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Finished uniforms stay on Shopify. This bench tracks the prints and blanks they are made from.
            On hand is the ledger total. A negative count is already a shortfall to buy.
          </p>
        </div>
      </div>
      <Notice notice={one(query.notice)} error={one(query.error)} />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Open orders" value={String(openOrders.length)} detail="Unfulfilled or partial" />
        <Stat label="Units still to build" value={String(report.unitsRemaining)} detail="Including lines with no recipe" />
        <Stat label="Materials to buy" value={String(report.buyCount)} detail="Shortfall is greater than zero" />
        <Stat
          label="Lines with no recipe"
          value={String(report.unmappedLines.length)}
          detail={report.unmappedLines.length > 0 ? "They are not in the buy list yet" : "Every open line is mapped"}
        />
      </section>

      {report.unmappedLines.length > 0 ? (
        <Card className="border-destructive/40 bg-destructive/10">
          <CardHeader>
            <CardTitle>No recipe yet</CardTitle>
            <CardDescription>
              These open lines are not consuming materials. Map the variant, or the custom title, before they can land on the buy list.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {report.unmappedLines.map((line) => {
              const order = report.orders.find((entry) => entry.id === line.orderId);
              return (
                <div key={line.id} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span>
                    <Link href={orderPath(line.orderId)} className="font-medium underline-offset-4 hover:underline">
                      {order?.name}
                    </Link>{" "}
                    <span className="text-muted-foreground">{line.name}</span>
                  </span>
                  <span className="tabular-nums">{line.remaining} unbuilt</span>
                </div>
              );
            })}
            <Link href="/recipes" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
              Set up recipes
            </Link>
          </CardContent>
        </Card>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Buy list</CardTitle>
            <CardDescription>
              Needed is what open orders still consume. Buy is needed minus on hand.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {report.needs.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing to buy. Open orders are covered, and no material is negative.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Material</TableHead>
                    <TableHead className="text-right">On hand</TableHead>
                    <TableHead className="text-right">Needed</TableHead>
                    <TableHead className="text-right">Buy</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.needs.map((row) => (
                    <TableRow key={row.materialId}>
                      <TableCell>
                        <Link href={`/materials/${row.materialId}`} className="font-medium hover:underline">
                          {row.materialName}
                        </Link>
                        <div className="text-xs text-muted-foreground">{row.type}</div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Qty value={row.onHand} unit={row.unit} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.demand}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {row.shortfall > 0 ? <span className="text-destructive">{row.shortfall}</span> : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Can build right now</CardTitle>
            <CardDescription>
              Each size is how many you could make of that variant alone, limited by its scarcest material. A shared print covers fewer garments in total.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            {report.buildableGroups.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recipes yet. Map a print and a blank to a product to see buildable counts.</p>
            ) : (
              report.buildableGroups.map((group) => (
                <div key={group.productTitle} className="grid gap-2">
                  <h2 className="font-heading text-lg">{group.productTitle}</h2>
                  {group.shared.map((cap) => (
                    <p key={cap.materialId} className="text-sm leading-relaxed text-muted-foreground">
                      <span className="font-medium text-foreground">{cap.materialName}</span> is shared.
                      {cap.maxUnits !== null
                        ? ` ${cap.onHand} on hand covers ${cap.maxUnits} garments in total across these variants. Each row is how many you could build of that size alone.`
                        : " Recipes use different amounts of it, so there is no single garment cap."}
                    </p>
                  ))}
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Variant</TableHead>
                        <TableHead className="text-right">Alone</TableHead>
                        <TableHead>Limited by</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.rows.map((row) => (
                        <TableRow key={row.recipeId}>
                          <TableCell>{row.label.replace(`${group.productTitle} · `, "")}</TableCell>
                          <TableCell className="text-right font-medium tabular-nums">{row.count}</TableCell>
                          <TableCell className="text-muted-foreground">{row.limitingMaterialName ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-3">
        <div className="flex items-end justify-between gap-3">
          <h2 className="font-heading text-2xl">Open orders</h2>
          <Link href="/orders" className="text-sm font-medium text-primary hover:underline">
            All orders
          </Link>
        </div>
        {openOrders.length === 0 ? (
          <p className="text-sm text-muted-foreground">No open orders in the local copy. Sync from Shopify, or seed the sample shop.</p>
        ) : (
          <div className="grid gap-3">
            {openOrders.map((order) => (
              <Card key={order.id} size="sm">
                <CardHeader>
                  <CardTitle>
                    <Link href={orderPath(order.id)} className="hover:underline">
                      {order.name}
                    </Link>
                  </CardTitle>
                  <CardDescription>
                    {formatDate(order.createdAt)} · {fulfillmentLabel(order.fulfillmentStatus)} · {order.unitsRemaining} to build
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-2">
                  {order.lines.map((line) => (
                    <div key={line.id} className="flex flex-wrap items-start justify-between gap-2 text-sm">
                      <div>
                        <div className="font-medium">{line.name}</div>
                        {line.recipeId ? (
                          <p className="text-muted-foreground">
                            {line.needs.map((need) => `${need.materialName} ${need.quantity}`).join(" · ") || "Recipe has no materials"}
                          </p>
                        ) : line.remaining > 0 ? (
                          <Badge variant="destructive">No recipe</Badge>
                        ) : (
                          <p className="text-muted-foreground">Nothing left to build</p>
                        )}
                      </div>
                      <div className="text-right tabular-nums">
                        <div>{line.remaining} left</div>
                        {line.recipeId && line.remaining > 0 ? (
                          <div className="text-muted-foreground">can build {line.canBuildNow}</div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="font-heading text-3xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">{detail}</CardContent>
    </Card>
  );
}
