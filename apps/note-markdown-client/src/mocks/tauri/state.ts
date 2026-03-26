import type { SaveResultDto, TabDto } from "@note/types";

type MockSession = {
  nextId: number;
  tabs: TabDto[];
};

const STORAGE_KEY = "note-markdown-client-mock-session-v1";

const cloneTabs = (tabs: TabDto[]) => tabs.map((tab) => ({ ...tab }));

const loadSession = (): MockSession => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { nextId: 1, tabs: [] };
    const parsed = JSON.parse(raw) as MockSession;
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.tabs)) {
      return { nextId: 1, tabs: [] };
    }

    return {
      nextId: typeof parsed.nextId === "number" ? parsed.nextId : 1,
      tabs: cloneTabs(parsed.tabs)
    };
  } catch {
    return { nextId: 1, tabs: [] };
  }
};

let session = loadSession();

const persist = () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
};

const updateTab = (tabId: string, updater: (tab: TabDto) => TabDto) => {
  const index = session.tabs.findIndex((tab) => tab.tab_id === tabId);
  if (index === -1) {
    throw new Error(`Tab ${tabId} bestaat niet.`);
  }

  session.tabs[index] = updater(session.tabs[index]);
  persist();
  return { ...session.tabs[index] };
};

const titleFromPath = (path: string) => path.split(/[\\/]/).pop() || "notitie.md";

export const listTabs = () => cloneTabs(session.tabs);

export const newMockNote = () => {
  const id = `mock-${session.nextId++}`;
  const tab: TabDto = {
    tab_id: id,
    title: `Notitie ${session.nextId - 1}`,
    is_temp: true,
    is_dirty: false,
    linked_path: null,
    content: "",
    cursor: 0
  };

  session.tabs.push(tab);
  persist();
  return { ...tab };
};

export const openMockFile = (path: string) => {
  const existing = session.tabs.find((tab) => tab.linked_path === path);
  if (existing) return { ...existing };

  const id = `mock-${session.nextId++}`;
  const tab: TabDto = {
    tab_id: id,
    title: titleFromPath(path),
    is_temp: false,
    is_dirty: false,
    linked_path: path,
    content: `# ${titleFromPath(path).replace(/\.md$/i, "")}\n`,
    cursor: 0
  };

  session.tabs.push(tab);
  persist();
  return { ...tab };
};

export const updateMockTabContent = (tabId: string, content: string, cursor: number) =>
  updateTab(tabId, (tab) => ({ ...tab, content, cursor, is_dirty: true }));

export const saveMockTab = (tabId: string): SaveResultDto => {
  const tab = session.tabs.find((entry) => entry.tab_id === tabId);
  if (!tab) throw new Error(`Tab ${tabId} bestaat niet.`);
  if (!tab.linked_path) throw new Error("Save As required");

  return {
    tab: updateTab(tabId, (current) => ({ ...current, is_temp: false, is_dirty: false }))
  };
};

export const saveMockTabAs = (tabId: string, targetPath: string): SaveResultDto => ({
  tab: updateTab(tabId, (current) => ({
    ...current,
    title: titleFromPath(targetPath),
    linked_path: targetPath,
    is_temp: false,
    is_dirty: false
  }))
});

export const closeMockTab = (tabId: string) => {
  session.tabs = session.tabs.filter((tab) => tab.tab_id !== tabId);
  persist();
};

export const persistMockSession = () => {
  persist();
};
