import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { useEffect } from "react";

import { TooltipProvider } from "@/components/ui/tooltip";
import { ToastContainer } from "@/components/ui/toast-container";
import { ResponsiveProvider } from "@/src/features/responsive/ResponsiveContext";
import { NotFound } from "@/src/app/-not-found";

import appCss from "@/src/app/globals.css?url";
import katexCss from "katex/dist/katex.min.css?url";

const THEME_INIT_SCRIPT = `(function () {
  try {
    var cookieMatch = document.cookie.match(/(?:^|; )theme=([^;]+)/);
    var cookieTheme = cookieMatch ? decodeURIComponent(cookieMatch[1]) : null;
    var ls = window.localStorage.getItem('theme');
    var stored = cookieTheme || ls;
    var m = window.matchMedia('(prefers-color-scheme: dark)');
    var dark = stored ? stored === 'dark' : m.matches;
    var c = document.documentElement.classList;
    dark ? c.add('dark') : c.remove('dark');
  } catch (e) {}
})();`;

export const Route = createRootRoute({
  component: RootComponent,
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no",
      },
      { name: "description", content: "The invisible medium of knowledge." },
      { name: "theme-color", content: "#ffffff", media: "(prefers-color-scheme: light)" },
      { name: "theme-color", content: "#000000", media: "(prefers-color-scheme: dark)" },
      { title: "Aether" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "stylesheet", href: katexCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", href: "/aether-logo.svg" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
    ],
  }),
  notFoundComponent: NotFound,
  shellComponent: RootDocument,
});

function RootComponent() {
  useEffect(() => {
    if (!import.meta.env.DEV) return;

    void import("react-scan").then(({ scan }) => {
      scan({ enabled: true });
    });
    void import("react-grab");
  }, []);

  return <Outlet />;
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning={true}>
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="antialiased kraft-texture">
        <ResponsiveProvider initialDeviceType="desktop">
          <TooltipProvider>
            {children}
            <ToastContainer />
          </TooltipProvider>
        </ResponsiveProvider>
        <div className="grain-overlay" aria-hidden="true" />
        <SpeedInsights />
        <Scripts />
      </body>
    </html>
  );
}
