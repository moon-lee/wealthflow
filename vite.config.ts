import { defineConfig } from 'vite';
export default defineConfig({
  root: '.',
  server: {
    port: 5173,
    open: true,
    proxy: {
      // The price endpoints send no Access-Control-Allow-Origin, so a browser
      // cannot read them at all. The real app never asks it to: the fetch
      // runs in the host process, which is plain Node and has no such rule.
      //
      // The dev harness is a PAGE, so it needs the same-origin hop these
      // routes provide. index.html points the price service at them.
      '/proxy/asx': {
        target: 'https://asx.api.markitdigital.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/proxy\/asx/, ''),
      },
      '/proxy/yahoo': {
        target: 'https://query1.finance.yahoo.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/proxy\/yahoo/, ''),
      },
    },
  },
  resolve: {
    alias: {
      finance: '/src/mock/finance-mock.ts',
      'finance-logger': '/src/vendor/logger.ts',
    },
  },
});
