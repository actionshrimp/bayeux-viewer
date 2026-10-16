import { defineConfig, type Plugin } from 'vite';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Dev-only endpoints for the review tool: GET/POST /__data/<name> reads/writes src/data/<name>.json. */
function dataEndpoint(): Plugin {
  const allowed = new Set(['horses', 'figures', 'penises']);
  // Files we just wrote ourselves: swallow the resulting HMR update, otherwise Vite
  // full-reloads every open page (the review tool included) on each save.
  const justWritten = new Map<string, number>();
  return {
    name: 'bayeux-data-endpoint',
    apply: 'serve',
    handleHotUpdate({ file }) {
      const t = justWritten.get(file);
      if (t && Date.now() - t < 2000) return [];
    },
    configureServer(server) {
      server.middlewares.use('/__data', (req, res) => {
        const name = (req.url ?? '').replace(/^\//, '').split('?')[0];
        if (!allowed.has(name)) { res.statusCode = 404; res.end('unknown data file'); return; }
        const file = resolve(__dirname, 'src/data', `${name}.json`);
        // The file's mtime is its version: a save must name the version it was based on,
        // so a stale tab can't overwrite changes made on disk since it loaded.
        const version = () => String(Math.floor(statSync(file).mtimeMs));
        if (req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('X-Data-Version', version());
          res.end(readFileSync(file));
          return;
        }
        if (req.method === 'POST') {
          let body = '';
          req.on('data', (c) => { body += c; });
          req.on('end', () => {
            if (req.headers['x-data-version'] !== version()) {
              res.statusCode = 409;
              res.end('The data file changed on disk since this page loaded. Reload the page to get the latest version.');
              return;
            }
            try {
              const data = JSON.parse(body);
              justWritten.set(file, Date.now());
              writeFileSync(file, JSON.stringify(data, null, 1) + '\n');
              res.setHeader('X-Data-Version', version());
              res.end('saved');
            } catch (e) {
              res.statusCode = 400;
              res.end(String(e));
            }
          });
          return;
        }
        res.statusCode = 405;
        res.end();
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [dataEndpoint()],
  server: { host: true, port: 5180, watch: { ignored: ['**/annotate/**'] } },
  preview: { host: true, port: 5180 },
  build: { chunkSizeWarningLimit: 1500 },
});
