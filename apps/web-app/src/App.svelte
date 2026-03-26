<script lang="ts">
  import { onMount } from "svelte";
  import MarkdownEditor from "@note/editor";
  import { tabs, activeTabId, upsertTab, removeTab } from "@note/state";
  import type { TabDto } from "@note/types";

  import WorkspacePicker from "./lib/components/WorkspacePicker.svelte";
  import CollapseToggle from "./lib/components/CollapseToggle.svelte";
  import FileList from "./lib/components/FileList.svelte";
  import TabBar from "./lib/components/TabBar.svelte";

  import { workspaceState, workspaceFiles, workspaceName, buildHandleMap } from "./lib/stores/workspace";
  import type { WorkspaceMode } from "./lib/stores/workspace";
  import type { FileEntry } from "./services/fsAccess";
  import { scanWorkspace, readFileEntry, writeFile, downloadFile } from "./services/fsAccess";
  import {
    loadDirectoryHandle,
    saveDirectoryHandle,
    saveWorkspaceName,
    saveRecentWorkspace,
    saveFallbackWorkspace,
    loadFallbackWorkspace,
    type CachedFile
  } from "./services/workspacePersistence";
  import {
    isServerMode,
    getServerWorkspace,
    listServerFiles,
    readServerFile,
    writeServerFile
  } from "./services/serverApi";

  type AppStatus = "loading" | "picking" | "ready";

  let status: AppStatus = "loading";
  let existingHandle: FileSystemDirectoryHandle | null = null;
  let serverModeAvailable = false;
  let sidebarCollapsed = false;
  let errorMessage = "";

  $: currentTabs = $tabs;
  $: currentActiveTabId = $activeTabId;
  $: currentActiveTab = currentTabs.find((t) => t.tab_id === currentActiveTabId) ?? null;
  $: activeFilePath = currentActiveTab?.linked_path ?? null;
  $: wsMode = $workspaceState.status === "ready" ? $workspaceState.mode : null;

  onMount(async () => {
    // Priority 1: Vite dev server API (works in any browser, full read/write)
    if (await isServerMode()) {
      serverModeAvailable = true;
      const config = await getServerWorkspace();
      if (config) {
        await openServerWorkspace(config.name);
        return;
      }
      status = "picking";
      return;
    }

    // Priority 2: File System Access API (Chrome/Edge with full persistence)
    if ("showDirectoryPicker" in window) {
      try {
        const handle = await loadDirectoryHandle();
        if (handle) {
          const perm = await handle.queryPermission({ mode: "readwrite" });
          if (perm === "granted") {
            await openFsaWorkspace(handle, null);
            return;
          }
          existingHandle = handle;
        }
      } catch {
        // IndexedDB unavailable or handle stale
      }
      status = "picking";
      return;
    }

    // Priority 3: Fallback cache (Brave/Firefox with content stored in IndexedDB)
    try {
      const cached = await loadFallbackWorkspace();
      if (cached) {
        const files: FileEntry[] = cached.files.map((f) => ({
          name: f.name,
          path: f.path,
          cachedContent: f.content
        }));
        workspaceState.set({ status: "ready", name: cached.name, files, handleMap: new Map(), mode: "fallback" });
        status = "ready";
        return;
      }
    } catch {
      // cache unavailable
    }

    status = "picking";
  });

  // --- Workspace openers ---

  async function openServerWorkspace(name: string): Promise<void> {
    workspaceState.set({ status: "loading" });
    try {
      const serverFiles = await listServerFiles();
      const files: FileEntry[] = serverFiles.map((f) => ({ name: f.name, path: f.path }));
      const config = await getServerWorkspace();
      workspaceState.set({ status: "ready", name, files, handleMap: new Map(), mode: "server" });
      saveWorkspaceName(name);
      if (config) saveRecentWorkspace(config.path, name);
      status = "ready";
    } catch (e) {
      errorMessage = `Failed to load workspace: ${(e as Error).message}`;
      status = "picking";
    }
  }

  async function openFsaWorkspace(handle: FileSystemDirectoryHandle, name: string | null): Promise<void> {
    workspaceState.set({ status: "loading" });
    try {
      const files = await scanWorkspace(handle);
      const handleMap = buildHandleMap(files);
      const wsName = name ?? handle.name;
      workspaceState.set({ status: "ready", dirHandle: handle, name: wsName, files, handleMap, mode: "fsa" });
      await saveDirectoryHandle(handle);
      saveWorkspaceName(wsName);
      status = "ready";
    } catch (e) {
      errorMessage = `Failed to load workspace: ${(e as Error).message}`;
      status = "picking";
    }
  }

  async function openFallbackWorkspace(entries: FileEntry[], name: string): Promise<void> {
    workspaceState.set({ status: "loading" });
    const enriched: FileEntry[] = [];
    const cacheFiles: CachedFile[] = [];

    for (const entry of entries) {
      try {
        const content = await readFileEntry(entry);
        enriched.push({ ...entry, cachedContent: content });
        cacheFiles.push({ path: entry.path, name: entry.name, content });
      } catch {
        enriched.push(entry);
      }
    }

    await saveFallbackWorkspace(name, cacheFiles);
    saveWorkspaceName(name);
    workspaceState.set({ status: "ready", name, files: enriched, handleMap: new Map(), mode: "fallback" });
    status = "ready";
  }

  // --- Event handler from WorkspacePicker ---

  function onWorkspaceSelected(event: CustomEvent<{
    handle?: FileSystemDirectoryHandle;
    entries?: FileEntry[];
    name: string;
    mode: WorkspaceMode;
  }>) {
    const { handle, entries, name, mode } = event.detail;
    if (mode === "server") {
      openServerWorkspace(name);
    } else if (mode === "fsa" && handle) {
      openFsaWorkspace(handle, name);
    } else if (mode === "fallback" && entries) {
      openFallbackWorkspace(entries, name);
    }
  }

  // --- File open ---

  async function onFileClick(path: string): Promise<void> {
    const existing = currentTabs.find((t) => t.linked_path === path);
    if (existing) { activeTabId.set(existing.tab_id); return; }

    const ws = $workspaceState;
    if (ws.status !== "ready") return;

    const fileEntry = ws.files.find((f) => f.path === path);
    if (!fileEntry) return;

    try {
      let content: string;
      if (ws.mode === "server") {
        content = await readServerFile(path);
      } else {
        content = await readFileEntry(fileEntry);
      }
      const tab: TabDto = {
        tab_id: crypto.randomUUID(),
        title: fileEntry.name,
        is_temp: false,
        is_dirty: false,
        linked_path: path,
        content,
        cursor: 0
      };
      upsertTab(tab);
      activeTabId.set(tab.tab_id);
    } catch {
      errorMessage = `Failed to open ${path}`;
    }
  }

  function syncContent(sessionId: string, value: string, cursor: number): void {
    const tab = currentTabs.find((t) => t.tab_id === sessionId);
    if (!tab || tab.content === value) return;
    upsertTab({ ...tab, content: value, cursor, is_dirty: true });
  }

  // --- Save ---

  async function saveActive(): Promise<void> {
    if (!currentActiveTab) return;
    const ws = $workspaceState;
    if (ws.status !== "ready") return;

    // Server mode: direct write via Vite API
    if (ws.mode === "server" && currentActiveTab.linked_path) {
      try {
        await writeServerFile(currentActiveTab.linked_path, currentActiveTab.content);
        upsertTab({ ...currentActiveTab, is_dirty: false });
      } catch {
        errorMessage = "Failed to save file.";
      }
      return;
    }

    // FSA mode: write via FileSystemFileHandle
    if (ws.mode === "fsa" && currentActiveTab.linked_path) {
      const fileHandle = ws.handleMap.get(currentActiveTab.linked_path);
      if (!fileHandle) return;
      try {
        await writeFile(fileHandle, currentActiveTab.content);
        upsertTab({ ...currentActiveTab, is_dirty: false });
      } catch {
        errorMessage = "Failed to save file.";
      }
      return;
    }

    // Fallback mode: save-picker or download, then update cache
    if (ws.mode === "fallback") {
      const filename = currentActiveTab.title + ".md";
      if ("showSaveFilePicker" in window) {
        try {
          const handle = await window.showSaveFilePicker({
            suggestedName: filename,
            types: [{ description: "Markdown", accept: { "text/markdown": [".md"] } }]
          });
          await writeFile(handle, currentActiveTab.content);
        } catch (e) {
          if ((e as DOMException).name === "AbortError") return;
          downloadFile(filename, currentActiveTab.content);
        }
      } else {
        downloadFile(filename, currentActiveTab.content);
      }
      // Update the cache so the saved version persists on reload
      const updatedFiles = ws.files.map((f) =>
        f.path === currentActiveTab.linked_path ? { ...f, cachedContent: currentActiveTab.content } : f
      );
      workspaceState.set({ ...ws, files: updatedFiles });
      await saveFallbackWorkspace(
        ws.name,
        updatedFiles.map((f) => ({ path: f.path, name: f.name, content: f.cachedContent ?? "" }))
      );
      upsertTab({ ...currentActiveTab, is_dirty: false });
    }
  }

  function closeTab(tabId: string): void {
    removeTab(tabId);
    const remaining = $tabs;
    activeTabId.set(remaining.length > 0 ? remaining[remaining.length - 1].tab_id : null);
  }

  function onKeyDown(e: KeyboardEvent): void {
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key === "s") { e.preventDefault(); saveActive(); }
    if (ctrl && e.key === "w") { e.preventDefault(); if (currentActiveTabId) closeTab(currentActiveTabId); }
  }
</script>

<svelte:window on:keydown={onKeyDown} />

{#if status === "loading"}
  <div class="splash">Loading…</div>
{:else if status === "picking"}
  <WorkspacePicker
    {existingHandle}
    serverMode={serverModeAvailable}
    on:workspace-selected={onWorkspaceSelected}
  />
{:else}
  <div class="app-shell" class:collapsed={sidebarCollapsed} style="--sidebar-width: {sidebarCollapsed ? 0 : 220}px">
    <!-- Header row -->
    <div class="header-toggle">
      <CollapseToggle collapsed={sidebarCollapsed} onToggle={() => (sidebarCollapsed = !sidebarCollapsed)} />
    </div>
    <div class="header-files">
      <span class="workspace-name" title={$workspaceName ?? ""}>{$workspaceName ?? ""}</span>
      {#if wsMode === "fallback"}
        <button class="reload-btn" title="Select a new folder" on:click={() => (status = "picking")}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M10 6A4 4 0 1 1 6 2M6 2L8.5 4.5M6 2L3.5 4.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      {/if}
    </div>
    <div class="header-tabs">
      <TabBar
        tabs={currentTabs}
        activeTabId={currentActiveTabId}
        onTabClick={(id) => activeTabId.set(id)}
        onTabClose={closeTab}
      />
    </div>

    <!-- Content row -->
    <div class="sidebar-spacer"></div>
    <div class="sidebar">
      <FileList files={$workspaceFiles} {activeFilePath} {onFileClick} />
    </div>
    <div class="editor-pane">
      {#if wsMode === "fallback"}
        <div class="fallback-banner">
          Read-only mode — Ctrl+S downloads the file. For full write support run the app with <code>pnpm run web-app:dev</code>.
        </div>
      {/if}
      {#if errorMessage}
        <div class="error-banner">
          {errorMessage}
          <button on:click={() => (errorMessage = "")}>×</button>
        </div>
      {/if}
      {#if currentActiveTab}
        <MarkdownEditor
          sessionId={currentActiveTab.tab_id}
          content={currentActiveTab.content}
          onChange={syncContent}
        />
      {:else}
        <div class="empty-editor"><p>Open a file from the list on the left.</p></div>
      {/if}
    </div>
  </div>
{/if}

<style>
  :global(*, *::before, *::after) { box-sizing: border-box; }

  :global(body) {
    margin: 0;
    padding: 0;
    background: #1e1e1e;
    color: #e0e0e0;
    font-family: system-ui, sans-serif;
    height: 100vh;
    overflow: hidden;
  }

  :global(#app) {
    height: 100vh;
    display: flex;
    flex-direction: column;
  }

  .splash {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100vh;
    color: #777;
    font-size: 0.9rem;
  }

  .app-shell {
    height: 100vh;
    display: grid;
    grid-template-rows: 36px 1fr;
    grid-template-columns: 28px var(--sidebar-width) 1fr;
    transition: grid-template-columns 0.18s ease;
    overflow: hidden;

    --bg: #1e1e1e;
    --surface: #2d2d2d;
    --surface2: #3a3a3a;
    --border: #333;
    --hover: rgba(255, 255, 255, 0.06);
    --active: rgba(92, 156, 245, 0.15);
    --text: #e0e0e0;
    --text-muted: #999;
    --accent: #5c9cf5;
  }

  .header-toggle {
    grid-row: 1; grid-column: 1;
    display: flex; align-items: center; justify-content: center;
    background: var(--surface); border-bottom: 1px solid var(--border); border-right: 1px solid var(--border);
  }

  .header-files {
    grid-row: 1; grid-column: 2;
    display: flex; align-items: center; gap: 4px; padding: 0 8px;
    background: var(--surface); border-bottom: 1px solid var(--border); border-right: 1px solid var(--border);
    overflow: hidden;
  }

  .app-shell.collapsed .header-files { width: 0; padding: 0; }

  .workspace-name {
    font-size: 0.8rem; color: var(--text-muted); white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis; font-weight: 500; flex: 1; min-width: 0;
  }

  .reload-btn {
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; width: 20px; height: 20px;
    background: none; border: none; cursor: pointer;
    color: var(--text-muted); border-radius: 3px; padding: 0;
  }
  .reload-btn:hover { background: var(--hover); color: var(--text); }

  .header-tabs {
    grid-row: 1; grid-column: 3;
    background: var(--surface); border-bottom: 1px solid var(--border); overflow: hidden;
  }

  .sidebar-spacer {
    grid-row: 2; grid-column: 1;
    background: var(--surface); border-right: 1px solid var(--border);
  }

  .sidebar {
    grid-row: 2; grid-column: 2;
    background: var(--surface); border-right: 1px solid var(--border);
    overflow: hidden; min-width: 0;
  }

  .editor-pane {
    grid-row: 2; grid-column: 3;
    overflow: hidden; display: flex; flex-direction: column;
    min-width: 0; background: var(--bg);
  }

  .empty-editor {
    display: flex; align-items: center; justify-content: center;
    height: 100%; color: var(--text-muted); font-size: 0.9rem;
  }

  .fallback-banner {
    background: #2a2a1a; color: #d4b96a;
    padding: 5px 12px; font-size: 0.8rem; flex-shrink: 0;
    border-bottom: 1px solid #3a3a1a;
  }

  .fallback-banner code {
    font-family: monospace; background: rgba(255,255,255,0.08);
    padding: 0 4px; border-radius: 3px;
  }

  .error-banner {
    display: flex; align-items: center; justify-content: space-between;
    background: #5a1a1a; color: #f87171;
    padding: 6px 12px; font-size: 0.85rem; flex-shrink: 0;
  }

  .error-banner button {
    background: none; border: none; color: inherit; cursor: pointer; font-size: 1rem; padding: 0 4px;
  }
</style>
