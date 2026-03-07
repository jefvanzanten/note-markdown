import type { Ack, SaveResultDto, TabDto } from "@note/shared-types";
import {
  closeMockTab,
  listTabs,
  newMockNote,
  openMockFile,
  persistMockSession,
  saveMockTab,
  saveMockTabAs,
  updateMockTabContent
} from "./state";

type InvokePayload = Record<string, unknown> | undefined;

export const invoke = async <T>(command: string, payload?: InvokePayload): Promise<T> => {
  switch (command) {
    case "list_restore_session":
      return listTabs() as T;
    case "new_note":
      return newMockNote() as T;
    case "open_file":
      return openMockFile(String(payload?.path ?? "mock-note.md")) as T;
    case "update_tab_content":
      updateMockTabContent(String(payload?.tabId), String(payload?.content ?? ""), Number(payload?.cursor ?? 0));
      return { ok: true } satisfies Ack as T;
    case "save_tab":
      return saveMockTab(String(payload?.tabId)) as T;
    case "save_tab_as":
      return saveMockTabAs(String(payload?.tabId), String(payload?.targetPath ?? "mock-note.md")) as T;
    case "close_tab":
      closeMockTab(String(payload?.tabId));
      return { ok: true } satisfies Ack as T;
    case "persist_session":
      persistMockSession();
      return { ok: true } satisfies Ack as T;
    default:
      throw new Error(`Mock invoke voor '${command}' is niet geimplementeerd.`);
  }
};

export type { SaveResultDto, TabDto };
