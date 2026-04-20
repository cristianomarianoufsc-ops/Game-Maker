import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import fs from "fs";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    "BASE_PATH environment variable is required but was not provided.",
  );
}

const spritesDir = path.resolve(import.meta.dirname, "public/sprites");
const levelPatchFile = path.resolve(import.meta.dirname, "public/level-patch.json");
const galleryTypesFile = path.resolve(import.meta.dirname, "public/gallery-types.json");

function spriteUploadPlugin() {
  return {
    name: "sprite-upload",
    configureServer(server: import("vite").ViteDevServer) {
      server.middlewares.use("/api/upload-sprite", (req, res, next) => {
        if (req.method !== "POST") return next();

        const chunks: Buffer[] = [];
        req.on("data", (chunk: Buffer) => chunks.push(chunk));
        req.on("end", () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString());
            const { name, dataUrl } = body as { name: string; dataUrl: string };

            if (!name || !dataUrl) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: "name e dataUrl são obrigatórios" }));
              return;
            }

            const safeName = path.basename(name).replace(/[^a-zA-Z0-9._-]/g, "_");
            const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
            const buffer = Buffer.from(base64, "base64");

            fs.mkdirSync(spritesDir, { recursive: true });
            fs.writeFileSync(path.join(spritesDir, safeName), buffer);

            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ url: `/sprites/${safeName}` }));
          } catch (err) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: "Erro ao salvar sprite" }));
          }
        });
      });

      server.middlewares.use("/api/sprites", (req, res, next) => {
        if (req.method !== "GET") return next();
        try {
          fs.mkdirSync(spritesDir, { recursive: true });
          const files = fs.readdirSync(spritesDir).filter((f) =>
            /\.(png|webp|jpg|jpeg|gif|svg)$/i.test(f)
          );
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ sprites: files.map((f) => ({ name: f, url: `/sprites/${f}` })) }));
        } catch {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: "Erro ao listar sprites" }));
        }
      });

      server.middlewares.use("/api/delete-sprite", (req, res, next) => {
        if (req.method !== "POST") return next();
        const chunks: Buffer[] = [];
        req.on("data", (chunk: Buffer) => chunks.push(chunk));
        req.on("end", () => {
          try {
            const { name } = JSON.parse(Buffer.concat(chunks).toString()) as { name: string };
            if (!name) { res.statusCode = 400; res.end(JSON.stringify({ error: "name obrigatório" })); return; }
            const safeName = path.basename(name).replace(/[^a-zA-Z0-9._-]/g, "_");
            if (!/\.(png|webp|jpg|jpeg|gif|svg)$/i.test(safeName)) {
              res.statusCode = 400; res.end(JSON.stringify({ error: "Tipo de arquivo inválido" })); return;
            }
            const filePath = path.join(spritesDir, safeName);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: true }));
          } catch {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: "Erro ao deletar sprite" }));
          }
        });
      });

      server.middlewares.use("/api/gallery-types", (req, res, next) => {
        if (req.method !== "GET") return next();
        try {
          const data = fs.existsSync(galleryTypesFile)
            ? JSON.parse(fs.readFileSync(galleryTypesFile, "utf-8")) as { types?: string[] }
            : { types: [] };
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ types: data.types ?? [] }));
        } catch {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ types: [] }));
        }
      });

      server.middlewares.use("/api/save-gallery-types", (req, res, next) => {
        if (req.method !== "POST") return next();
        const chunks: Buffer[] = [];
        req.on("data", (chunk: Buffer) => chunks.push(chunk));
        req.on("end", () => {
          try {
            const { types } = JSON.parse(Buffer.concat(chunks).toString()) as { types: string[] };
            fs.writeFileSync(galleryTypesFile, JSON.stringify({ types: types ?? [] }, null, 2), "utf-8");
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: true }));
          } catch {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: "Erro ao salvar tipos da galeria" }));
          }
        });
      });

      server.middlewares.use("/api/save-level-patch", (req, res, next) => {
        if (req.method !== "POST") return next();
        const chunks: Buffer[] = [];
        req.on("data", (chunk: Buffer) => chunks.push(chunk));
        req.on("end", () => {
          try {
            const incoming = JSON.parse(Buffer.concat(chunks).toString()) as {
              add?: unknown[];
              del?: string[];
            };

            // Lê patch existente e acumula as deleções entre sessões
            let existingDel: string[] = [];
            try {
              const existing = JSON.parse(fs.readFileSync(levelPatchFile, "utf-8")) as { del?: string[] };
              existingDel = existing.del ?? [];
            } catch { /* sem patch anterior */ }

            // União dos del: mantém deleções passadas + novas
            const addKeys = new Set(
              (incoming.add ?? []).map((p: unknown) => {
                const pl = p as { type: string; x: number; y: number; w: number; h: number; rotation?: number };
                return `${pl.type}:${pl.x}:${pl.y}:${pl.w}:${pl.h}:${Math.round(pl.rotation ?? 0)}`;
              })
            );
            const mergedDel = Array.from(
              new Set([...existingDel, ...(incoming.del ?? [])])
            ).filter(k => !addKeys.has(k)); // Remove da lista del se o item foi re-adicionado

            const merged = { add: incoming.add ?? [], del: mergedDel };
            fs.writeFileSync(levelPatchFile, JSON.stringify(merged, null, 2), "utf-8");
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: true }));
          } catch {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: "Erro ao salvar patch" }));
          }
        });
      });
    },
  };
}

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    spriteUploadPlugin(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
  preview: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
