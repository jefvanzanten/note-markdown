import type { Plugin } from "vite";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { IncomingMessage, ServerResponse } from "node:http";

interface WorkspaceConfig {
  path: string;
  name: string;
}

const CONFIG_FILE = path.join(process.cwd(), ".workspace.json");

async function loadConfig(): Promise<WorkspaceConfig | null> {
  try {
    return JSON.parse(await fs.readFile(CONFIG_FILE, "utf-8")) as WorkspaceConfig;
  } catch {
    return null;
  }
}

async function saveConfig(config: WorkspaceConfig): Promise<void> {
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
}

async function scanDir(
  dir: string,
  prefix: string,
  results: { path: string; name: string }[]
): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await scanDir(fullPath, relPath, results);
    } else if (entry.isFile() && /\.(md|markdown)$/i.test(entry.name)) {
      results.push({ path: relPath, name: entry.name.replace(/\.(md|markdown)$/i, "") });
    }
  }
}

function json(res: ServerResponse, data: unknown, status = 200): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk: Buffer) => (body += chunk.toString()));
    req.on("end", () => resolve(body));
  });
}

export function fileSystemPlugin(): Plugin {
  return {
    name: "web-app-fs-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url!, "http://localhost");
        const { pathname, searchParams } = url;
        const method = req.method ?? "GET";

        // GET /api/workspace — returns current config or null
        if (pathname === "/api/workspace" && method === "GET") {
          json(res, await loadConfig());
          return;
        }

        // POST /api/workspace — set workspace { path, name }
        if (pathname === "/api/workspace" && method === "POST") {
          try {
            const config = JSON.parse(await readBody(req)) as WorkspaceConfig;
            await fs.access(config.path); // throws if path doesn't exist
            await saveConfig(config);
            json(res, { ok: true });
          } catch (e) {
            json(res, { error: String(e) }, 400);
          }
          return;
        }

        // GET /api/files — list all .md files in workspace
        if (pathname === "/api/files" && method === "GET") {
          const config = await loadConfig();
          if (!config) { json(res, { error: "No workspace configured" }, 404); return; }
          try {
            const results: { path: string; name: string }[] = [];
            await scanDir(config.path, "", results);
            results.sort((a, b) => a.path.localeCompare(b.path));
            json(res, results);
          } catch (e) {
            json(res, { error: String(e) }, 500);
          }
          return;
        }

        // GET /api/file?path=... — read file content
        if (pathname === "/api/file" && method === "GET") {
          const config = await loadConfig();
          const filePath = searchParams.get("path");
          if (!config || !filePath) { res.statusCode = 400; res.end(); return; }
          const abs = path.resolve(config.path, filePath);
          if (!abs.startsWith(path.resolve(config.path))) { res.statusCode = 403; res.end(); return; }
          try {
            res.setHeader("Content-Type", "text/plain; charset=utf-8");
            res.end(await fs.readFile(abs, "utf-8"));
          } catch {
            res.statusCode = 404;
            res.end();
          }
          return;
        }

        // PUT /api/file?path=... — write file content (body = text)
        if (pathname === "/api/file" && method === "PUT") {
          const config = await loadConfig();
          const filePath = searchParams.get("path");
          if (!config || !filePath) { res.statusCode = 400; res.end(); return; }
          const abs = path.resolve(config.path, filePath);
          if (!abs.startsWith(path.resolve(config.path))) { res.statusCode = 403; res.end(); return; }
          try {
            await fs.writeFile(abs, await readBody(req), "utf-8");
            res.end("OK");
          } catch (e) {
            res.statusCode = 500;
            res.end(String(e));
          }
          return;
        }

        // GET /api/list-dirs?path=... — list subdirectories for in-app folder browser
        if (pathname === "/api/list-dirs" && method === "GET") {
          const rawPath = searchParams.get("path");
          const current = rawPath ? rawPath : os.homedir();
          try {
            const entries = await fs.readdir(current, { withFileTypes: true });
            const dirs = entries
              .filter((e) => e.isDirectory() && !e.name.startsWith("."))
              .map((e) => ({ name: e.name, path: path.join(current, e.name).split("\\").join("/") }))
              .sort((a, b) => a.name.localeCompare(b.name));
            const parentRaw = path.dirname(current);
            const parent = parentRaw !== current ? parentRaw.split("\\").join("/") : null;
            json(res, { current: current.split("\\").join("/"), parent, dirs });
          } catch (e) {
            json(res, { error: String(e) }, 400);
          }
          return;
        }

        next();
      });
    }
  };
}
