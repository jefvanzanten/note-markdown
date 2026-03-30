import { writable, derived } from "svelte/store";
import type { FileEntry } from "../../services/fsAccess";

export type WorkspaceMode = "server" | "fsa" | "fallback";

export type WorkspaceState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; dirHandle?: FileSystemDirectoryHandle; name: string; files: FileEntry[]; handleMap: Map<string, FileSystemFileHandle>; mode: WorkspaceMode }
  | { status: "error"; message: string };

export function createWorkspaceStore() {
  const store = writable<WorkspaceState>({ status: "idle" });
  const files = derived(store, ($ws) => $ws.status === "ready" ? $ws.files : []);
  const name = derived(store, ($ws) => $ws.status === "ready" ? $ws.name : null);
  return { store, files, name };
}

export const buildHandleMap = (files: FileEntry[]): Map<string, FileSystemFileHandle> => {
  const map = new Map<string, FileSystemFileHandle>();
  for (const f of files) {
    if (f.handle) map.set(f.path, f.handle);
  }
  return map;
};
