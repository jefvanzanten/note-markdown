import type { Ack, SaveResultDto, TabDto } from "@note/types";

export interface IAppService {
  listTabs(): Promise<TabDto[]>;
  newNote(): Promise<TabDto>;
  openFile(path: string): Promise<TabDto>;
  updateTabContent(tabId: string, content: string, cursor: number): Promise<Ack>;
  saveTab(tabId: string): Promise<SaveResultDto>;
  saveTabAs(tabId: string, targetPath: string): Promise<SaveResultDto>;
  closeTab(tabId: string): Promise<Ack>;
  persistSession(): Promise<Ack>;
}
