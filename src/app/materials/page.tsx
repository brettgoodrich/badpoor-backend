import Link from "next/link";
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
import { one } from "@/lib/format";
import { loadShop } from "@/lib/inventory/load";
import { materialTypes } from "@/lib/db/schema";
import { createMaterial } from "@/server/actions/materials";

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
  const { materialRows, report } = await loadShop();

  return (
    <>
      <div>
        <h1 className="font-heading text-4xl tracking-tight">Materials</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Prints, blanks, and anything else a uniform consumes. On hand is not an editable number — record a purchase, receipt, or adjustment and the ledger keeps the history.
        </p>
      </div>
      <Notice notice={one(query.notice)} error={one(query.error)} />
      <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>New material</CardTitle>
            <CardDescription>Size and color help the recipe setup match blanks to variants.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createMaterial} className="grid gap-3">
              <Field label="Name">
                <Input name="name" required placeholder="Print A" />
              </Field>
              <Field label="Type">
                <NativeSelect name="type" defaultValue="blank">
                  {materialTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Size">
                  <Input name="size" placeholder="YOUTH S" />
                </Field>
                <Field label="Color">
                  <Input name="color" placeholder="Black" />
                </Field>
              </div>
              <Field label="Unit">
                <Input name="unit" defaultValue="each" required />
              </Field>
              <Field label="Notes">
                <Textarea name="notes" rows={3} />
              </Field>
              <Button type="submit">Add material</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>On hand</CardTitle>
            <CardDescription>{materialRows.length} materials in the local database.</CardDescription>
          </CardHeader>
          <CardContent>
            {materialRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No materials yet. Add one, or run npm run db:seed.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Color</TableHead>
                    <TableHead className="text-right">On hand</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {materialRows.map((material) => (
                    <TableRow key={material.id}>
                      <TableCell>
                        <Link href={`/materials/${material.id}`} className="font-medium hover:underline">
                          {material.name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{material.type}</Badge>
                      </TableCell>
                      <TableCell>{material.size ?? "—"}</TableCell>
                      <TableCell>{material.color ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <Qty value={report.onHand.get(material.id) ?? 0} unit={material.unit} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
