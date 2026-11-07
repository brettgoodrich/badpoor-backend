import { cn } from "cn";
import { formatQty } from "@/lib/format";

export function Qty({ value, unit }: { value: number; unit?: string | null }) {
  return (
    <span className={cn("tabular-nums", value < 0 && "font-medium text-destructive")}>
      {formatQty(value)}
      {unit ? <span className="ml-1 text-muted-foreground">{unit}</span> : null}
    </span>
  );
}
