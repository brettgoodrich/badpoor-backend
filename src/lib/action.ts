import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export function refreshShop() {
  revalidatePath("/", "layout");
}

export function redirectWith(path: string, kind: "notice" | "error", message: string): never {
  const params = new URLSearchParams({ [kind]: message });
  redirect(`${path}?${params.toString()}`);
}

export function isSqliteConstraint(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    String((error as { code?: string }).code).includes("CONSTRAINT")
  );
}
