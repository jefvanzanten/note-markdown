<script lang="ts">
  import { loadWorkspaceName, saveDirectoryHandle, saveFallbackWorkspace, type CachedFile } from "../../services/workspacePersistence";
  import { buildFallbackEntries, readFileEntry, type FileEntry } from "../../services/fsAccess";
  import { registerWorkspace } from "../../services/serverApi";
  import FolderBrowser from "./FolderBrowser.svelte";

  export let existingHandle: FileSystemDirectoryHandle | null = null;
  export let serverMode = false;
  export let recentWorkspaces: { path: string; name: string }[] = [];
  export let onChosen: (path: string) => void;

  const supportsDirectoryPicker = "showDirectoryPicker" in window;
  const savedName = loadWorkspaceName();

  let workspaceName = savedName ?? "";
  let folderPath = "";
  let error = "";
  let showBrowser = false;
  let fileInput: HTMLInputElement;

  function onBrowserSelected(e: CustomEvent<{ path: string }>) {
    folderPath = e.detail.path;
    if (!workspaceName) workspaceName = folderPath.split(/[\\/]/).filter(Boolean).at(-1) ?? "";
    showBrowser = false;
  }

  async function openServerWorkspace() {
    if (!folderPath.trim()) { error = "Enter a folder path."; return; }
    error = "";
    try {
      const name = workspaceName.trim() || folderPath.split(/[\\/]/).filter(Boolean).at(-1) || "workspace";
      await registerWorkspace(folderPath.trim(), name);
      onChosen(folderPath.trim());
    } catch (e) {
      error = `Could not open folder: ${(e as Error).message}`;
    }
  }

  function openRecent(recent: { path: string; name: string }) {
    folderPath = recent.path;
    workspaceName = recent.name;
    openServerWorkspace();
  }

  async function reopenExisting() {
    if (!existingHandle) return;
    try {
      await existingHandle.requestPermission({ mode: "readwrite" });
      await saveDirectoryHandle(existingHandle);
      onChosen(`fsa:${existingHandle.name}`);
    } catch {
      error = "Permission denied.";
    }
  }

  async function chooseFolder() {
    try {
      const handle = await window.showDirectoryPicker({ mode: "readwrite" });
      if (!workspaceName) workspaceName = handle.name;
      await saveDirectoryHandle(handle);
      onChosen(`fsa:${handle.name}`);
    } catch (e) {
      const err = e as DOMException;
      if (err.name === "AbortError") return;
      error = err.name === "SecurityError" ? "Permission denied by the browser." : `Could not open folder: ${err.name}`;
    }
  }

  async function onFilesSelected() {
    const files = fileInput.files;
    if (!files || files.length === 0) return;
    const { entries, rootName } = buildFallbackEntries(files);
    const name = workspaceName || rootName;
    workspaceName = name;

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
    onChosen(`fallback:${name}`);
  }
</script>

<div class="picker-overlay">
  <div class="picker-card">
    <h1>note-markdown</h1>

    {#if serverMode}
      <p class="subtitle">Open a notes folder to get started.</p>

      <div class="path-row">
        <div class="name-row" style="flex:1">
          <label for="ws-path">Folder path</label>
          <input
            id="ws-path"
            type="text"
            placeholder="C:\Users\you\Notes"
            bind:value={folderPath}
            on:keydown={(e) => e.key === "Enter" && openServerWorkspace()}
          />
        </div>
        <button class="btn-browse" on:click={() => (showBrowser = true)} title="Browse for folder">Browse</button>
      </div>

      <div class="name-row">
        <label for="ws-name">Workspace name (optional)</label>
        <input id="ws-name" type="text" placeholder="My notes" bind:value={workspaceName} />
      </div>

      <button class="btn-primary" on:click={openServerWorkspace}>Open workspace</button>

      {#if recentWorkspaces.length > 0}
        <div class="recent-section">
          <p class="recent-label">Recent</p>
          {#each recentWorkspaces as recent (recent.path)}
            <button class="recent-item" on:click={() => openRecent(recent)}>
              <span class="recent-name">{recent.name}</span>
              <span class="recent-path">{recent.path}</span>
            </button>
          {/each}
        </div>
      {/if}

    {:else}
      {#if existingHandle && savedName}
        <p class="subtitle">Reopen your previous workspace or choose a different folder.</p>
        <button class="btn-primary" on:click={reopenExisting}>Reopen "{savedName}"</button>
        <div class="divider">or</div>
      {:else}
        <p class="subtitle">Choose a folder to use as your workspace.</p>
      {/if}

      <div class="name-row">
        <label for="ws-name">Workspace name</label>
        <input id="ws-name" type="text" placeholder="My notes" bind:value={workspaceName} />
      </div>

      {#if supportsDirectoryPicker}
        <button class="btn-secondary" on:click={chooseFolder}>Choose folder…</button>
      {:else}
        <button class="btn-secondary" on:click={() => fileInput.click()}>Select folder…</button>
        <p class="hint">Your browser doesn't support the File System API. Files will be read-only — use Ctrl+S to download changes.</p>
      {/if}

      <input bind:this={fileInput} type="file" webkitdirectory multiple style="display:none" on:change={onFilesSelected} />
    {/if}

    {#if error}
      <p class="error">{error}</p>
    {/if}
  </div>
</div>

{#if showBrowser}
  <FolderBrowser
    on:selected={onBrowserSelected}
    on:cancel={() => (showBrowser = false)}
  />
{/if}

<style>
  .picker-overlay {
    position: fixed; inset: 0;
    display: flex; align-items: center; justify-content: center;
    background: var(--bg, #1e1e1e); z-index: 100;
  }

  .picker-card {
    background: var(--surface, #2d2d2d);
    border: 1px solid var(--border, #444);
    border-radius: 8px; padding: 2rem; width: 420px;
    display: flex; flex-direction: column; gap: 0.75rem;
    max-height: 90vh; overflow-y: auto;
  }

  h1 { margin: 0; font-size: 1.4rem; font-weight: 600; color: var(--text, #e0e0e0); }

  .subtitle { margin: 0; font-size: 0.875rem; color: var(--text-muted, #999); }

  .path-row { display: flex; align-items: flex-end; gap: 8px; }

  .name-row { display: flex; flex-direction: column; gap: 0.25rem; }

  label { font-size: 0.8rem; color: var(--text-muted, #999); }

  input[type="text"] {
    background: var(--bg, #1e1e1e);
    border: 1px solid var(--border, #444); border-radius: 4px;
    color: var(--text, #e0e0e0); padding: 0.4rem 0.6rem;
    font-size: 0.9rem; outline: none; font-family: monospace; width: 100%;
  }

  input[type="text"]:focus { border-color: var(--accent, #5c9cf5); }

  .btn-primary, .btn-secondary, .btn-browse {
    border: none; border-radius: 4px; padding: 0.5rem 1rem;
    font-size: 0.9rem; cursor: pointer; transition: opacity 0.15s; white-space: nowrap;
  }

  .btn-primary { background: var(--accent, #5c9cf5); color: #fff; }

  .btn-secondary {
    background: var(--surface2, #3a3a3a); color: var(--text, #e0e0e0);
    border: 1px solid var(--border, #444);
  }

  .btn-browse {
    background: var(--surface2, #3a3a3a); color: var(--text, #e0e0e0);
    border: 1px solid var(--border, #444); padding: 0.4rem 0.75rem;
    flex-shrink: 0;
  }

  .btn-primary:hover, .btn-secondary:hover, .btn-browse:hover { opacity: 0.85; }

  .divider { text-align: center; color: var(--text-muted, #999); font-size: 0.8rem; }

  .hint { margin: 0; font-size: 0.78rem; color: var(--text-muted, #888); line-height: 1.4; }

  .error { color: #f87171; font-size: 0.85rem; margin: 0; }

  /* Recent workspaces */
  .recent-section {
    display: flex; flex-direction: column; gap: 4px;
    border-top: 1px solid var(--border, #444); padding-top: 0.75rem; margin-top: 0.25rem;
  }

  .recent-label {
    margin: 0 0 4px; font-size: 0.75rem; font-weight: 600;
    color: var(--text-muted, #888); text-transform: uppercase; letter-spacing: 0.05em;
  }

  .recent-item {
    display: flex; flex-direction: column; align-items: flex-start; gap: 1px;
    background: none; border: 1px solid transparent; border-radius: 5px;
    padding: 7px 10px; cursor: pointer; text-align: left; width: 100%;
    transition: background 0.1s, border-color 0.1s;
  }

  .recent-item:hover {
    background: var(--hover, rgba(255,255,255,0.06));
    border-color: var(--border, #444);
  }

  .recent-name { font-size: 0.875rem; color: var(--text, #e0e0e0); font-weight: 500; }

  .recent-path {
    font-size: 0.75rem; color: var(--text-muted, #888);
    font-family: monospace; overflow: hidden; text-overflow: ellipsis;
    white-space: nowrap; width: 100%;
  }
</style>
