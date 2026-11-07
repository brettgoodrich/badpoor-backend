"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/native-select";

type MaterialOption = { id: string; name: string; unit: string };
type Line = { materialId: string; quantity: string };

export function RecipeLinesForm({
  action,
  materials,
  initialLines,
  submitLabel,
  children,
}: {
  action: (formData: FormData) => void | Promise<void>;
  materials: MaterialOption[];
  initialLines: { materialId: string; quantity: number }[];
  submitLabel: string;
  children?: React.ReactNode;
}) {
  const [lines, setLines] = useState<Line[]>(
    initialLines.length > 0
      ? initialLines.map((line) => ({ materialId: line.materialId, quantity: String(line.quantity) }))
      : [{ materialId: materials[0]?.id ?? "", quantity: "1" }],
  );

  return (
    <form action={action} className="grid gap-4">
      {children}
      <input type="hidden" name="lines" value={JSON.stringify(lines)} />
      <div className="grid gap-2">
        {lines.map((line, index) => (
          <div key={index} className="grid gap-2 sm:grid-cols-[1fr_7rem_auto]">
            <NativeSelect
              aria-label={`Material ${index + 1}`}
              value={line.materialId}
              onChange={(event) => {
                const next = [...lines];
                next[index] = { ...line, materialId: event.target.value };
                setLines(next);
              }}
            >
              <option value="">Choose a material</option>
              {materials.map((material) => (
                <option key={material.id} value={material.id}>
                  {material.name} ({material.unit})
                </option>
              ))}
            </NativeSelect>
            <Input
              aria-label={`Quantity ${index + 1}`}
              inputMode="decimal"
              value={line.quantity}
              onChange={(event) => {
                const next = [...lines];
                next[index] = { ...line, quantity: event.target.value };
                setLines(next);
              }}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => setLines(lines.filter((_, lineIndex) => lineIndex !== index))}
              disabled={lines.length === 1}
            >
              Remove
            </Button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => setLines([...lines, { materialId: materials[0]?.id ?? "", quantity: "1" }])}
        >
          Add material
        </Button>
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  );
}
