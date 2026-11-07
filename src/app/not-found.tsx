import Link from "next/link";
import { cn } from "cn";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="grid gap-3">
      <h1 className="font-heading text-3xl">That page is not on the bench</h1>
      <p className="text-sm text-muted-foreground">The material, recipe, or order is not in the local database.</p>
      <Link href="/" className={cn(buttonVariants(), "w-fit")}>
        Back to the dashboard
      </Link>
    </div>
  );
}
