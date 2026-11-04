import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as Tooltip from '@radix-ui/react-tooltip';
import { App } from './App';
import { I18nProvider } from './i18n';
import { ThemeProvider } from './app/theme';
import { ToastProvider, ConfirmProvider } from './components/overlay';
import { AuthProvider } from './auth/AuthProvider';
import { ApiError } from './api/errors';
import { config } from './config';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/experience.css';
import './styles/g2.css';
import './lib/install'; // catches the browser's install prompt as early as possible

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      // Reads already retry once inside call(); don't stack more retries on a slow Apps Script.
      retry: (n, e) => n < 1 && !(e instanceof ApiError && ['SESSION_EXPIRED', 'FORBIDDEN', 'APP_ERROR', 'UNKNOWN_FUNCTION'].includes(e.code)),
      refetchOnWindowFocus: true,
      staleTime: 20_000
    },
    mutations: { retry: false }
  }
});

const Router = config.router === 'hash' ? HashRouter : BrowserRouter;
const basename = config.router === 'hash' ? undefined : config.basePath.replace(/\/$/, '') || undefined;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <I18nProvider>
        <ThemeProvider>
          <Tooltip.Provider delayDuration={300}>
            <ToastProvider>
              <ConfirmProvider>
                <Router basename={basename}>
                  <AuthProvider>
                    <App />
                  </AuthProvider>
                </Router>
              </ConfirmProvider>
            </ToastProvider>
          </Tooltip.Provider>
        </ThemeProvider>
      </I18nProvider>
    </QueryClientProvider>
  </React.StrictMode>
);

// Installed app / offline. A new version waits; the shell shows «حدّث» (event mg-update) and applies it on tap.
// Demo builds never use a service worker; drop any stale one (and its caches) so a redeploy always shows the new app.
if (config.mock) {
  const tag = document.createElement('div');
  tag.textContent = 'demo build ' + __BUILD_ID__;
  tag.setAttribute('aria-hidden', 'true');
  tag.style.cssText = 'position:fixed;top:2px;left:50%;transform:translateX(-50%);font:10px/1 monospace;opacity:.45;pointer-events:none;z-index:2147483000;direction:ltr';
  document.body.appendChild(tag);
}
if (config.mock) {
  if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => { r.unregister().catch(() => {}); })).catch(() => {});
  if ('caches' in window) caches.keys().then((ks) => ks.forEach((k) => { caches.delete(k).catch(() => {}); })).catch(() => {});
}
if ('serviceWorker' in navigator && import.meta.env.PROD && !config.mock) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(config.basePath + 'sw.js').then((reg) => {
      const ready = () => window.dispatchEvent(new Event('mg-update'));
      if (reg.waiting && navigator.serviceWorker.controller) ready();
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) ready(); });
      });
      // An installed app can stay open for days: look for a new version every 30 minutes.
      setInterval(() => { reg.update().catch(() => {}); }, 30 * 60000);
    }).catch(() => {});
  });
  // Reload only when an update replaces a running version (after «حدّث»), never on the very first install.
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloading) { reloading = true; location.reload(); } });
}
