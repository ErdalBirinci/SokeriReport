import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'none'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

export default defineConfig({
  base: '/SokeriReport/',
  plugins: [
    react(),
    {
      name: 'inject-csp',
      apply: 'build',
      transformIndexHtml(html) {
        return {
          html,
          tags: [
            {
              tag: 'meta',
              attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP },
              injectTo: 'head-prepend',
            },
          ],
        };
      },
    },
  ],
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
});
