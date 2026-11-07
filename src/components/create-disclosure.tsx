"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function FormToggles({
  forms,
}: {
  forms: { label: string; content: React.ReactNode }[];
}) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="grid gap-3">
      <div className="flex justify-end gap-2">
        {forms.map((form) => (
          <Button
            key={form.label}
            type="button"
            variant="outline"
            size="icon"
            aria-label={form.label}
            title={form.label}
            aria-expanded={open === form.label}
            onClick={() => setOpen((current) => (current === form.label ? null : form.label))}
          >
            <Plus className={open === form.label ? "rotate-45 transition-transform" : "transition-transform"} />
          </Button>
        ))}
      </div>
      {forms.map((form) =>
        open === form.label ? (
          <div key={form.label} className="grid gap-3">
            {form.content}
            <Button type="button" variant="ghost" className="w-fit" onClick={() => setOpen(null)}>
              Cancel
            </Button>
          </div>
        ) : null,
      )}
    </div>
  );
}

export function CreateDisclosure({
  label,
  heading,
  children,
}: {
  label: string;
  heading: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">{heading}</div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="shrink-0"
          aria-label={label}
          title={label}
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          <Plus className={open ? "rotate-45 transition-transform" : "transition-transform"} />
        </Button>
      </div>
      {open ? (
        <div className="grid gap-3">
          {children}
          <Button type="button" variant="ghost" className="w-fit" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      ) : null}
    </div>
  );
}
