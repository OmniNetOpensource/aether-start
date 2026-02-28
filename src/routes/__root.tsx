import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Sentry } from "@/lib/sentry";

import { setNavigate } from "@/lib/navigation";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ToastContainer } from "@/components/ui/toast-container";
import { ResponsiveProvider } from "@/components/ResponsiveContext";
import { NotFound } from "@/routes/-not-found";

import appCss from "@/routes/globals.css?url";
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
  const navigate = useNavigate();

  useEffect(() => {
    setNavigate((path) => navigate({ to: path }));
  }, [navigate]);

  return (
    <Sentry.ErrorBoundary
      fallback={({ error, resetError }) => (
        <div className="flex h-screen items-center justify-center">
          <div className="text-center space-y-4">
            <h1 className="text-2xl font-semibold">出了点问题</h1>
            <p className="text-muted-foreground text-sm">
              {error instanceof Error ? error.message : '发生了未知错误'}
            </p>
            <button
              type="button"
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm"
              onClick={resetError}
            >
              重试
            </button>
          </div>
        </div>
      )}
    >
      <Outlet />
    </Sentry.ErrorBoundary>
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning={true}>
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {import.meta.env.DEV && (
          <script src="https://unpkg.com/react-scan/dist/auto.global.js" />
        )}
      </head>
      <body className="antialiased">
        <ResponsiveProvider initialDeviceType="desktop">
          <TooltipProvider>
            {children}
            <ToastContainer />
          </TooltipProvider>
        </ResponsiveProvider>
        <Scripts />
      </body>
    </html>
  );
}
