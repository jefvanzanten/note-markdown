import type { Ack, PersistedSession, PersistedTab, SaveResultDto, TabDto } from "@note/types";
import type { FileSystemAdapter } from "./FileSystemAdapter";

const AUTOSAVE_DEBOUNCE_MS = 700;
const SESSION_FILE_NAME = "session.json";

export class AppServiceError extends Error {
  constructor(
    public readonly kind: "tab_not_found" | "save_as_required" | "io" | "parse",
    message: string
  ) {
    super(message);
    this.name = "AppServiceError";
  }
}

type Tab = {
  tab_id: string;
  title: string;
  is_temp: boolean;
  is_dirty: boolean;
  linked_path: string | null;
  content: string;
  cursor: number;
  temp_file_name: string | null;
};

const tabToDto = (tab: Tab): TabDto => ({
  tab_id: tab.tab_id,
  title: tab.title,
  is_temp: tab.is_temp,
  is_dirty: tab.is_dirty,
  linked_path: tab.linked_path,
  content: tab.content,
  cursor: tab.cursor,
});

const tabToPersistedTab = (tab: Tab): PersistedTab => ({
  tab_id: tab.tab_id,
  title: tab.title,
  is_temp: tab.is_temp,
  is_dirty: tab.is_dirty,
  linked_path: tab.linked_path,
  content: tab.content,
  cursor: tab.cursor,
  temp_file_name: tab.temp_file_name,
});

const titleFromPath = (path: string): string =>
  path.replace(/[\\/]+/g, "/").split("/").pop() ?? "untitled";

export class AppService {
  private tabs: Tab[] = [];
  private nextTabIdCounter = 1;
  private nextTempId = 1;
  private readonly sessionRoot: string;
  private readonly fs: FileSystemAdapter;
  private lastAutosave = new Map<string, number>();

  private constructor(fs: FileSystemAdapter, sessionRoot: string) {
    this.fs = fs;
    this.sessionRoot = sessionRoot;
  }

  static async create(fs: FileSystemAdapter, appName: string): Promise<AppService> {
    const service = new AppService(fs, fs.sessionRoot(appName));
    await service.fs.createDirAll(service.sessionRoot);
    await service.restoreSession();
    return service;
  }

  async listTabs(): Promise<TabDto[]> {
    return this.tabs.map(tabToDto);
  }

  async newNote(): Promise<TabDto> {
    const tempName = `tmp-${this.nextTempId}`;
    this.nextTempId++;

    const tab: Tab = {
      tab_id: this.nextTabId(),
      title: tempName,
      is_temp: true,
      is_dirty: false,
      linked_path: null,
      content: "",
      cursor: 0,
      temp_file_name: `${tempName}.md`,
    };

    this.tabs.push(tab);
    await this.persistSession();
    return tabToDto(tab);
  }

  async openFile(path: string): Promise<TabDto> {
    const content = await this.fs.readToString(path);
    const title = titleFromPath(path);

    const tab: Tab = {
      tab_id: this.nextTabId(),
      title,
      is_temp: false,
      is_dirty: false,
      linked_path: path,
      content,
      cursor: 0,
      temp_file_name: null,
    };

    this.tabs.push(tab);
    await this.persistSession();
    return tabToDto(tab);
  }

  async updateTabContent(tabId: string, content: string, cursor: number): Promise<Ack> {
    const idx = this.findTabIndex(tabId);
    const isTemp = this.tabs[idx].is_temp;

    this.tabs[idx].content = content;
    this.tabs[idx].cursor = cursor;
    this.tabs[idx].is_dirty = true;

    if (isTemp) {
      await this.tryAutosaveTemp(tabId);
    }

    return { ok: true };
  }

  async saveTab(tabId: string): Promise<SaveResultDto> {
    const idx = this.findTabIndex(tabId);
    const path = this.tabs[idx].linked_path;
    if (!path) {
      throw new AppServiceError("save_as_required", `Save as required for tab: ${tabId}`);
    }

    await this.fs.writeString(path, this.tabs[idx].content);
    this.tabs[idx].is_dirty = false;

    const dto = tabToDto(this.tabs[idx]);
    await this.persistSession();
    return { tab: dto };
  }

  async saveTabAs(tabId: string, targetPath: string): Promise<SaveResultDto> {
    const idx = this.findTabIndex(tabId);
    await this.fs.writeString(targetPath, this.tabs[idx].content);

    const oldTemp = this.tabs[idx].temp_file_name;
    if (oldTemp) {
      await this.removeTempFileIfExists(oldTemp);
    }

    this.tabs[idx].linked_path = targetPath;
    this.tabs[idx].is_temp = false;
    this.tabs[idx].is_dirty = false;
    this.tabs[idx].title = titleFromPath(targetPath);
    this.tabs[idx].temp_file_name = null;

    const dto = tabToDto(this.tabs[idx]);
    await this.persistSession();
    return { tab: dto };
  }

  async closeTab(tabId: string): Promise<Ack> {
    const pos = this.findTabIndex(tabId);
    const [tab] = this.tabs.splice(pos, 1);

    if (tab.temp_file_name) {
      await this.removeTempFileIfExists(tab.temp_file_name);
    }

    this.lastAutosave.delete(tabId);
    await this.persistSession();
    return { ok: true };
  }

  async persistSession(): Promise<Ack> {
    // 1. Delete temp files for empty temp tabs
    for (const tab of this.tabs) {
      if (tab.is_temp && tab.content === "" && tab.temp_file_name) {
        await this.removeTempFileIfExists(tab.temp_file_name);
      }
    }

    // 2. Write temp files for non-empty temp tabs
    for (const tab of this.tabs) {
      if (tab.is_temp && tab.content !== "" && tab.temp_file_name) {
        await this.writeTempFile(tab.temp_file_name, tab.content);
      }
    }

    // 3. Build savedTabs — skip empty temp tabs
    const savedTabs = this.tabs
      .filter((tab) => !tab.is_temp || tab.content !== "")
      .map(tabToPersistedTab);

    // 4. Reset nextTempId to 1 if no temp tabs remain
    const nextTempId = savedTabs.some((t) => t.is_temp) ? this.nextTempId : 1;

    // 5. Write session.json
    const session: PersistedSession = {
      next_tab_id: this.nextTabIdCounter,
      next_temp_id: nextTempId,
      tabs: savedTabs,
    };

    await this.fs.writeString(
      this.joinPath(this.sessionRoot, SESSION_FILE_NAME),
      JSON.stringify(session, null, 2)
    );

    return { ok: true };
  }

  private async restoreSession(): Promise<void> {
    const sessionPath = this.joinPath(this.sessionRoot, SESSION_FILE_NAME);
    if (!(await this.fs.exists(sessionPath))) {
      return;
    }

    let persisted: PersistedSession;
    try {
      const raw = await this.fs.readToString(sessionPath);
      persisted = JSON.parse(raw) as PersistedSession;
    } catch (e) {
      console.warn("[note] session.json parse error, starting fresh:", e);
      return;
    }

    this.nextTabIdCounter = persisted.next_tab_id;
    this.nextTempId = persisted.next_temp_id;

    this.tabs = await Promise.all(
      persisted.tabs.map(async (persistedTab) => {
        let content = persistedTab.content;
        if (persistedTab.temp_file_name) {
          const tempPath = this.joinPath(this.sessionRoot, persistedTab.temp_file_name);
          if (await this.fs.exists(tempPath)) {
            try {
              content = await this.fs.readToString(tempPath);
            } catch {
              // fall back to content stored in session.json
            }
          }
        }

        return {
          tab_id: persistedTab.tab_id,
          title: persistedTab.title,
          is_temp: persistedTab.is_temp,
          is_dirty: persistedTab.is_dirty,
          linked_path: persistedTab.linked_path,
          content,
          cursor: persistedTab.cursor,
          temp_file_name: persistedTab.temp_file_name,
        };
      })
    );
  }

  private async tryAutosaveTemp(tabId: string): Promise<void> {
    const lastSave = this.lastAutosave.get(tabId);
    const shouldWrite = lastSave === undefined || Date.now() - lastSave >= AUTOSAVE_DEBOUNCE_MS;

    if (!shouldWrite) return;

    const idx = this.findTabIndex(tabId);
    const tempName = this.tabs[idx].temp_file_name;
    if (!tempName) return;

    await this.writeTempFile(tempName, this.tabs[idx].content);
    this.lastAutosave.set(tabId, Date.now());
    await this.persistSession();
  }

  private async writeTempFile(tempName: string, content: string): Promise<void> {
    await this.fs.writeString(this.joinPath(this.sessionRoot, tempName), content);
  }

  private async removeTempFileIfExists(tempName: string): Promise<void> {
    const path = this.joinPath(this.sessionRoot, tempName);
    if (await this.fs.exists(path)) {
      await this.fs.removeFile(path);
    }
  }

  private joinPath(dir: string, file: string): string {
    const sep = dir.includes("\\") ? "\\" : "/";
    return `${dir.replace(/[\\/]+$/, "")}${sep}${file}`;
  }

  private nextTabId(): string {
    return `tab-${this.nextTabIdCounter++}`;
  }

  private findTabIndex(tabId: string): number {
    const idx = this.tabs.findIndex((tab) => tab.tab_id === tabId);
    if (idx === -1) {
      throw new AppServiceError("tab_not_found", `Tab not found: ${tabId}`);
    }
    return idx;
  }
}
