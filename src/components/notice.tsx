import { cn } from "cn";

export function Notice({ notice, error }: { notice?: string; error?: string }) {
  if (!notice && !error) return null;
  const problem = Boolean(error);
  return (
    <p
      className={cn(
        "rounded-lg border px-3 py-2 text-sm",
        problem ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-primary/25 bg-primary/10",
      )}
      role={problem ? "alert" : "status"}
    >
      {error ?? notice}
    </p>
  );
}
