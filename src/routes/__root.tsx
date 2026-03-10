import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router";
import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Sentry } from "@/lib/sentry";

import { setNavigate } from "@/lib/navigation";
import { useViewportHeight } from "@/hooks/useViewportHeight";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ToastContainer } from "@/components/ui/toast-container";
import { ResponsiveProvider } from "@/components/ResponsiveContext";
import { NotFound } from "@/routes/-not-found";
import { getTheme } from "@/server/functions/theme";

import appCss from "@/routes/globals.css?url";

export const Route = createRootRoute({
  loader: () => getTheme(),
  component: RootComponent,
  head: () => ({
    meta: [
      { name: "description", content: "The invisible medium of knowledge." },
      {
        name: "theme-color",
        content: "#ffffff",
        media: "(prefers-color-scheme: light)",
      },
      {
        name: "theme-color",
        content: "#000000",
        media: "(prefers-color-scheme: dark)",
      },
      { title: "Aether" },
    ],
    links: [{ rel: "apple-touch-icon", href: "/apple-touch-icon.png" }],
  }),
  notFoundComponent: NotFound,
  shellComponent: RootDocument,
});

function RootComponent() {
  const navigate = useNavigate();
  useViewportHeight();

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
              {error instanceof Error ? error.message : "发生了未知错误"}
            </p>
            <button
              type="button"
              className="px-4 py-2 rounded-md bg-primary text-primary text-sm"
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

const themeInitScript = `(function(){var t=localStorage.getItem('theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}if(t==='dark'){document.documentElement.classList.add('dark');}})();`;

function RootDocument({ children }: { children: React.ReactNode }) {
  const theme = Route.useLoaderData();
  return (
    <html lang="en" className={theme === "dark" ? "dark" : ""}>
      <head>
        {import.meta.env.DEV && (
          <script
            crossOrigin="anonymous"
            src="https://unpkg.com/react-scan/dist/auto.global.js"
          />
        )}
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
        />
        <link rel="stylesheet" href={appCss} />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" href="/aether-logo.svg" />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <HeadContent />
      </head>
      <body>
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
