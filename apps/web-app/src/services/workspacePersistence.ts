import { get, set, del } from "idb-keyval";

const HANDLE_KEY = "web-app-workspace-handle-v1";
const NAME_KEY = "web-app-workspace-name-v1";
const FALLBACK_CACHE_KEY = "web-app-fallback-workspace-v1";

export type CachedFile = { path: string; name: string; content: string };
export type FallbackWorkspace = { name: string; files: CachedFile[] };

export const saveFallbackWorkspace = (name: string, files: CachedFile[]): Promise<void> =>
  set(FALLBACK_CACHE_KEY, { name, files } satisfies FallbackWorkspace);

export const loadFallbackWorkspace = (): Promise<FallbackWorkspace | undefined> =>
  get<FallbackWorkspace>(FALLBACK_CACHE_KEY);

export const clearFallbackWorkspace = (): Promise<void> => del(FALLBACK_CACHE_KEY);

export const saveDirectoryHandle = (handle: FileSystemDirectoryHandle): Promise<void> =>
  set(HANDLE_KEY, handle);

export const loadDirectoryHandle = (): Promise<FileSystemDirectoryHandle | undefined> =>
  get<FileSystemDirectoryHandle>(HANDLE_KEY);

export const clearDirectoryHandle = (): Promise<void> => del(HANDLE_KEY);

export const saveWorkspaceName = (name: string): void =>
  localStorage.setItem(NAME_KEY, name);

export const loadWorkspaceName = (): string | null =>
  localStorage.getItem(NAME_KEY);

const RECENT_KEY = "web-app-recent-workspaces-v1";
const MAX_RECENT = 8;

export type RecentWorkspace = { path: string; name: string };

export const saveRecentWorkspace = (path: string, name: string): void => {
  const list = loadRecentWorkspaces().filter((r) => r.path !== path);
  localStorage.setItem(RECENT_KEY, JSON.stringify([{ path, name }, ...list].slice(0, MAX_RECENT)));
};

export const loadRecentWorkspaces = (): RecentWorkspace[] => {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as RecentWorkspace[];
  } catch {
    return [];
  }
};
