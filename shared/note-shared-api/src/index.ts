import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { Ack, SaveResultDto, TabDto } from "@note/shared-types";

export const listRestoreSession = () => invoke<TabDto[]>("list_restore_session");
export const newNote = () => invoke<TabDto>("new_note");

export const openFile = async () => {
  const path = await open({
    multiple: false,
    filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
  });

  if (!path || Array.isArray(path)) {
    return null;
  }

  return invoke<TabDto>("open_file", { path });
};

export const updateTabContent = (tabId: string, content: string, cursor: number) =>
  invoke<Ack>("update_tab_content", { tabId, content, cursor });

export const closeTab = (tabId: string) => invoke<Ack>("close_tab", { tabId });

export const saveTab = (tabId: string) => invoke<SaveResultDto>("save_tab", { tabId });

export const saveTabAs = async (
  tabId: string,
  defaultDirectory: string | null,
  suggestedName: string
) => {
  const defaultPath = defaultDirectory
    ? `${defaultDirectory}\\${suggestedName.endsWith(".md") ? suggestedName : `${suggestedName}.md`}`
    : undefined;

  const path = await save({
    defaultPath,
    filters: [{ name: "Markdown", extensions: ["md"] }],
  });

  if (!path) {
    return null;
  }

  return invoke<SaveResultDto>("save_tab_as", { tabId, targetPath: path });
};

export const persistSession = () => invoke<Ack>("persist_session");
