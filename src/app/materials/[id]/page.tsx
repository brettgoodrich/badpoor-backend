import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Field } from "@/components/field";
import { Loading } from "@/components/loading";
import { NativeSelect } from "@/components/native-select";
import { Notice } from "@/components/notice";
import { Qty } from "@/components/qty";
import { materialTypes } from "@/lib/db/schema";
import { formatWhen, one } from "@/lib/format";
import { loadShop } from "@/lib/inventory/load";
import { deleteMaterial, recordMovement, updateMaterial } from "@/server/actions/materials";

export default function MaterialPage({ params, searchParams }: PageProps<"/materials/[id]">) {
  return (
    <Suspense fallback={<Loading label="Loading material" />}>
      <MaterialScreen params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function MaterialScreen({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const { materialRows, movementRows, report } = await loadShop();
  const material = materialRows.find((entry) => entry.id === id);
  if (!material) notFound();

  const history = movementRows.filter((movement) => movement.materialId === id);
  const withBalance = history.reduce<Array<(typeof history)[number] & { balance: number }>>((rows, movement) => {
    const previous = rows.length > 0 ? rows[rows.length - 1].balance : 0;
    return [...rows, { ...movement, balance: previous + movement.quantity }];
  }, []);
  const onHand = report.onHand.get(id) ?? 0;

  return (
    <>
      <div>
        <Link href="/materials" className="text-sm text-muted-foreground hover:underline">
          All materials
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-4xl tracking-tight">{material.name}</h1>
          <Badge variant="secondary">{material.type}</Badge>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          On hand <Qty value={onHand} unit={material.unit} />
          {material.size ? ` · size ${material.size}` : ""}
          {material.color ? ` · ${material.color}` : ""}
        </p>
      </div>
      <Notice notice={one(query.notice)} error={one(query.error)} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Record a movement</CardTitle>
            <CardDescription>
              Purchases and receipts add stock. An adjustment can be negative. Marking an order built is what consumes materials.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={recordMovement} className="grid gap-3">
              <input type="hidden" name="materialId" value={material.id} />
              <Field label="Kind">
                <NativeSelect name="type" defaultValue="purchase">
                  <option value="purchase">Purchase</option>
                  <option value="receive">Receipt</option>
                  <option value="adjustment">Adjustment</option>
                </NativeSelect>
              </Field>
              <Field label="Quantity" hint="Use a negative number only for an adjustment.">
                <Input name="quantity" inputMode="decimal" required placeholder="How many" />
              </Field>
              <Field label="Note">
                <Input name="note" placeholder="Received from the blank supplier" />
              </Field>
              <Button type="submit">Add to the ledger</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
            <CardDescription>Changing these fields does not move inventory.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <form action={updateMaterial} className="grid gap-3">
              <input type="hidden" name="id" value={material.id} />
              <Field label="Name">
                <Input name="name" required defaultValue={material.name} />
              </Field>
              <Field label="Type">
                <NativeSelect name="type" defaultValue={material.type}>
                  {materialTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Size">
                  <Input name="size" defaultValue={material.size ?? ""} />
                </Field>
                <Field label="Color">
                  <Input name="color" defaultValue={material.color ?? ""} />
                </Field>
              </div>
              <Field label="Unit">
                <Input name="unit" required defaultValue={material.unit} />
              </Field>
              <Field label="Notes">
                <Textarea name="notes" rows={3} defaultValue={material.notes ?? ""} />
              </Field>
              <Button type="submit" variant="outline">
                Save details
              </Button>
            </form>
            <form action={deleteMaterial}>
              <input type="hidden" name="id" value={material.id} />
              <Button type="submit" variant="destructive">
                Delete material
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ledger</CardTitle>
          <CardDescription>Newest first. The balance is on hand after that movement.</CardDescription>
        </CardHeader>
        <CardContent>
          {withBalance.length === 0 ? (
            <p className="text-sm text-muted-foreground">No movements yet. On hand is zero.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead className="text-right">Change</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...withBalance].reverse().map((movement) => (
                  <TableRow key={movement.id}>
                    <TableCell>{formatWhen(movement.createdAt)}</TableCell>
                    <TableCell>{movement.type}</TableCell>
                    <TableCell className="text-right">
                      <Qty value={movement.quantity} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Qty value={movement.balance} />
                    </TableCell>
                    <TableCell className="max-w-md text-muted-foreground">{movement.note ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
