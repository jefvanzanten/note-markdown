import { writable } from "svelte/store";
import type { TabDto } from "@note/types";

export const tabs = writable<TabDto[]>([]);
export const activeTabId = writable<string | null>(null);

export const upsertTab = (next: TabDto) => {
  tabs.update((current) => {
    const idx = current.findIndex((t) => t.tab_id === next.tab_id);
    if (idx === -1) {
      return [...current, next];
    }

    const copy = [...current];
    copy[idx] = next;
    return copy;
  });
};

export const removeTab = (tabId: string) => {
  tabs.update((current) => current.filter((t) => t.tab_id !== tabId));
};
