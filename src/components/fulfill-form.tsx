"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/field";
import { NativeSelect } from "@/components/native-select";

export function FulfillForm({
  action,
  lineItemId,
  orderId,
  remaining,
  finishedCover,
  blanks,
}: {
  action: (formData: FormData) => void | Promise<void>;
  lineItemId: string;
  orderId: string;
  remaining: number;
  finishedCover: number;
  blanks: { id: string; label: string }[];
}) {
  const [source, setSource] = useState(finishedCover > 0 ? "finished" : "build");
  const [quantity, setQuantity] = useState(String(finishedCover > 0 ? Math.min(remaining, finishedCover) : remaining));

  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="lineItemId" value={lineItemId} />
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="source" value={source} />
      <Field label="How" hint={finishedCover > 0 ? `${finishedCover} of this line can come from finished stock.` : "No finished stock is set aside for this line."}>
        <NativeSelect
          value={source}
          onChange={(event) => {
            const next = event.target.value === "finished" ? "finished" : "build";
            setSource(next);
            setQuantity(String(next === "finished" && finishedCover > 0 ? Math.min(remaining, finishedCover) : remaining));
          }}
        >
          <option value="finished">Use finished stock</option>
          <option value="build">Build now</option>
        </NativeSelect>
      </Field>
      <Field label="Quantity">
        <Input
          name="quantity"
          type="number"
          min={1}
          max={remaining}
          step={1}
          value={quantity}
          required
          className="w-28"
          onChange={(event) => setQuantity(event.target.value)}
        />
      </Field>
      {source === "build" && blanks.length > 0 ? (
        <Field label="Blank for this build" hint="Changes this build only. The recipe stays the same.">
          <NativeSelect name="blankVariantId" defaultValue={blanks[0]?.id ?? ""}>
            {blanks.map((blank) => (
              <option key={blank.id} value={blank.id}>
                {blank.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
      ) : null}
      <Button type="submit">{source === "finished" ? "Use stock" : "Mark built"}</Button>
    </form>
  );
}
