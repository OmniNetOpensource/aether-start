import { useMountEffect } from '@/shared/app-shell/useMountEffect';
import { HeadContent, Outlet, Scripts, createRootRoute, redirect } from '@tanstack/react-router';
import { AppErrorBoundary } from '@/shared/app-shell/AppErrorBoundary';
import { reportClientError } from '@/shared/browser/report-client-error';

import { useViewportHeight } from '@/shared/app-shell/useViewportHeight';
import { TooltipProvider } from '@/shared/design-system/tooltip';
import { ToastContainer } from '@/shared/app-shell/toast-container';
import { ResponsiveProvider } from '@/shared/app-shell/ResponsiveContext';
import { NotFound } from '@/routes/-not-found';
import { getTheme } from '@/shared/app-shell/theme';
import { getSessionStateFn } from '@/features/auth/session';

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

const themeInitScript = `(function(){var t=localStorage.getItem('theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}var cl=document.documentElement.classList;if(t==='dark'||t==='nord')cl.add('dark');if(t==='nord'||t==='morandi')cl.add(t);})();`;

const preHydrationInputScript = `(function(){var k='aether_composer_draft';var v=localStorage.getItem(k);window.__preHydrationInput=v===null?'':v;window.__preHydrationInputHandler=function(e){if(e.target&&e.target.id==='message-input'){window.__preHydrationInput=e.target.value;}};document.addEventListener('input',window.__preHydrationInputHandler);function inject(){var el=document.getElementById('message-input');if(el&&window.__preHydrationInput){el.value=window.__preHydrationInput;}}if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',inject);}else{inject();}})();`;

function RootDocument({ children }: { children: React.ReactNode }) {
  const theme = Route.useLoaderData();
  return (
    <html
      lang='en'
      className={[
        theme === 'dark' || theme === 'nord' ? 'dark' : '',
        theme === 'nord' || theme === 'morandi' ? theme : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <head>
        {import.meta.env.DEV && (
          <script crossOrigin='anonymous' src='https://unpkg.com/react-scan/dist/auto.global.js' />
        )}
        <meta charSet='utf-8' />
        <meta name='viewport' content='width=device-width, initial-scale=1' />
        <link rel='preconnect' href='https://fonts.googleapis.com' />
        <link rel='preconnect' href='https://fonts.gstatic.com' crossOrigin='' />
        <link
          rel='stylesheet'
          href='https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;500;600;700&display=swap'
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
