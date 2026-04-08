import { HeadContent, Outlet, Scripts, createRootRoute, redirect } from '@tanstack/react-router';
import { AppErrorBoundary } from '@/shared/app-shell/AppErrorBoundary';

import { useViewportHeight } from '@/shared/app-shell/useViewportHeight';
import { TooltipProvider } from '@/shared/design-system/tooltip';
import { ToastContainer } from '@/shared/app-shell/toast-container';
import { ResponsiveProvider } from '@/shared/app-shell/ResponsiveContext';
import { NotFound } from '@/routes/-not-found';
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

  return (
    <AppErrorBoundary>
      <Outlet />
    </AppErrorBoundary>
  );
}

const themeInitScript = `(function(){var t=localStorage.getItem('theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}var cl=document.documentElement.classList;if(t==='dark'||t==='nord')cl.add('dark');if(t==='nord'||t==='morandi')cl.add(t);})();`;

const globalErrorScript = `(function(){var shown=false;function esc(s){var d=document.createElement('div');d.textContent=s;return d.innerHTML;}function show(msg){if(shown)return;shown=true;var dk=document.documentElement.classList.contains('dark');var o=document.createElement('div');o.setAttribute('role','alert');o.style.cssText='position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);font-family:system-ui,-apple-system,sans-serif;';var bg=dk?'#18181b':'#fff';var fg=dk?'#e4e4e7':'#09090b';var mt=dk?'#a1a1aa':'#71717a';var pb=dk?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.04)';var bb=dk?'#e4e4e7':'#18181b';var bf=dk?'#18181b':'#fff';o.innerHTML='<div style="background:'+bg+';border-radius:12px;padding:32px 32px 28px;max-width:420px;width:calc(100% - 48px);box-shadow:0 8px 32px rgba(0,0,0,0.18);"><p style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.22em;color:'+mt+';">Something went wrong</p><h1 style="margin:16px 0 0;font-size:22px;font-weight:600;color:'+fg+';">出现错误</h1><p style="margin:8px 0 0;font-size:14px;line-height:1.6;color:'+mt+';">页面加载时发生意外错误，请刷新页面重试。</p><pre style="margin:16px 0 0;max-height:160px;overflow:auto;padding:10px 12px;border-radius:6px;background:'+pb+';font-size:12px;line-height:1.5;white-space:pre-wrap;word-break:break-all;color:'+fg+';">'+esc(msg)+'</pre><button onclick="location.reload()" style="margin:24px 0 0;width:100%;padding:10px 0;border:none;border-radius:8px;background:'+bb+';color:'+bf+';font-size:14px;font-weight:500;cursor:pointer;">重新加载</button></div>';(document.body||document.documentElement).appendChild(o);}function report(p){try{navigator.sendBeacon('/api/client-errors',new Blob([JSON.stringify(p)],{type:'application/json'}));}catch(e)}window.addEventListener('error',function(e){var err=e.error;var msg=(err&&err.message)||e.message||'Unknown error';var p={kind:'window-error',message:msg,pageUrl:location.href};if(err){if(err.name)p.errorName=err.name;if(err.stack)p.stack=err.stack;}if(e.filename)p.source=e.filename;report(p);show(msg);});window.addEventListener('unhandledrejection',function(e){var r=e.reason;var msg=(r instanceof Error)?r.message:(typeof r==='string'&&r?r:'Unhandled rejection');var p={kind:'unhandledrejection',message:msg,pageUrl:location.href};if(r instanceof Error){if(r.name)p.errorName=r.name;if(r.stack)p.stack=r.stack;}report(p);show(msg);});})();`;

const preHydrationInputScript = `(function(){var k='aether_composer_draft';var v=localStorage.getItem(k);window.__preHydrationInput=v===null?'':v;window.__preHydrationInputHandler=function(e){if(e.target&&e.target.id==='message-input'){window.__preHydrationInput=e.target.value;}};document.addEventListener('input',window.__preHydrationInputHandler);function inject(){var el=document.getElementById('message-input');if(el&&window.__preHydrationInput){el.value=window.__preHydrationInput;}}if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',inject);}else{inject();}})();`;

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang='en' suppressHydrationWarning>
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
          href='https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;500;600;700&display=optional'
        />
        <link rel='stylesheet' href={appCss} />
        <link rel='manifest' href='/manifest.webmanifest' />
        <link rel='icon' href='/aether-logo.svg' />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <script dangerouslySetInnerHTML={{ __html: globalErrorScript }} />
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
