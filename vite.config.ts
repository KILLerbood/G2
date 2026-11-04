import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { copyFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

/** Production-only: Content-Security-Policy meta (NFR-22) and a 404.html copy so deep links work on GitHub Pages. */
function prodHtml(): Plugin {
  return {
    name: 'magmafy-prod-html',
    apply: 'build',
    transformIndexHtml(html) {
      // The tiny inline theme script is allowed by its hash; nothing else inline runs.
      const inline = html.match(/<script>([\s\S]*?)<\/script>/);
      const hash = inline ? "'sha256-" + createHash('sha256').update(inline[1]).digest('base64') + "'" : '';
      const csp = [
        "default-src 'self'",
        "script-src 'self' " + hash,
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "frame-src blob:",
        "media-src blob:",
        "font-src 'self'",
        "connect-src 'self' https://script.google.com https://script.googleusercontent.com",
        "worker-src 'self'",
        "manifest-src 'self'",
        "base-uri 'self'",
        "form-action 'self'",
        "object-src 'none'"
      ].join('; ');
      return html.replace('<meta charset="UTF-8" />', '<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="' + csp + '" />');
    },
    closeBundle() {
      const dist = resolve(__dirname, 'dist');
      if (existsSync(dist + '/index.html')) copyFileSync(dist + '/index.html', dist + '/404.html');
      // The service worker learns this build's files (for offline) and a version (so updates are detected).
      const sw = dist + '/sw.js';
      if (existsSync(sw)) {
        const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(dir + '/' + d.name) : [dir + '/' + d.name]));
        const files = walk(dist).map((f) => f.slice(dist.length + 1))
          .filter((f) => !/^(sw\.js|404\.html|index\.html|robots\.txt|og-wordmark\.jpg|icon-512\.png|icon-maskable-512\.png)$/.test(f));
        const version = createHash('sha256').update(files.join('|')).digest('hex').slice(0, 10);
        const src = readFileSync(sw, 'utf8').replace("'__BUILD__'", JSON.stringify(version)).replace('[/*__PRECACHE__*/]', JSON.stringify(files.map((f) => './' + f)));
        writeFileSync(sw, src);
      }
    }
  };
}

export default defineConfig(({ mode }) => {
  // «mock» mode needs no .env file: its defaults live here (an .env.mock can still override them).
  const mockDefaults: Record<string, string> = mode === 'mock' ? { VITE_MOCK: '1', VITE_ROUTER: 'hash', VITE_BASE_PATH: './' } : {};
  const env = { ...mockDefaults, ...loadEnv(mode, process.cwd(), '') };
  for (const [k, v] of Object.entries(mockDefaults)) if (!(k in process.env)) process.env[k] = env[k] ?? v;
  return {
    base: env.VITE_BASE_PATH || '/',
    define: { __BUILD_ID__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ')) },
    plugins: [react(), prodHtml()],
    build: {
      target: 'es2020',
      sourcemap: false,
      chunkSizeWarningLimit: 700,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            query: ['@tanstack/react-query', 'zod'],
            radix: ['@radix-ui/react-dialog', '@radix-ui/react-popover', '@radix-ui/react-tooltip', '@radix-ui/react-dropdown-menu'],
            three: ['three']
          }
        }
      }
    }
  };
});
