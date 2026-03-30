import type { Plugin } from "vite";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { IncomingMessage, ServerResponse } from "node:http";

const RECENT_FILE = path.join(process.cwd(), ".recent-workspaces.json");
const MAX_RECENT = 8;

interface RecentWorkspace {
  path: string;
  name: string;
}

async function loadRecents(): Promise<RecentWorkspace[]> {
  try {
    return JSON.parse(await fs.readFile(RECENT_FILE, "utf-8")) as RecentWorkspace[];
  } catch {
    return [];
  }
}

async function saveRecents(list: RecentWorkspace[]): Promise<void> {
  await fs.writeFile(RECENT_FILE, JSON.stringify(list, null, 2), "utf-8");
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

        // GET /api/workspaces/recent — list recent workspaces
        if (pathname === "/api/workspaces/recent" && method === "GET") {
          json(res, await loadRecents());
          return;
        }

        // POST /api/workspaces — register workspace { path, name }
        if (pathname === "/api/workspaces" && method === "POST") {
          try {
            const body = JSON.parse(await readBody(req)) as RecentWorkspace;
            await fs.access(body.path); // throws if path doesn't exist
            const list = (await loadRecents()).filter((r) => r.path !== body.path);
            await saveRecents([{ path: body.path, name: body.name }, ...list].slice(0, MAX_RECENT));
            json(res, { ok: true });
          } catch (e) {
            json(res, { error: String(e) }, 400);
          }
          return;
        }

        // GET /api/files?workspace=<path> — list all .md files in workspace
        if (pathname === "/api/files" && method === "GET") {
          const workspace = searchParams.get("workspace");
          if (!workspace) { json(res, { error: "Missing workspace parameter" }, 400); return; }
          try {
            const results: { path: string; name: string }[] = [];
            await scanDir(workspace, "", results);
            results.sort((a, b) => a.path.localeCompare(b.path));
            json(res, results);
          } catch (e) {
            json(res, { error: String(e) }, 500);
          }
          return;
        }

        // GET /api/file?workspace=<path>&path=<rel> — read file content
        if (pathname === "/api/file" && method === "GET") {
          const workspace = searchParams.get("workspace");
          const filePath = searchParams.get("path");
          if (!workspace || !filePath) { res.statusCode = 400; res.end(); return; }
          const abs = path.resolve(workspace, filePath);
          if (!abs.startsWith(path.resolve(workspace))) { res.statusCode = 403; res.end(); return; }
          try {
            res.setHeader("Content-Type", "text/plain; charset=utf-8");
            res.end(await fs.readFile(abs, "utf-8"));
          } catch {
            res.statusCode = 404;
            res.end();
          }
          return;
        }

        // PUT /api/file?workspace=<path>&path=<rel> — write file content (body = text)
        if (pathname === "/api/file" && method === "PUT") {
          const workspace = searchParams.get("workspace");
          const filePath = searchParams.get("path");
          if (!workspace || !filePath) { res.statusCode = 400; res.end(); return; }
          const abs = path.resolve(workspace, filePath);
          if (!abs.startsWith(path.resolve(workspace))) { res.statusCode = 403; res.end(); return; }
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
