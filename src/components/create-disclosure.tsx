"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

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
