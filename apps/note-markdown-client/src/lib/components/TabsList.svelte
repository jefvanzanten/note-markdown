<script lang="ts">
  import type { TabDto } from "@note/types";

  export let tabs: TabDto[] = [];
  export let activeTabId: string | null = null;
  export let onTabClick: (tabId: string) => void = () => {};
  export let onContextMenu: (e: MouseEvent, tabId: string) => void = () => {};
</script>

<div class="tabs-list">
  {#each tabs as tab}
    <button
      class:active={tab.tab_id === activeTabId}
      on:click={() => onTabClick(tab.tab_id)}
      on:contextmenu={(e) => onContextMenu(e, tab.tab_id)}
    >
      {tab.title}{tab.is_dirty ? " *" : ""}
    </button>
  {/each}
</div>

<style>
  .tabs-list {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    min-width: 0;
  }

  .tabs-list button {
    background: #334155;
    color: #f8fafc;
    border: 1px solid #475569;
    border-radius: 6px;
    padding: 6px 10px;
    cursor: pointer;
  }

  .tabs-list button.active {
    background: #0284c7;
  }
</style>
