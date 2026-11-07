import Link from "next/link";
import { cn } from "cn";

/** One real link that fills the card, with hover and focus on the whole surface. */
export function CardLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group/card flex flex-col gap-1 rounded-xl bg-card px-4 py-3 text-sm text-card-foreground ring-1 ring-foreground/10 outline-none transition-colors hover:bg-muted/70 focus-visible:ring-3 focus-visible:ring-ring",
        className,
      )}
    >
      {children}
    </Link>
  );
}
