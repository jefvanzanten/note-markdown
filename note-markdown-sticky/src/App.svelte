<script lang="ts">
  import { onMount } from "svelte";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
  import MarkdownEditor from "@note/shared-editor";
  import {
    closeTab,
    listRestoreSession,
    newNote,
    persistSession,
    saveTab,
    saveTabAs,
    updateTabContent
  } from "@note/shared-api";
  import type { TabDto } from "@note/shared-types";

  const currentWindow = getCurrentWindow();
  const requestedTabId = new URLSearchParams(window.location.search).get("tabId");
  const STICKY_WIDTH = 380;
  const STICKY_HEIGHT = 430;

  let tab: TabDto | null = null;
  let sessionSaveDirectory: string | null = null;
  let closeInProgress = false;

  const toDirectory = (path: string | null) => {
    if (!path) return null;
    const normalized = path.replace(/\//g, "\\");
    const idx = normalized.lastIndexOf("\\");
    return idx > 0 ? normalized.slice(0, idx) : null;
  };

  const hydrateSessionDirectory = (nextTab: TabDto) => {
    const dir = toDirectory(nextTab.linked_path);
    if (dir) sessionSaveDirectory = dir;
  };

  const stickyLabelFor = (tabId: string) => `sticky-${tabId}`;

  const openStickyWindow = async (tabId: string) => {
    const label = stickyLabelFor(tabId);
    if (label === currentWindow.label) return;

    const existing = await WebviewWindow.getByLabel(label);
    if (existing) return;

    new WebviewWindow(label, {
      url: `/?tabId=${encodeURIComponent(tabId)}`,
      title: "sticky",
      width: STICKY_WIDTH,
      height: STICKY_HEIGHT,
      minWidth: 300,
      minHeight: 260,
      decorations: false,
      alwaysOnTop: true,
      resizable: true
    });
  };

  const setCurrentTab = (nextTab: TabDto) => {
    tab = nextTab;
    hydrateSessionDirectory(nextTab);
  };

  const syncTabContent = async (content: string, cursor: number) => {
    if (!tab) return;
    if (tab.content === content && tab.cursor === cursor) return;

    const current = tab;
    tab = { ...current, content, cursor, is_dirty: true };
    await updateTabContent(current.tab_id, content, cursor);
  };

  const createSticky = async () => {
    const created = await newNote();
    await openStickyWindow(created.tab_id);
  };

  const saveSticky = async () => {
    if (!tab) return;
    const current = tab;
    const result = await saveTab(current.tab_id).catch(() => null);
    if (!result) {
      const saveAsResult = await saveTabAs(current.tab_id, sessionSaveDirectory, current.title);
      if (!saveAsResult) return;
      setCurrentTab(saveAsResult.tab);
      return;
    }

    setCurrentTab(result.tab);
  };

  const confirmClose = (current: TabDto) => {
    if (!current.is_dirty && !current.is_temp) return true;
    return window.confirm(
      "Deze sticky heeft niet-opgeslagen wijzigingen. Weet je zeker dat je wilt sluiten?"
    );
  };

  const finalizeClose = async () => {
    if (closeInProgress) return;
    closeInProgress = true;

    const current = tab;
    if (current) {
      await closeTab(current.tab_id).catch(() => null);
    }

    await persistSession().catch(() => null);
    await currentWindow.destroy();
  };

  const requestClose = async () => {
    if (closeInProgress) return;
    if (tab && !confirmClose(tab)) return;
    await finalizeClose();
  };

  const bootstrap = async () => {
    const restored = await listRestoreSession();

    if (requestedTabId) {
      const requested = restored.find((candidate) => candidate.tab_id === requestedTabId);
      if (requested) {
        setCurrentTab(requested);
        return;
      }

      const fallback = await newNote();
      setCurrentTab(fallback);
      return;
    }

    if (restored.length === 0) {
      const first = await newNote();
      setCurrentTab(first);
      return;
    }

    setCurrentTab(restored[0]);
    for (const restoredTab of restored.slice(1)) {
      await openStickyWindow(restoredTab.tab_id);
    }
  };

  $: if (tab) {
    void currentWindow.setTitle(`${tab.title}${tab.is_dirty ? " *" : ""}`);
  }

  onMount(() => {
    let unlistenCloseRequest: (() => void) | null = null;

    void (async () => {
      await bootstrap();
      unlistenCloseRequest = await currentWindow.onCloseRequested(async (event) => {
        event.preventDefault();
        await requestClose();
      });
    })();

    const handleBeforeUnload = () => {
      void persistSession();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      if (unlistenCloseRequest) {
        unlistenCloseRequest();
      }
    };
  });
</script>

<main class="sticky-window">
  <header class="toolbar">
    <div class="drag-strip" data-tauri-drag-region>
      <span>{tab ? `${tab.title}${tab.is_dirty ? " *" : ""}` : "sticky"}</span>
    </div>

    <div class="actions">
      <button class="action" title="Nieuwe sticky" on:click={() => void createSticky()}>+</button>
      <button class="action" title="Opslaan" disabled={!tab} on:click={() => void saveSticky()}>
        Save
      </button>
      <button class="action close" title="Sluiten" on:click={() => void requestClose()}>x</button>
    </div>
  </header>

  <section class="editor-shell">
    {#if tab}
      <MarkdownEditor content={tab.content} onChange={(value, cursor) => void syncTabContent(value, cursor)} />
    {:else}
      <div class="empty">Sticky laden...</div>
    {/if}
  </section>
</main>

<style>
  :global(body) {
    margin: 0;
    font-family: "Trebuchet MS", "Segoe UI", sans-serif;
    background: transparent;
    color: #2f2a1f;
    overflow: hidden;
  }

  .sticky-window {
    height: 100vh;
    display: grid;
    grid-template-rows: 36px 1fr;
    border: 1px solid rgba(84, 65, 20, 0.35);
    border-radius: 14px;
    background:
      linear-gradient(160deg, #f7e993 0%, #f6de76 55%, #efcf59 100%),
      radial-gradient(circle at 0% 0%, rgba(255, 255, 255, 0.55) 0%, transparent 60%);
    box-shadow:
      0 18px 34px rgba(34, 24, 8, 0.28),
      inset 0 -1px 0 rgba(255, 255, 255, 0.5);
    overflow: hidden;
  }

  .toolbar {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    padding: 0 6px 0 10px;
    border-bottom: 1px dashed rgba(56, 45, 20, 0.35);
    background: rgba(255, 248, 210, 0.76);
    backdrop-filter: blur(2px);
  }

  .drag-strip {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    letter-spacing: 0.03em;
    color: rgba(44, 34, 12, 0.82);
    user-select: none;
  }

  .actions {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .action {
    min-width: 28px;
    height: 24px;
    border: 1px solid rgba(82, 66, 27, 0.38);
    border-radius: 7px;
    background: rgba(255, 255, 255, 0.72);
    color: #2c2414;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    padding: 0 8px;
  }

  .action:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.92);
  }

  .action:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .action.close {
    color: #8a291f;
    border-color: rgba(138, 41, 31, 0.35);
  }

  .editor-shell {
    min-height: 0;
    background: rgba(255, 253, 228, 0.62);
  }

  .editor-shell :global(.cm-editor) {
    height: 100%;
    background: transparent;
  }

  .editor-shell :global(.cm-content) {
    color: #2b230f;
    caret-color: #120d05;
  }

  .editor-shell :global(.cm-cursor),
  .editor-shell :global(.cm-dropCursor) {
    border-left-color: #120d05 !important;
    border-left-width: 2px;
  }

  .editor-shell :global(.cm-scroller) {
    padding: 14px 14px 18px;
    font-size: 14px;
    line-height: 1.45;
    color: #2b230f;
  }

  .empty {
    padding: 18px;
    font-size: 13px;
    color: rgba(43, 35, 15, 0.6);
  }
</style>
