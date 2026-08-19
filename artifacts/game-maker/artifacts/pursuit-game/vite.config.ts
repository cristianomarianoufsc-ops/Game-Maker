import path from 'path';
import { promises as fs } from 'fs';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    'PORT environment variable is required but was not provided.',
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    'BASE_PATH environment variable is required but was not provided.',
  );
}

const levelPatchPath = path.resolve(import.meta.dirname, 'public', 'level-patch.json');
const levelPatchHistoryDir = path.resolve(import.meta.dirname, 'public', '.level-patch-history');
const gameSettingsPath = path.resolve(import.meta.dirname, 'public', 'game-settings.json');

function readRequestBody(req: import('http').IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 10_000_000) reject(new Error('request body too large'));
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function editorPersistencePlugin() {
  return {
    name: 'pursuit-editor-persistence',
    configureServer(server: { middlewares: { use: (path: string, handler: (req: any, res: any, next: () => void) => void) => void } }) {
      server.middlewares.use('/__editor/game-settings', async (req, res, next) => {
        if (req.method !== 'GET') return next();
        try {
          const settings = await fs.readFile(gameSettingsPath, 'utf8');
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(settings);
        } catch (error) {
          res.statusCode = 500;
          res.end(`settings read failed: ${error instanceof Error ? error.message : 'unknown error'}`);
        }
        return;
      });

      server.middlewares.use('/__editor/save-game-settings', async (req, res, next) => {
        if (req.method !== 'POST') return next();
        try {
          const body = JSON.parse(await readRequestBody(req));
          if (!body || typeof body !== 'object' || Array.isArray(body)) {
            res.statusCode = 400;
            res.end('invalid settings');
            return;
          }

          const current = JSON.parse(await fs.readFile(gameSettingsPath, 'utf8'));
          const nextSettings: Record<string, unknown> = { ...current };

          if (typeof body.musicVolume === 'number' && Number.isFinite(body.musicVolume)) {
            nextSettings.musicVolume = Math.min(1, Math.max(0, body.musicVolume));
          }

          for (const key of ['sfxVolumes', 'npcVolumes']) {
            const values = body[key];
            if (!values || typeof values !== 'object' || Array.isArray(values)) continue;
            const normalized: Record<string, number> = {};
            for (const [name, value] of Object.entries(values)) {
              if (typeof value === 'number' && Number.isFinite(value)) {
                normalized[name] = Math.min(1, Math.max(0, value));
              }
            }
            nextSettings[key] = normalized;
          }

          await fs.writeFile(gameSettingsPath, JSON.stringify(nextSettings, null, 2) + '\n');
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true, settings: nextSettings }));
        } catch (error) {
          res.statusCode = 500;
          res.end(`settings save failed: ${error instanceof Error ? error.message : 'unknown error'}`);
        }
        return;
      });

      server.middlewares.use('/__editor/save-level-patch', async (req, res, next) => {
        if (req.method !== 'POST') return next();
        try {
          const body = JSON.parse(await readRequestBody(req));
          if (!body || typeof body !== 'object' || Array.isArray(body)) {
            res.statusCode = 400;
            res.end('invalid patch');
            return;
          }
          const current = JSON.parse(await fs.readFile(levelPatchPath, 'utf8'));
          const patch = {
            ...current,
            add: Array.isArray(body.add) ? body.add : (current.add ?? []),
            del: Array.isArray(body.del) ? body.del : (current.del ?? []),
            checkpoints: Array.isArray(body.checkpoints) ? body.checkpoints : (current.checkpoints ?? []),
          };
          await fs.mkdir(levelPatchHistoryDir, { recursive: true });
          const historyName = `level-patch-${Date.now()}.json`;
          await fs.writeFile(path.join(levelPatchHistoryDir, historyName), JSON.stringify(current, null, 2) + '\n');
          await fs.writeFile(levelPatchPath, JSON.stringify(patch, null, 2) + '\n');
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true }));
        } catch (error) {
          res.statusCode = 500;
          res.end(`save failed: ${error instanceof Error ? error.message : 'unknown error'}`);
        }
        return;
      });
    },
  };
}

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    editorPersistencePlugin(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
