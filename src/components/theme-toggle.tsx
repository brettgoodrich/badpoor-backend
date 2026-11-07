"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { cn } from "cn";

const options = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

function subscribe(onStoreChange: () => void) {
  const id = window.setTimeout(onStoreChange, 0);
  return () => window.clearTimeout(id);
}

function useIsClient() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = useIsClient();
  const active = mounted ? theme : "system";

  return (
    <div
      role="group"
      aria-label="Color theme"
      className="inline-flex rounded-lg border border-border bg-muted p-0.5"
    >
      {options.map((option) => {
        const Icon = option.icon;
        const selected = active === option.value;
        return (
          <button
            key={option.value}
            type="button"
            data-theme-value={option.value}
            aria-pressed={selected}
            onClick={() => setTheme(option.value)}
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground aria-pressed:bg-primary aria-pressed:text-primary-foreground",
              selected && "bg-primary text-primary-foreground",
            )}
          >
            <Icon className="size-3.5" aria-hidden="true" />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
