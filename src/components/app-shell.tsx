import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/materials", label: "Materials" },
  { href: "/recipes", label: "Recipes" },
  { href: "/orders", label: "Orders" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full">
      <header className="border-b border-border bg-card/90">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/" className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-lg bg-primary font-heading text-lg text-primary-foreground">
              B
            </span>
            <span>
              <span className="block font-heading text-xl leading-none tracking-tight">Bench</span>
              <span className="mt-1 block text-xs text-muted-foreground">HZN Gym Uniforms · raw materials</span>
            </span>
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <nav className="flex flex-wrap gap-1 text-sm">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded-lg px-3 py-1.5 text-foreground/80 hover:bg-muted hover:text-foreground"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
