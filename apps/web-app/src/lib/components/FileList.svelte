<script lang="ts">
  import { onMount, tick } from "svelte";
  import { tabs } from "@note/state";
  import type { FileEntry } from "../../services/fsAccess";

  export let files: FileEntry[];
  export let activeFilePath: string | null;
  export let onFileClick: (path: string) => void;
  export let onRename: ((oldPath: string, newPath: string) => void) | null = null;
  export let onDelete: ((path: string, kind: "file" | "folder") => void) | null = null;
  export let storageKey = "collapsed-folders";

  type FolderNode = { kind: "folder"; name: string; path: string; children: TreeNode[] };
  type FileNode = { kind: "file"; name: string; path: string; entry: FileEntry };
  type TreeNode = FolderNode | FileNode;

  type DisplayItem =
    | { kind: "folder"; name: string; path: string; depth: number }
    | { kind: "file"; name: string; path: string; depth: number; entry: FileEntry };

  let collapsedFolders = new Set<string>();
  let contextMenu: { x: number; y: number; item: DisplayItem } | null = null;
  let renamingPath: string | null = null;
  let renameValue = "";
  let renameInput: HTMLInputElement | null = null;

  onMount(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) collapsedFolders = new Set(JSON.parse(saved) as string[]);
    } catch { /* ignore */ }
  });

  function buildTree(entries: FileEntry[]): TreeNode[] {
    const root: FolderNode = { kind: "folder", name: "", path: "", children: [] };

    for (const entry of entries) {
      const parts = entry.path.split("/");
      let current = root;

      for (let i = 0; i < parts.length - 1; i++) {
        const folderPath = parts.slice(0, i + 1).join("/");
        let folder = current.children.find(
          (n): n is FolderNode => n.kind === "folder" && n.path === folderPath
        );
        if (!folder) {
          folder = { kind: "folder", name: parts[i], path: folderPath, children: [] };
          current.children.push(folder);
        }
        current = folder;
      }

      current.children.push({ kind: "file", name: entry.name, path: entry.path, entry });
    }

    return root.children;
  }

  function flatten(nodes: TreeNode[], depth: number, collapsed: Set<string>): DisplayItem[] {
    const items: DisplayItem[] = [];
    for (const node of nodes) {
      if (node.kind === "folder") {
        items.push({ kind: "folder", name: node.name, path: node.path, depth });
        if (!collapsed.has(node.path)) {
          items.push(...flatten(node.children, depth + 1, collapsed));
        }
      } else {
        items.push({ kind: "file", name: node.name, path: node.path, depth, entry: node.entry });
      }
    }
    return items;
  }

  function toggleFolder(path: string) {
    const next = new Set(collapsedFolders);
    if (next.has(path)) {
      next.delete(path);
    } else {
      next.add(path);
    }
    collapsedFolders = next;
    try {
      localStorage.setItem(storageKey, JSON.stringify([...next]));
    } catch { /* ignore */ }
  }

  function openContextMenu(e: MouseEvent, item: DisplayItem): void {
    if (!onRename && !onDelete) return;
    e.preventDefault();
    e.stopPropagation();
    contextMenu = { x: e.clientX, y: e.clientY, item };
  }

  function closeContextMenu(): void {
    contextMenu = null;
  }

  async function startRename(item: DisplayItem): Promise<void> {
    closeContextMenu();
    renamingPath = item.path;
    renameValue = item.name;
    await tick();
    renameInput?.focus();
    renameInput?.select();
  }

  function submitRename(): void {
    if (!renamingPath || !onRename) {
      renamingPath = null;
      return;
    }
    const trimmed = renameValue.trim();
    const item = displayItems.find((i) => i.path === renamingPath);
    if (!item) {
      renamingPath = null;
      return;
    }
    if (trimmed && trimmed !== item.name) {
      let newPath: string;
      if (item.kind === "file") {
        const dotIdx = item.path.lastIndexOf(".");
        const ext = dotIdx >= 0 ? item.path.slice(dotIdx) : "";
        const slashIdx = item.path.lastIndexOf("/");
        const parent = slashIdx >= 0 ? item.path.slice(0, slashIdx + 1) : "";
        newPath = parent + trimmed + ext;
      } else {
        const slashIdx = item.path.lastIndexOf("/");
        const parent = slashIdx >= 0 ? item.path.slice(0, slashIdx + 1) : "";
        newPath = parent + trimmed;
      }
      const oldPath = renamingPath;
      renamingPath = null;
      onRename(oldPath, newPath);
    } else {
      renamingPath = null;
    }
  }

  function cancelRename(): void {
    renamingPath = null;
  }

  function onRenameKeyDown(e: KeyboardEvent): void {
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      submitRename();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelRename();
    }
  }

  function triggerDelete(item: DisplayItem): void {
    closeContextMenu();
    onDelete?.(item.path, item.kind);
  }

  $: tree = buildTree(files);
  $: displayItems = flatten(tree, 0, collapsedFolders);
  $: openPaths = new Set($tabs.map((t) => t.linked_path).filter(Boolean) as string[]);
  $: dirtyPaths = new Set(
    $tabs.filter((t) => t.is_dirty && t.linked_path).map((t) => t.linked_path) as string[]
  );
</script>

<svelte:window
  on:click={closeContextMenu}
  on:keydown={(e) => { if (e.key === "Escape") closeContextMenu(); }}
/>

<div class="file-list">
  {#each displayItems as item (item.path)}
    {#if item.kind === "folder"}
      <button
        class="folder-item"
        style="padding-left: {item.depth * 14 + 6}px"
        on:click={() => { if (renamingPath !== item.path) toggleFolder(item.path); }}
        on:contextmenu={(e) => openContextMenu(e, item)}
        title={item.path}
      >
        <svg
          class="chevron"
          class:collapsed={collapsedFolders.has(item.path)}
          width="10" height="10" viewBox="0 0 10 10"
          fill="none" xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M2 3L5 7L8 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <svg class="folder-icon" width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M1 3.5C1 2.67 1.67 2 2.5 2H5.5L7 3.5H11.5C12.33 3.5 13 4.17 13 5V10.5C13 11.33 12.33 12 11.5 12H2.5C1.67 12 1 11.33 1 10.5V3.5Z" stroke="currentColor" stroke-width="1.2" fill="none"/>
        </svg>
        {#if renamingPath === item.path}
          <!-- svelte-ignore a11y-click-events-have-key-events -->
          <input
            bind:this={renameInput}
            class="rename-input"
            type="text"
            bind:value={renameValue}
            on:keydown={onRenameKeyDown}
            on:blur={submitRename}
            on:click|stopPropagation
          />
        {:else}
          <span class="item-name">{item.name}</span>
        {/if}
      </button>
    {:else}
      <button
        class="file-item"
        class:active={item.path === activeFilePath}
        style="padding-left: {item.depth * 14 + 22}px"
        on:click={() => { if (renamingPath !== item.path) onFileClick(item.path); }}
        on:contextmenu={(e) => openContextMenu(e, item)}
        title={item.path}
      >
        <svg class="file-icon" width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M2 1.5H7.5L10 4V10.5C10 11.05 9.55 11.5 9 11.5H2C1.45 11.5 1 11.05 1 10.5V2.5C1 1.95 1.45 1.5 2 1.5Z" stroke="currentColor" stroke-width="1.1" fill="none"/>
          <path d="M7.5 1.5V4H10" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        </svg>
        {#if renamingPath === item.path}
          <!-- svelte-ignore a11y-click-events-have-key-events -->
          <input
            bind:this={renameInput}
            class="rename-input"
            type="text"
            bind:value={renameValue}
            on:keydown={onRenameKeyDown}
            on:blur={submitRename}
            on:click|stopPropagation
          />
        {:else}
          <span class="item-name">{item.name}</span>
          {#if dirtyPaths.has(item.path)}
            <span class="dirty-dot" title="Unsaved changes">•</span>
          {:else if openPaths.has(item.path)}
            <span class="open-dot"></span>
          {/if}
        {/if}
      </button>
    {/if}
  {:else}
    <p class="empty">No markdown files found.</p>
  {/each}
</div>

{#if contextMenu}
  {@const menu = contextMenu}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="context-menu" style="left: {menu.x}px; top: {menu.y}px" on:click|stopPropagation>
    {#if onRename}
      <button class="ctx-item" on:click={() => startRename(menu.item)}>Rename</button>
    {/if}
    {#if onDelete}
      <button class="ctx-item ctx-item--danger" on:click={() => triggerDelete(menu.item)}>Delete</button>
    {/if}
  </div>
{/if}

<style>
  .file-list {
    overflow-y: auto;
    height: 100%;
    padding: 4px 0;
    user-select: none;
  }

  .folder-item,
  .file-item {
    display: flex;
    align-items: center;
    gap: 5px;
    width: 100%;
    background: none;
    border: none;
    cursor: pointer;
    padding-top: 3px;
    padding-bottom: 3px;
    padding-right: 8px;
    font-size: 0.85rem;
    text-align: left;
    white-space: nowrap;
    overflow: hidden;
    border-radius: 3px;
  }

  .folder-item {
    color: var(--text, #d0d0d0);
    font-weight: 500;
  }

  .folder-item:hover {
    background: var(--hover, rgba(255, 255, 255, 0.06));
  }

  .file-item {
    color: var(--text-muted, #aaa);
  }

  .file-item:hover {
    background: var(--hover, rgba(255, 255, 255, 0.06));
    color: var(--text, #e0e0e0);
  }

  .file-item.active {
    background: var(--active, rgba(92, 156, 245, 0.15));
    color: var(--text, #e0e0e0);
  }

  .chevron {
    flex-shrink: 0;
    color: var(--text-muted, #888);
    transition: transform 0.15s ease;
  }

  .chevron.collapsed {
    transform: rotate(-90deg);
  }

  .folder-icon {
    flex-shrink: 0;
    color: #c8a560;
  }

  .file-icon {
    flex-shrink: 0;
    color: var(--text-muted, #777);
  }

  .item-name {
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
    min-width: 0;
  }

  .rename-input {
    flex: 1;
    min-width: 0;
    background: var(--bg, #1e1e1e);
    border: 1px solid var(--accent, #5c9cf5);
    border-radius: 2px;
    color: var(--text, #e0e0e0);
    font: inherit;
    font-size: inherit;
    padding: 0 3px;
    outline: none;
    height: 18px;
  }

  .dirty-dot {
    color: var(--accent, #5c9cf5);
    font-size: 1rem;
    line-height: 1;
    flex-shrink: 0;
  }

  .open-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--text-muted, #666);
    flex-shrink: 0;
  }

  .empty {
    padding: 8px 12px;
    font-size: 0.8rem;
    color: var(--text-muted, #666);
    margin: 0;
  }

  .context-menu {
    position: fixed;
    z-index: 1000;
    background: var(--bg-elevated, #2a2a2a);
    border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
    border-radius: 4px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
    padding: 4px 0;
    min-width: 130px;
  }

  .ctx-item {
    display: block;
    width: 100%;
    padding: 6px 14px;
    background: none;
    border: none;
    color: var(--text, #d0d0d0);
    font-size: 0.85rem;
    text-align: left;
    cursor: pointer;
  }

  .ctx-item:hover {
    background: var(--hover, rgba(255, 255, 255, 0.08));
  }

  .ctx-item--danger {
    color: #e06c75;
  }

  .ctx-item--danger:hover {
    background: rgba(224, 108, 117, 0.12);
  }
</style>
