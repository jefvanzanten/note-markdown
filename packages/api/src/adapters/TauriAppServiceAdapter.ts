import { invoke } from "@tauri-apps/api/core";
import type { Ack, SaveResultDto, TabDto } from "@note/types";
import type { IAppService } from "../IAppService";

export class TauriAppServiceAdapter implements IAppService {
  async listTabs(): Promise<TabDto[]> {
    return invoke<TabDto[]>("list_restore_session");
  }

  async newNote(): Promise<TabDto> {
    return invoke<TabDto>("new_note");
  }

  async openFile(path: string): Promise<TabDto> {
    return invoke<TabDto>("open_file", { path });
  }

  async updateTabContent(tabId: string, content: string, cursor: number): Promise<Ack> {
    return invoke<Ack>("update_tab_content", { tabId, content, cursor });
  }

  async saveTab(tabId: string): Promise<SaveResultDto> {
    return invoke<SaveResultDto>("save_tab", { tabId });
  }

  async saveTabAs(tabId: string, targetPath: string): Promise<SaveResultDto> {
    return invoke<SaveResultDto>("save_tab_as", { tabId, targetPath });
  }

  async closeTab(tabId: string): Promise<Ack> {
    return invoke<Ack>("close_tab", { tabId });
  }

  async persistSession(): Promise<Ack> {
    return invoke<Ack>("persist_session");
  }
}
