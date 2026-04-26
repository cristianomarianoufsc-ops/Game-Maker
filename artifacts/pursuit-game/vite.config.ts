import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import fs from "fs";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const rawPort = process.env.PORT ?? "5173";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH ?? "/";

const spritesDir = path.resolve(import.meta.dirname, "public/sprites");
const levelPatchFile = path.resolve(import.meta.dirname, "public/level-patch.json");
const galleryTypesFile = path.resolve(import.meta.dirname, "public/gallery-types.json");
const levelPatchHistoryDir = path.resolve(import.meta.dirname, "public/level-patch.history");
const HISTORY_KEEP = 30;

function writeHistorySnapshot(serializedPatch: string): void {
  try {
    fs.mkdirSync(levelPatchHistoryDir, { recursive: true });
    // Nome: ISO timestamp seguro pra filesystem (sem ":" nem "."), ms para evitar colisão.
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    fs.writeFileSync(
      path.join(levelPatchHistoryDir, `${stamp}.json`),
      serializedPatch,
      "utf-8",
    );
    // Rotação — mantém só os HISTORY_KEEP mais recentes.
    const files = fs
      .readdirSync(levelPatchHistoryDir)
      .filter((f) => f.endsWith(".json"))
      .sort();
    const excess = files.length - HISTORY_KEEP;
    if (excess > 0) {
      for (let i = 0; i < excess; i++) {
        try { fs.unlinkSync(path.join(levelPatchHistoryDir, files[i])); } catch { /* ignore */ }
      }
    }
  } catch { /* histórico é best-effort, não bloqueia o save */ }
}

function spriteUploadPlugin() {
  return {
    name: "sprite-upload",
    configureServer(server: import("vite").ViteDevServer) {
      server.middlewares.use("/__editor/upload-sprite", (req, res, next) => {
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

      server.middlewares.use("/__editor/sprites", (req, res, next) => {
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

      server.middlewares.use("/__editor/delete-sprite", (req, res, next) => {
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

      server.middlewares.use("/__editor/gallery-types", (req, res, next) => {
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

      server.middlewares.use("/__editor/save-gallery-types", (req, res, next) => {
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

      server.middlewares.use("/__editor/save-level-patch", (req, res, next) => {
        if (req.method !== "POST") return next();
        const chunks: Buffer[] = [];
        req.on("data", (chunk: Buffer) => chunks.push(chunk));
        req.on("end", () => {
          try {
            const incoming = JSON.parse(Buffer.concat(chunks).toString()) as {
              add?: unknown[];
              del?: string[];
              checkpoints?: { label: string; x: number }[];
            };

            // Lê patch existente para preservar campos não incluídos neste POST
            let existingDel: string[] = [];
            let existingAdd: unknown[] = [];
            let existingCheckpoints: { label: string; x: number }[] = [];
            try {
              const existing = JSON.parse(fs.readFileSync(levelPatchFile, "utf-8")) as {
                del?: string[];
                add?: unknown[];
                checkpoints?: { label: string; x: number }[];
              };
              existingDel = existing.del ?? [];
              existingAdd = existing.add ?? [];
              existingCheckpoints = existing.checkpoints ?? [];
            } catch { /* sem patch anterior */ }

            // Se o POST inclui add/del, processa plataformas; caso contrário preserva existentes
            let finalAdd: unknown[];
            let finalDel: string[];
            if (incoming.add !== undefined || incoming.del !== undefined) {
              const addKeys = new Set(
                (incoming.add ?? []).map((p: unknown) => {
                  const pl = p as { type: string; x: number; y: number; w: number; h: number; rotation?: number };
                  return `${pl.type}:${pl.x}:${pl.y}:${pl.w}:${pl.h}:${Math.round(pl.rotation ?? 0)}`;
                })
              );
              finalAdd = incoming.add ?? [];
              finalDel = Array.from(
                new Set([...existingDel, ...(incoming.del ?? [])])
              ).filter(k => !addKeys.has(k));
            } else {
              finalAdd = existingAdd;
              finalDel = existingDel;
            }

            // Checkpoints: se vieram no POST, substitui; senão preserva existentes
            const finalCheckpoints = incoming.checkpoints !== undefined
              ? incoming.checkpoints
              : existingCheckpoints;

            const merged: Record<string, unknown> = { add: finalAdd, del: finalDel };
            if (finalCheckpoints.length > 0) merged.checkpoints = finalCheckpoints;

            const serialized = JSON.stringify(merged, null, 2);
            fs.writeFileSync(levelPatchFile, serialized, "utf-8");
            // Snapshot pro histórico (best-effort, não bloqueia resposta)
            writeHistorySnapshot(serialized);
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: true }));
          } catch {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: "Erro ao salvar patch" }));
          }
        });
      });

      // Lista snapshots do histórico — mais recentes primeiro.
      server.middlewares.use("/__editor/list-level-patch-history", (req, res, next) => {
        if (req.method !== "GET") return next();
        try {
          fs.mkdirSync(levelPatchHistoryDir, { recursive: true });
          const files = fs
            .readdirSync(levelPatchHistoryDir)
            .filter((f) => f.endsWith(".json"))
            .sort()
            .reverse();
          const snapshots = files.map((file) => {
            const full = path.join(levelPatchHistoryDir, file);
            let size = 0;
            let addCount = 0;
            let delCount = 0;
            try {
              const stat = fs.statSync(full);
              size = stat.size;
              const data = JSON.parse(fs.readFileSync(full, "utf-8")) as {
                add?: unknown[]; del?: string[];
              };
              addCount = (data.add ?? []).length;
              delCount = (data.del ?? []).length;
            } catch { /* arquivo corrompido — mostra mesmo assim */ }
            return { file, size, addCount, delCount };
          });
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ snapshots }));
        } catch {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: "Erro ao listar histórico" }));
        }
      });

      // Restaura um snapshot — copia conteúdo de history para level-patch.json.
      // Antes da restauração grava um snapshot "pré-restore" pra poder desfazer.
      server.middlewares.use("/__editor/restore-level-patch-history", (req, res, next) => {
        if (req.method !== "POST") return next();
        const chunks: Buffer[] = [];
        req.on("data", (chunk: Buffer) => chunks.push(chunk));
        req.on("end", () => {
          try {
            const { file } = JSON.parse(Buffer.concat(chunks).toString()) as { file: string };
            if (!file) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: "file obrigatório" }));
              return;
            }
            // Bloqueia path traversal — só nome simples permitido.
            const safeFile = path.basename(file);
            if (!/^[A-Za-z0-9._-]+\.json$/.test(safeFile)) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: "nome de arquivo inválido" }));
              return;
            }
            const src = path.join(levelPatchHistoryDir, safeFile);
            if (!fs.existsSync(src)) {
              res.statusCode = 404;
              res.end(JSON.stringify({ error: "snapshot não encontrado" }));
              return;
            }
            const content = fs.readFileSync(src, "utf-8");
            // Snapshot do estado atual antes de sobrescrever (rede de segurança).
            try {
              if (fs.existsSync(levelPatchFile)) {
                const current = fs.readFileSync(levelPatchFile, "utf-8");
                writeHistorySnapshot(current);
              }
            } catch { /* ignore */ }
            fs.writeFileSync(levelPatchFile, content, "utf-8");
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: true }));
          } catch {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: "Erro ao restaurar snapshot" }));
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
