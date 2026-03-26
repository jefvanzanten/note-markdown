<script lang="ts">
  import type { TabDto } from "@note/types";

  export let tabs: TabDto[];
  export let activeTabId: string | null;
  export let onTabClick: (tabId: string) => void;
  export let onTabClose: (tabId: string) => void;
</script>

<div class="tab-bar">
  {#each tabs as tab (tab.tab_id)}
    <button
      class="tab"
      class:active={tab.tab_id === activeTabId}
      on:click={() => onTabClick(tab.tab_id)}
      title={tab.linked_path ?? tab.title}
    >
      <span class="tab-title">{tab.title}</span>
      {#if tab.is_dirty}
        <span class="dirty" title="Unsaved changes">•</span>
      {/if}
      <button
        class="close-btn"
        on:click|stopPropagation={() => onTabClose(tab.tab_id)}
        title="Close tab"
        aria-label="Close {tab.title}"
      >
        ×
      </button>
    </button>
  {/each}
</div>

<style>
  .tab-bar {
    display: flex;
    align-items: stretch;
    overflow-x: auto;
    height: 100%;
    gap: 1px;
    background: var(--border, #333);
  }

  .tab-bar::-webkit-scrollbar {
    height: 3px;
  }

  .tab-bar::-webkit-scrollbar-thumb {
    background: var(--border, #555);
  }

  .tab {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 8px 0 12px;
    background: var(--surface, #2d2d2d);
    border: none;
    cursor: pointer;
    font-size: 0.85rem;
    color: var(--text-muted, #999);
    white-space: nowrap;
    max-width: 180px;
    min-width: 80px;
    flex-shrink: 0;
    position: relative;
    transition: background 0.1s;
  }

  .tab:hover {
    background: var(--hover, #383838);
    color: var(--text, #e0e0e0);
  }

  .tab.active {
    background: var(--bg, #1e1e1e);
    color: var(--text, #e0e0e0);
    border-bottom: 2px solid var(--accent, #5c9cf5);
  }

  .tab-title {
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
    min-width: 0;
    text-align: left;
  }

  .dirty {
    color: var(--accent, #5c9cf5);
    font-size: 1rem;
    line-height: 1;
    flex-shrink: 0;
  }

  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-muted, #777);
    font-size: 1rem;
    line-height: 1;
    border-radius: 3px;
    padding: 0;
    flex-shrink: 0;
    opacity: 0;
    transition: opacity 0.1s, background 0.1s;
  }

  .tab:hover .close-btn,
  .tab.active .close-btn {
    opacity: 1;
  }

  .close-btn:hover {
    background: var(--hover, rgba(255, 255, 255, 0.1));
    color: var(--text, #e0e0e0);
  }
</style>
