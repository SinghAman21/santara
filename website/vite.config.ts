import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { createReadStream, statSync } from 'node:fs';
import { resolve } from 'node:path';

const releases = resolve(import.meta.dirname, '../release');
const devDownloads: Plugin = {
  name: 'santara-local-downloads',
  configureServer(server) {
    server.middlewares.use('/downloads', (request, response, next) => {
      const fileName = decodeURIComponent(new URL(request.url || '/', 'http://localhost').pathname.slice(1));
      if (!['Santara-0.1.0-linux-amd64.deb', 'Santara-0.1.0-linux-x86_64.AppImage'].includes(fileName)) return next();
      const filePath = resolve(releases, fileName);
      try {
        const stats = statSync(filePath);
        response.statusCode = 200;
        response.setHeader('Content-Type', 'application/octet-stream');
        response.setHeader('Content-Length', stats.size);
        response.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        if (request.method === 'HEAD') return response.end();
        createReadStream(filePath).pipe(response);
      } catch {
        response.statusCode = 404;
        response.end('Installer not found');
      }
    });
  },
};

export default defineConfig({
  root: import.meta.dirname,
  plugins: [react(), tailwindcss(), devDownloads],
  server: { host: '127.0.0.1', fs: { allow: [resolve(import.meta.dirname, '..')] } },
  build: { outDir: 'dist', emptyOutDir: true },
});
