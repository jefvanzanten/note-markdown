<script lang="ts">
  import { onMount } from "svelte";
  import { tabs } from "@note/state";
  import type { FileEntry } from "../../services/fsAccess";

  export let files: FileEntry[];
  export let activeFilePath: string | null;
  export let onFileClick: (path: string) => void;
  export let storageKey = "collapsed-folders";

  type FolderNode = { kind: "folder"; name: string; path: string; children: TreeNode[] };
  type FileNode = { kind: "file"; name: string; path: string; entry: FileEntry };
  type TreeNode = FolderNode | FileNode;

  type DisplayItem =
    | { kind: "folder"; name: string; path: string; depth: number }
    | { kind: "file"; name: string; path: string; depth: number; entry: FileEntry };

  let collapsedFolders = new Set<string>();

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

  $: tree = buildTree(files);
  $: displayItems = flatten(tree, 0, collapsedFolders);
  $: openPaths = new Set($tabs.map((t) => t.linked_path).filter(Boolean) as string[]);
  $: dirtyPaths = new Set(
    $tabs.filter((t) => t.is_dirty && t.linked_path).map((t) => t.linked_path) as string[]
  );
</script>

<div class="file-list">
  {#each displayItems as item (item.path)}
    {#if item.kind === "folder"}
      <button
        class="folder-item"
        style="padding-left: {item.depth * 14 + 6}px"
        on:click={() => toggleFolder(item.path)}
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
        <span class="item-name">{item.name}</span>
      </button>
    {:else}
      <button
        class="file-item"
        class:active={item.path === activeFilePath}
        style="padding-left: {item.depth * 14 + 22}px"
        on:click={() => onFileClick(item.path)}
        title={item.path}
      >
        <svg class="file-icon" width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M2 1.5H7.5L10 4V10.5C10 11.05 9.55 11.5 9 11.5H2C1.45 11.5 1 11.05 1 10.5V2.5C1 1.95 1.45 1.5 2 1.5Z" stroke="currentColor" stroke-width="1.1" fill="none"/>
          <path d="M7.5 1.5V4H10" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        </svg>
        <span class="item-name">{item.name}</span>
        {#if dirtyPaths.has(item.path)}
          <span class="dirty-dot" title="Unsaved changes">•</span>
        {:else if openPaths.has(item.path)}
          <span class="open-dot"></span>
        {/if}
      </button>
    {/if}
  {:else}
    <p class="empty">No markdown files found.</p>
  {/each}
</div>

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
</style>
