import { useMountEffect } from '@/hooks/useMountEffect';
import { HeadContent, Outlet, Scripts, createRootRoute, redirect } from '@tanstack/react-router';
import { AppErrorBoundary } from '@/shared/components/AppErrorBoundary';
import { reportClientError } from '@/lib/report-client-error';

import { useViewportHeight } from '@/hooks/useViewportHeight';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ToastContainer } from '@/components/ui/toast-container';
import { ResponsiveProvider } from '@/components/ResponsiveContext';
import { NotFound } from '@/routes/-not-found';
import { getTheme } from '@/server/functions/theme';
import { getSessionStateFn } from '@/server/functions/auth/session-state';

import appCss from '@/routes/globals.css?url';

const PROTECTED_PREFIXES = ['/app', '/note'];

export const Route = createRootRoute({
  beforeLoad: async ({ location }) => {
    const needsAuth = PROTECTED_PREFIXES.some((p) => location.pathname.startsWith(p));
    if (!needsAuth) {
      return;
    }

    const sessionState = await getSessionStateFn();
    if (sessionState.isAuthenticated) {
      return;
    }

    const hashSuffix = location.hash ? `#${location.hash}` : '';
    const target = `${location.pathname}${location.searchStr}${hashSuffix}`;
    throw redirect({
      href: `/auth/login?redirect=${encodeURIComponent(target)}`,
    });
  },
  loader: () => getTheme(),
  component: RootComponent,
  head: () => ({
    meta: [
      { name: 'description', content: 'The invisible medium of knowledge.' },
      {
        name: 'theme-color',
        content: '#ffffff',
        media: '(prefers-color-scheme: light)',
      },
      {
        name: 'theme-color',
        content: '#000000',
        media: '(prefers-color-scheme: dark)',
      },
      { title: 'Aether' },
    ],
    links: [{ rel: 'apple-touch-icon', href: '/apple-touch-icon.png' }],
  }),
  notFoundComponent: NotFound,
  shellComponent: RootDocument,
});

function RootComponent() {
  useViewportHeight();

  useMountEffect(() => {
    const pageUrl = () => window.location.href;

    const onWindowError = (event: ErrorEvent) => {
      const href = pageUrl();
      const thrown = event.error;
      if (thrown instanceof Error) {
        reportClientError({
          kind: 'window-error',
          message: thrown.message,
          pageUrl: href,
          errorName: thrown.name,
          stack: thrown.stack,
          source: event.filename || undefined,
          line: Number.isFinite(event.lineno) ? event.lineno : undefined,
          column: Number.isFinite(event.colno) ? event.colno : undefined,
        });
        return;
      }
      const fallbackMessage =
        typeof event.message === 'string' && event.message.trim().length > 0
          ? event.message
          : 'Unknown error';
      reportClientError({
        kind: 'window-error',
        message: fallbackMessage,
        pageUrl: href,
        source: event.filename || undefined,
        line: Number.isFinite(event.lineno) ? event.lineno : undefined,
        column: Number.isFinite(event.colno) ? event.colno : undefined,
      });
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const href = pageUrl();
      const reason = event.reason;
      if (reason instanceof Error) {
        reportClientError({
          kind: 'unhandledrejection',
          message: reason.message,
          pageUrl: href,
          errorName: reason.name,
          stack: reason.stack,
        });
        return;
      }
      const message =
        typeof reason === 'string' && reason.trim().length > 0 ? reason : 'Unhandled rejection';
      reportClientError({
        kind: 'unhandledrejection',
        message,
        pageUrl: href,
        detail: reason,
      });
    };

    window.addEventListener('error', onWindowError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);
    return () => {
      window.removeEventListener('error', onWindowError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  });

  return (
    <AppErrorBoundary>
      <Outlet />
    </AppErrorBoundary>
  );
}

const themeInitScript = `(function(){var t=localStorage.getItem('theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}if(t==='dark'){document.documentElement.classList.add('dark');}})();`;

const preHydrationInputScript = `(function(){var k='aether_composer_draft';var v=localStorage.getItem(k);window.__preHydrationInput=v===null?'':v;window.__preHydrationInputHandler=function(e){if(e.target&&e.target.id==='message-input'){window.__preHydrationInput=e.target.value;}};document.addEventListener('input',window.__preHydrationInputHandler);})();`;

function RootDocument({ children }: { children: React.ReactNode }) {
  const theme = Route.useLoaderData();
  return (
    <html lang='en' className={theme === 'dark' ? 'dark' : ''}>
      <head>
        {import.meta.env.DEV && (
          <script crossOrigin='anonymous' src='https://unpkg.com/react-scan/dist/auto.global.js' />
        )}
        <meta charSet='utf-8' />
        <meta
          name='viewport'
          content='width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no'
        />
        <link rel='stylesheet' href={appCss} />
        <link rel='manifest' href='/manifest.webmanifest' />
        <link rel='icon' href='/aether-logo.svg' />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <script dangerouslySetInnerHTML={{ __html: preHydrationInputScript }} />
        <HeadContent />
      </head>
      <body>
        <ResponsiveProvider>
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
