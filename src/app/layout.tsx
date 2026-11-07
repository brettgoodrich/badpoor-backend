import type { Metadata } from "next";
import { Fraunces, Geist_Mono, Outfit } from "next/font/google";
import { AppShell } from "@/components/app-shell";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "Bench · HZN materials",
  description:
    "Raw-material inventory for HZN gym uniforms. Separate from the finished products sold on Shopify.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${outfit.variable} ${fraunces.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground">
        <script
          dangerouslySetInnerHTML={{
            __html: `document.addEventListener('click',function(event){var button=event.target&&event.target.closest&&event.target.closest('[data-theme-value]');if(!button)return;var value=button.getAttribute('data-theme-value');var dark=value==='dark'||(value==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var root=document.documentElement;root.classList.remove('light','dark');root.classList.add(dark?'dark':'light');root.style.colorScheme=dark?'dark':'light';try{localStorage.setItem('theme',value)}catch(e){}document.querySelectorAll('[data-theme-value]').forEach(function(el){el.setAttribute('aria-pressed',el.getAttribute('data-theme-value')===value?'true':'false')})});`,
          }}
        />
        <ThemeProvider>
          <AppShell>{children}</AppShell>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
