export type ServerFile = { path: string; name: string };
export type RecentWorkspace = { path: string; name: string };

/** Returns true when the server API is reachable. */
export const isServerMode = async (): Promise<boolean> => {
  try {
    const res = await fetch("/api/workspaces/recent");
    return res.headers.get("content-type")?.includes("application/json") ?? false;
  } catch {
    return false;
  }
};

/** Get the list of recent workspaces. */
export const getRecentWorkspaces = async (): Promise<RecentWorkspace[]> => {
  const res = await fetch("/api/workspaces/recent");
  if (!res.ok) return [];
  return res.json() as Promise<RecentWorkspace[]>;
};

/** Register a workspace (validates it exists and adds it to recents). */
export const registerWorkspace = async (dirPath: string, name: string): Promise<void> => {
  const res = await fetch("/api/workspaces", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: dirPath, name })
  });
  if (!res.ok) {
    const err = (await res.json()) as { error: string };
    throw new Error(err.error ?? "Failed to register workspace");
  }
};

/** List all .md files in the given workspace directory. */
export const listServerFiles = async (workspace: string): Promise<ServerFile[]> => {
  const res = await fetch(`/api/files?workspace=${encodeURIComponent(workspace)}`);
  if (!res.ok) throw new Error("Failed to list files");
  return res.json() as Promise<ServerFile[]>;
};

/** Read a file's content by its workspace-relative path. */
export const readServerFile = async (workspace: string, filePath: string): Promise<string> => {
  const res = await fetch(`/api/file?workspace=${encodeURIComponent(workspace)}&path=${encodeURIComponent(filePath)}`);
  if (!res.ok) throw new Error(`Cannot read ${filePath}`);
  return res.text();
};

/** Write content to a file by its workspace-relative path. */
export const writeServerFile = async (workspace: string, filePath: string, content: string): Promise<void> => {
  const res = await fetch(`/api/file?workspace=${encodeURIComponent(workspace)}&path=${encodeURIComponent(filePath)}`, {
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

/** Delete a file or folder by its workspace-relative path. */
export const deleteServerFile = async (workspace: string, filePath: string): Promise<void> => {
  const res = await fetch(`/api/file?workspace=${encodeURIComponent(workspace)}&path=${encodeURIComponent(filePath)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Cannot delete ${filePath}`);
};

/** Rename a file or folder: oldPath and newPath are workspace-relative. */
export const renameServerFile = async (workspace: string, oldPath: string, newPath: string): Promise<void> => {
  const res = await fetch(
    `/api/file?workspace=${encodeURIComponent(workspace)}&path=${encodeURIComponent(oldPath)}&newPath=${encodeURIComponent(newPath)}`,
    { method: "PATCH" }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Cannot rename ${oldPath}`);
  }
};

/** List subdirectories of a path (defaults to home dir when path is omitted). */
export const listDirs = async (dirPath?: string): Promise<DirListing> => {
  const url = dirPath ? `/api/list-dirs?path=${encodeURIComponent(dirPath)}` : "/api/list-dirs";
  const res = await fetch(url);
  if (!res.ok) throw new Error("Cannot list directory");
  return res.json() as Promise<DirListing>;
};
