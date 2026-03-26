export type ServerFile = { path: string; name: string };

/** Returns true when the Vite dev server's file system API is reachable. */
export const isServerMode = async (): Promise<boolean> => {
  try {
    const res = await fetch("/api/workspace");
    return res.headers.get("content-type")?.includes("application/json") ?? false;
  } catch {
    return false;
  }
};

/** Get the currently configured workspace, or null if none is set. */
export const getServerWorkspace = async (): Promise<{ path: string; name: string } | null> => {
  const res = await fetch("/api/workspace");
  return res.json() as Promise<{ path: string; name: string } | null>;
};

/** Save the workspace path to the server-side .workspace.json config. */
export const setServerWorkspace = async (dirPath: string, name: string): Promise<void> => {
  const res = await fetch("/api/workspace", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: dirPath, name })
  });
  if (!res.ok) {
    const err = (await res.json()) as { error: string };
    throw new Error(err.error ?? "Failed to set workspace");
  }
};

/** List all .md files in the configured workspace. */
export const listServerFiles = async (): Promise<ServerFile[]> => {
  const res = await fetch("/api/files");
  if (!res.ok) throw new Error("Failed to list files");
  return res.json() as Promise<ServerFile[]>;
};

/** Read a file's content by its workspace-relative path. */
export const readServerFile = async (filePath: string): Promise<string> => {
  const res = await fetch(`/api/file?path=${encodeURIComponent(filePath)}`);
  if (!res.ok) throw new Error(`Cannot read ${filePath}`);
  return res.text();
};

/** Write content to a file by its workspace-relative path. */
export const writeServerFile = async (filePath: string, content: string): Promise<void> => {
  const res = await fetch(`/api/file?path=${encodeURIComponent(filePath)}`, {
    method: "PUT",
    body: content
  });
  if (!res.ok) throw new Error(`Cannot write ${filePath}`);
};

export type DirListing = {
  current: string;
  parent: string | null;
  dirs: { name: string; path: string }[];
};

/** List subdirectories of a path (defaults to home dir when path is omitted). */
export const listDirs = async (dirPath?: string): Promise<DirListing> => {
  const url = dirPath ? `/api/list-dirs?path=${encodeURIComponent(dirPath)}` : "/api/list-dirs";
  const res = await fetch(url);
  if (!res.ok) throw new Error("Cannot list directory");
  return res.json() as Promise<DirListing>;
};
