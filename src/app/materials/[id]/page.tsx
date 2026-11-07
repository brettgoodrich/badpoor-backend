import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
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
import { formatWhen, one } from "@/lib/format";
import { loadShop } from "@/lib/inventory/load";
import {
  addAxisValues,
  deleteMaterial,
  recordBulkMovement,
  recordMovement,
  removeAxisValue,
  updateMaterial,
} from "@/server/actions/materials";

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
  const shop = await loadShop();
  const material = shop.materialRows.find((entry) => entry.id === id);
  if (!material) notFound();

  return (
    <>
      <div>
        <Link href="/materials" className="text-sm text-muted-foreground hover:underline">
          All materials
        </Link>
        <h1 className="mt-2 font-heading text-4xl tracking-tight">{material.name}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {material.type}
          {material.brand ? ` · ${material.brand}` : ""}
          {material.styleNumber ? ` · style ${material.styleNumber}` : ""}
          {material.ssStyleId ? ` · S&S ${material.ssStyleId}` : ""}
        </p>
      </div>
      <Notice notice={one(query.notice)} error={one(query.error)} />
      {material.type === "blank" ? (
        <BlankModel materialId={material.id} shop={shop} />
      ) : (
        <SimpleMaterial materialId={material.id} shop={shop} />
      )}
    </>
  );
}

function BlankModel({
  materialId,
  shop,
}: {
  materialId: string;
  shop: Awaited<ReturnType<typeof loadShop>>;
}) {
  const material = shop.materialRows.find((entry) => entry.id === materialId);
  if (!material) return null;
  const sizes = shop.optionRows
    .filter((option) => option.materialId === materialId && option.axis === "size" && !option.archivedAt)
    .sort((a, b) => a.position - b.position);
  const colors = shop.optionRows
    .filter((option) => option.materialId === materialId && option.axis === "color" && !option.archivedAt)
    .sort((a, b) => a.position - b.position);
  const variants = shop.blankVariantRows.filter((variant) => variant.materialId === materialId);
  const needById = new Map(shop.report.needs.map((row) => [row.materialId, row]));

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Stock grid</CardTitle>
          <CardDescription>Sizes across, colors down. Each cell is on hand, then what open orders still need.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className="border-b border-border p-2 text-left font-medium text-muted-foreground">Color</th>
                {sizes.map((size) => (
                  <th key={size.id} className="border-b border-border p-2 text-center font-medium">
                    <div>{size.value}</div>
                    <form action={removeAxisValue}>
                      <input type="hidden" name="materialId" value={materialId} />
                      <input type="hidden" name="axis" value="size" />
                      <input type="hidden" name="value" value={size.value} />
                      <button type="submit" className="text-xs font-normal text-muted-foreground hover:text-destructive">
                        Remove
                      </button>
                    </form>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {colors.map((color) => (
                <tr key={color.id}>
                  <th className="border-b border-border p-2 text-left font-medium">
                    {color.value}
                    <form action={removeAxisValue}>
                      <input type="hidden" name="materialId" value={materialId} />
                      <input type="hidden" name="axis" value="color" />
                      <input type="hidden" name="value" value={color.value} />
                      <button type="submit" className="text-xs font-normal text-muted-foreground hover:text-destructive">
                        Remove
                      </button>
                    </form>
                  </th>
                  {sizes.map((size) => {
                    const variant = variants.find(
                      (entry) => entry.size === size.value && entry.color === color.value && !entry.archivedAt,
                    );
                    const onHand = variant ? (shop.report.onHand.get(variant.id) ?? 0) : 0;
                    const need = variant ? needById.get(variant.id) : undefined;
                    return (
                      <td key={size.id} className="border-b border-border p-2 text-center align-top">
                        {variant ? (
                          <>
                            <div className="font-medium">
                              <Qty value={onHand} />
                            </div>
                            <div className="text-xs text-muted-foreground">need {need?.demand ?? 0}</div>
                            {need && need.shortfall > 0 ? (
                              <div className="text-xs font-medium text-destructive">buy {need.shortfall}</div>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Receive or adjust</CardTitle>
            <CardDescription>Enter several sizes of one color at once. Blank sizes are skipped.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={recordBulkMovement} className="grid gap-4">
              <input type="hidden" name="materialId" value={materialId} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Color">
                  <NativeSelect name="color" defaultValue={colors[0]?.value ?? ""}>
                    {colors.map((color) => (
                      <option key={color.id} value={color.value}>
                        {color.value}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label="Kind">
                  <NativeSelect name="type" defaultValue="receive">
                    <option value="receive">Receipt</option>
                    <option value="purchase">Purchase</option>
                    <option value="adjustment">Adjustment</option>
                  </NativeSelect>
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {sizes.map((size) => (
                  <Field key={size.id} label={size.value}>
                    <Input name={`qty:${size.value}`} inputMode="decimal" aria-label={`${size.value} quantity`} placeholder="0" />
                  </Field>
                ))}
              </div>
              <Field label="Note" hint="One note is stored on every size you fill in. Leave a size blank to skip it.">
                <Input name="note" placeholder="Received 12 S, 24 M, 12 L" />
              </Field>
              <Button type="submit" className="w-fit">
                Add to the ledger
              </Button>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Sizes and colors</CardTitle>
            <CardDescription>New values only create the missing cells. Removing a used size archives it.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <form action={addAxisValues} className="grid gap-3">
              <input type="hidden" name="materialId" value={materialId} />
              <input type="hidden" name="axis" value="size" />
              <Field label="Add sizes">
                <Input name="values" placeholder="XL, 2XL" />
              </Field>
              <Button type="submit" variant="outline">
                Add sizes
              </Button>
            </form>
            <form action={addAxisValues} className="grid gap-3">
              <input type="hidden" name="materialId" value={materialId} />
              <input type="hidden" name="axis" value="color" />
              <Field label="Add colors">
                <Input name="values" placeholder="Navy" />
              </Field>
              <Button type="submit" variant="outline">
                Add colors
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
      <DetailsCard material={material} series={shop.seriesRows} />
    </div>
  );
}

function SimpleMaterial({
  materialId,
  shop,
}: {
  materialId: string;
  shop: Awaited<ReturnType<typeof loadShop>>;
}) {
  const material = shop.materialRows.find((entry) => entry.id === materialId);
  if (!material) return null;
  const history = shop.movementRows.filter((movement) => movement.materialId === materialId && !movement.variantId);
  const withBalance = history.reduce<Array<(typeof history)[number] & { balance: number }>>((rows, movement) => {
    const previous = rows.length > 0 ? rows[rows.length - 1].balance : 0;
    return [...rows, { ...movement, balance: previous + movement.quantity }];
  }, []);

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>
            On hand <Qty value={shop.report.onHand.get(materialId) ?? 0} unit={material.unit} />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form action={recordMovement} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="materialId" value={materialId} />
            <Field label="Kind">
              <NativeSelect name="type" defaultValue="purchase">
                <option value="purchase">Purchase</option>
                <option value="receive">Receipt</option>
                <option value="adjustment">Adjustment</option>
              </NativeSelect>
            </Field>
            <Field label="Quantity">
              <Input name="quantity" inputMode="decimal" required placeholder="How many" />
            </Field>
            <Field label="Note">
              <Input name="note" />
            </Field>
            <div className="flex items-end">
              <Button type="submit">Add to the ledger</Button>
            </div>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Ledger</CardTitle>
        </CardHeader>
        <CardContent>
          {withBalance.length === 0 ? (
            <p className="text-sm text-muted-foreground">No movements yet.</p>
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
                    <TableCell className="text-muted-foreground">{movement.note ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <DetailsCard material={material} series={shop.seriesRows} />
    </div>
  );
}

function DetailsCard({
  material,
  series,
}: {
  material: {
    id: string;
    name: string;
    type: string;
    unit: string;
    notes: string | null;
    brand: string | null;
    styleNumber: string | null;
    ssStyleId: string | null;
    seriesId: string | null;
  };
  series: { id: string; name: string }[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Details</CardTitle>
        <CardDescription>S&S style id stays empty until that integration exists.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <form action={updateMaterial} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="id" value={material.id} />
          <Field label="Name">
            <Input name="name" required defaultValue={material.name} />
          </Field>
          <Field label="Unit">
            <Input name="unit" defaultValue={material.unit} />
          </Field>
          {material.type === "blank" ? (
            <>
              <Field label="Brand">
                <Input name="brand" defaultValue={material.brand ?? ""} />
              </Field>
              <Field label="Style number">
                <Input name="styleNumber" defaultValue={material.styleNumber ?? ""} />
              </Field>
              <Field label="S&S style id">
                <Input name="ssStyleId" defaultValue={material.ssStyleId ?? ""} placeholder="Later" />
              </Field>
            </>
          ) : null}
          {material.type === "print" ? (
            <Field label="Series">
              <NativeSelect name="seriesId" defaultValue={material.seriesId ?? ""}>
                <option value="">No series</option>
                {series.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          ) : null}
          <Field label="Notes">
            <Textarea name="notes" rows={2} defaultValue={material.notes ?? ""} />
          </Field>
          <div className="flex items-end">
            <Button type="submit" variant="outline">
              Save details
            </Button>
          </div>
        </form>
        <form action={deleteMaterial}>
          <input type="hidden" name="id" value={material.id} />
          <Button type="submit" variant="destructive">
            Delete
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
