<script lang="ts">
  import { onMount } from "svelte";
  import MarkdownEditor from "@note/editor";
  import {
    closeTab,
    listRestoreSession,
    newNote,
    openFile,
    persistSession,
    saveTab,
    saveTabAs,
    updateTabContent
  } from "@note/api";
  import { activeTabId, tabs, upsertTab, removeTab } from "@note/state";
  import type { TabDto } from "@note/types";
  import {
    DEFAULT_EDITOR_FONT_SIZE_PX,
    EDITOR_FONT_SIZE_STEP_PX,
    clampEditorFontSize,
    isZoomInShortcut,
    isZoomOutShortcut,
    loadEditorFontSize,
    removeEditorFontSize,
    runAction,
    saveEditorFontSize,
    saveWithFallback,
    toDirectory
  } from "@note/utils";
  import HamburgerMenu from "./lib/components/HamburgerMenu.svelte";
  import TabsList from "./lib/components/TabsList.svelte";

  const CLIENT_EDITOR_ZOOM_STORAGE_KEY = "note-markdown-client-editor-zoom-v1";

  let currentTabs: TabDto[] = [];
  let currentActiveTab: TabDto | null = null;
  let sessionSaveDirectory: string | null = null;
  let contextMenu: { x: number; y: number; tabId: string } | null = null;
  let contextMenuElement: HTMLDivElement | null = null;
  let errorMessage: string | null = null;
  let editorFontSize = DEFAULT_EDITOR_FONT_SIZE_PX;

  const clearError = () => {
    errorMessage = null;
  };

  const setError = (message: string) => {
    errorMessage = message;
  };

  const hydrateSessionDirectory = (tab: TabDto) => {
    const dir = toDirectory(tab.linked_path);
    if (dir) sessionSaveDirectory = dir;
  };

  $: currentTabs = $tabs;
  $: currentActiveTab = currentTabs.find((t) => t.tab_id === $activeTabId) ?? null;
  $: editorFontSize = currentActiveTab
    ? loadEditorFontSize(CLIENT_EDITOR_ZOOM_STORAGE_KEY, currentActiveTab.tab_id)
    : DEFAULT_EDITOR_FONT_SIZE_PX;

  const setActive = (tabId: string) => {
    activeTabId.set(tabId);
  };

  const adjustActiveEditorZoom = (delta: number) => {
    if (!currentActiveTab) return;
    const nextSize = clampEditorFontSize(editorFontSize + delta);
    if (nextSize === editorFontSize) return;
    editorFontSize = nextSize;
    saveEditorFontSize(CLIENT_EDITOR_ZOOM_STORAGE_KEY, currentActiveTab.tab_id, nextSize);
  };

  const syncTabContent = async (sessionId: string, content: string, cursor: number) => {
    const tab = currentTabs.find((t) => t.tab_id === sessionId);
    if (!tab) return;
    const contentChanged = tab.content !== content;
    const cursorChanged = tab.cursor !== cursor;
    if (!contentChanged && !cursorChanged) return;

    upsertTab({
      ...tab,
      content,
      cursor,
      is_dirty: contentChanged ? true : tab.is_dirty,
    });
    await updateTabContent(tab.tab_id, content, cursor);
  };

  const createNew = async () => {
    clearError();
    const tab = await newNote();
    upsertTab(tab);
    setActive(tab.tab_id);
  };

  const openExisting = async () => {
    clearError();
    const outcome = await runAction(() => openFile());
    if (outcome.error) {
      setError(outcome.error);
      return;
    }

    const tab = outcome.result;
    if (!tab) return;

    upsertTab(tab);
    hydrateSessionDirectory(tab);
    setActive(tab.tab_id);
  };

  const saveActive = async () => {
    if (!currentActiveTab) return;
    clearError();

    const outcome = await saveWithFallback({
      save: () => saveTab(currentActiveTab.tab_id),
      saveAs: () => saveTabAs(currentActiveTab.tab_id, sessionSaveDirectory, currentActiveTab.title)
    });

    if (outcome.error) {
      setError(outcome.error);
      return;
    }

    if (!outcome.result) return;

    upsertTab(outcome.result.tab);
    hydrateSessionDirectory(outcome.result.tab);
  };

  const saveActiveAs = async () => {
    if (!currentActiveTab) return;
    clearError();

    const outcome = await runAction(() =>
      saveTabAs(currentActiveTab.tab_id, sessionSaveDirectory, currentActiveTab.title)
    );

    if (outcome.error) {
      setError(outcome.error);
      return;
    }

    if (!outcome.result) return;

    upsertTab(outcome.result.tab);
    hydrateSessionDirectory(outcome.result.tab);
  };

  const closeTabById = async (tabId: string) => {
    if (currentTabs.length <= 1) return;
    await closeTab(tabId);
    removeEditorFontSize(CLIENT_EDITOR_ZOOM_STORAGE_KEY, tabId);
    removeTab(tabId);
    if ($activeTabId === tabId) {
      const next = currentTabs.find((t) => t.tab_id !== tabId) ?? null;
      activeTabId.set(next?.tab_id ?? null);
    }
  };

  const closeActive = () => {
    if (!currentActiveTab) return;
    void closeTabById(currentActiveTab.tab_id);
  };

  const openContextMenu = (e: MouseEvent, tabId: string) => {
    e.preventDefault();
    contextMenu = { x: e.clientX, y: e.clientY, tabId };
  };

  const closeContextMenu = () => {
    contextMenu = null;
  };

  const closeContextTab = () => {
    if (contextMenu) void closeTabById(contextMenu.tabId);
    closeContextMenu();
  };

  const bootstrap = async () => {
    clearError();
    const restored = await listRestoreSession().catch((error) => {
      setError(error instanceof Error ? error.message : "Sessie herstellen is mislukt.");
      return [] as TabDto[];
    });

    if (restored.length > 0) {
      for (const tab of restored) {
        upsertTab(tab);
        hydrateSessionDirectory(tab);
      }
      setActive(restored[0].tab_id);
      return;
    }
    await createNew();
  };

  onMount(() => {
    void bootstrap();

    const handleKeydown = (e: KeyboardEvent) => {
      const hasCommandModifier = e.ctrlKey || e.metaKey;
      if (!hasCommandModifier) return;

      if (isZoomInShortcut(e)) {
        e.preventDefault();
        adjustActiveEditorZoom(EDITOR_FONT_SIZE_STEP_PX);
        return;
      }

      if (isZoomOutShortcut(e)) {
        e.preventDefault();
        adjustActiveEditorZoom(-EDITOR_FONT_SIZE_STEP_PX);
        return;
      }

      const key = e.key.toLowerCase();
      if (key === "n") {
        e.preventDefault();
        void createNew();
      } else if (key === "o") {
        e.preventDefault();
        void openExisting();
      } else if (key === "s") {
        e.preventDefault();
        if (e.shiftKey) void saveActiveAs();
        else void saveActive();
      } else if (key === "w") {
        e.preventDefault();
        closeActive();
      }
    };

    const handlePointerDown = (e: PointerEvent) => {
      if (!contextMenu || e.button !== 0) return;
      const target = e.target as Node | null;
      if (target && contextMenuElement?.contains(target)) return;
      closeContextMenu();
    };

    const handleBeforeUnload = () => { void persistSession(); };

    window.addEventListener("keydown", handleKeydown);
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("keydown", handleKeydown);
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  });
</script>

<main class="app-shell">
  {#if errorMessage}
    <div class="error-banner" role="alert">
      <span>{errorMessage}</span>
      <button on:click={clearError} aria-label="Melding sluiten">Sluiten</button>
    </div>
  {/if}

  <section class="tabs">
    <HamburgerMenu
      canSave={!!currentActiveTab}
      onOpenMarkdown={() => void openExisting()}
      onNewTab={() => void createNew()}
      onSave={() => void saveActive()}
      onSaveAs={() => void saveActiveAs()}
    />

    <TabsList
      tabs={currentTabs}
      activeTabId={$activeTabId}
      onTabClick={setActive}
      onContextMenu={openContextMenu}
    />
  </section>

  <section class="editor" style="--editor-font-size: {editorFontSize}px">
    {#if currentActiveTab}
      {#key currentActiveTab.tab_id}
        <MarkdownEditor
          sessionId={currentActiveTab.tab_id}
          content={currentActiveTab.content}
          onChange={(sessionId, value, cursor) => syncTabContent(sessionId, value, cursor)}
        />
      {/key}
    {:else}
      <div class="empty">Geen tab geopend</div>
    {/if}
  </section>
</main>

{#if contextMenu}
  <div
    bind:this={contextMenuElement}
    class="context-menu"
    style="left: {contextMenu.x}px; top: {contextMenu.y}px"
  >
    <button
      class:disabled={currentTabs.length <= 1}
      disabled={currentTabs.length <= 1}
      on:click={closeContextTab}
    >
      Sluit tab
    </button>
  </div>
{/if}

<style>
  :global(body) {
    margin: 0;
    font-family: "Segoe UI", sans-serif;
    background: #0f172a;
    color: #e2e8f0;
  }

  .app-shell {
    height: 100vh;
    display: grid;
    grid-template-rows: auto auto 1fr;
    position: relative;
  }

  .error-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 14px;
    background: #7f1d1d;
    color: #fee2e2;
    border-bottom: 1px solid #b91c1c;
  }

  .error-banner button {
    border: 1px solid rgba(254, 226, 226, 0.35);
    background: rgba(0, 0, 0, 0.18);
    color: inherit;
    border-radius: 999px;
    padding: 4px 10px;
    cursor: pointer;
  }

  .tabs {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    background: #0b1220;
    border-bottom: 1px solid #334155;
  }

  .editor {
    min-height: 0;
  }

  .editor :global(.cm-editor) {
    font-size: var(--editor-font-size, 14px);
  }

  .editor :global(.cm-content) {
    min-height: 100%;
    min-width: 100%;
    box-sizing: border-box;
    padding: 16px 0 56px;
  }

  .editor :global(.cm-scroller) {
    padding: 0;
    font-size: var(--editor-font-size, 14px);
  }

  .editor :global(.cm-line) {
    padding: 0 16px;
  }

  .empty {
    padding: 24px;
    color: #94a3b8;
  }

  .context-menu {
    position: fixed;
    z-index: 100;
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 6px;
    padding: 4px;
    min-width: 140px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  }

  .context-menu button {
    display: block;
    width: 100%;
    background: none;
    border: none;
    color: #f8fafc;
    padding: 7px 12px;
    text-align: left;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
  }

  .context-menu button:hover:not(:disabled) {
    background: #334155;
  }

  .context-menu button:disabled {
    color: #475569;
    cursor: not-allowed;
  }
</style>
