import { open, save } from "@tauri-apps/plugin-dialog";
import type { Ack, SaveResultDto, TabDto } from "@note/types";
import { ensureMarkdownFileName, joinPath } from "@note/utils";
import { AppService } from "@note/core";
import { TauriAppServiceAdapter } from "./adapters/TauriAppServiceAdapter";
import { LocalStorageFsAdapter } from "./adapters/LocalStorageFsAdapter";

export type { IAppService } from "./IAppService";
export { TauriAppServiceAdapter } from "./adapters/TauriAppServiceAdapter";
export { LocalStorageFsAdapter } from "./adapters/LocalStorageFsAdapter";

export const createWebService = (appName: string): Promise<AppService> =>
  AppService.create(new LocalStorageFsAdapter(), appName);

// ---------------------------------------------------------------------------
// Backward-compatible Tauri function exports used by the desktop apps.
// These delegate to TauriAppServiceAdapter which calls Rust via invoke().
// ---------------------------------------------------------------------------

const _tauri = new TauriAppServiceAdapter();

export const listRestoreSession = (): Promise<TabDto[]> => _tauri.listTabs();

export const newNote = (): Promise<TabDto> => _tauri.newNote();

export const openFile = async (): Promise<TabDto | null> => {
  const path = await open({
    multiple: false,
    filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
  });

  if (!path || Array.isArray(path)) {
    return null;
  }

  return _tauri.openFile(path);
};

export const updateTabContent = (tabId: string, content: string, cursor: number): Promise<Ack> =>
  _tauri.updateTabContent(tabId, content, cursor);

export const closeTab = (tabId: string): Promise<Ack> => _tauri.closeTab(tabId);

export const saveTab = (tabId: string): Promise<SaveResultDto> => _tauri.saveTab(tabId);

export const saveTabAs = async (
  tabId: string,
  defaultDirectory: string | null,
  suggestedName: string
): Promise<SaveResultDto | null> => {
  const defaultPath = defaultDirectory
    ? joinPath(defaultDirectory, ensureMarkdownFileName(suggestedName))
    : undefined;

  const path = await save({
    defaultPath,
    filters: [{ name: "Markdown", extensions: ["md"] }],
  });

  if (!path) {
    return null;
  }

  return _tauri.saveTabAs(tabId, path);
};

export const persistSession = (): Promise<Ack> => _tauri.persistSession();
