<script lang="ts">
  import { onMount, createEventDispatcher } from "svelte";
  import { listDirs, type DirListing } from "../../services/serverApi";

  const dispatch = createEventDispatcher<{
    selected: { path: string };
    cancel: void;
  }>();

  let listing: DirListing | null = null;
  let loading = false;
  let error = "";
  let pathInput = "";

  async function navigate(targetPath?: string) {
    loading = true;
    error = "";
    try {
      listing = await listDirs(targetPath);
      pathInput = listing.current;
    } catch (e) {
      error = `Cannot open: ${(e as Error).message}`;
    } finally {
      loading = false;
    }
  }

  async function navigateInput() {
    if (pathInput.trim()) await navigate(pathInput.trim());
  }

  onMount(() => navigate());
</script>

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-noninteractive-element-interactions -->
<div class="browser-overlay" on:click|self={() => dispatch("cancel")} role="dialog" aria-modal="true" tabindex="-1">
  <div class="browser">
    <div class="browser-header">
      <span class="browser-title">Select folder</span>
      <button class="close-btn" on:click={() => dispatch("cancel")}>×</button>
    </div>

    <div class="path-bar">
      <input
        type="text"
        class="path-input"
        bind:value={pathInput}
        on:keydown={(e) => e.key === "Enter" && navigateInput()}
        spellcheck="false"
      />
      <button class="go-btn" on:click={navigateInput}>Go</button>
    </div>

    <div class="dir-list">
      {#if listing?.parent}
        {@const parent = listing.parent}
        <button class="dir-item parent-item" on:click={() => navigate(parent)}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 2L4 7L9 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
          ..
        </button>
      {/if}

      {#if loading}
        <p class="status">Loading…</p>
      {:else if error}
        <p class="status error">{error}</p>
      {:else if listing?.dirs.length === 0}
        <p class="status">No subfolders</p>
      {:else}
        {#each listing?.dirs ?? [] as dir (dir.path)}
          <button class="dir-item" on:click={() => navigate(dir.path)}>
            <svg class="folder-icon" width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 3.5C1 2.67 1.67 2 2.5 2H5.5L7 3.5H11.5C12.33 3.5 13 4.17 13 5V10.5C13 11.33 12.33 12 11.5 12H2.5C1.67 12 1 11.33 1 10.5V3.5Z" stroke="currentColor" stroke-width="1.2"/>
            </svg>
            {dir.name}
          </button>
        {/each}
      {/if}
    </div>

    <div class="browser-footer">
      <span class="selected-path" title={listing?.current}>{listing?.current ?? ""}</span>
      <div class="footer-actions">
        <button class="btn-secondary" on:click={() => dispatch("cancel")}>Cancel</button>
        <button
          class="btn-primary"
          disabled={!listing}
          on:click={() => listing && dispatch("selected", { path: listing.current })}
        >
          Select
        </button>
      </div>
    </div>
  </div>
</div>

<style>
  .browser-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
  }

  .browser {
    background: #252525;
    border: 1px solid #444;
    border-radius: 8px;
    width: 480px;
    max-height: 70vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  }

  .browser-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px 10px;
    border-bottom: 1px solid #333;
    flex-shrink: 0;
  }

  .browser-title {
    font-size: 0.9rem;
    font-weight: 600;
    color: #e0e0e0;
  }

  .close-btn {
    background: none;
    border: none;
    color: #888;
    font-size: 1.2rem;
    cursor: pointer;
    padding: 0 4px;
    line-height: 1;
    border-radius: 3px;
  }
  .close-btn:hover { color: #e0e0e0; background: rgba(255,255,255,0.08); }

  .path-bar {
    display: flex;
    gap: 6px;
    padding: 10px 12px;
    border-bottom: 1px solid #333;
    flex-shrink: 0;
  }

  .path-input {
    flex: 1;
    background: #1a1a1a;
    border: 1px solid #444;
    border-radius: 4px;
    color: #e0e0e0;
    padding: 5px 8px;
    font-size: 0.8rem;
    font-family: monospace;
    outline: none;
    min-width: 0;
  }
  .path-input:focus { border-color: #5c9cf5; }

  .go-btn {
    background: #3a3a3a;
    border: 1px solid #555;
    border-radius: 4px;
    color: #e0e0e0;
    padding: 5px 12px;
    font-size: 0.8rem;
    cursor: pointer;
    flex-shrink: 0;
  }
  .go-btn:hover { background: #444; }

  .dir-list {
    flex: 1;
    overflow-y: auto;
    padding: 4px 6px;
  }

  .dir-list::-webkit-scrollbar { width: 6px; }
  .dir-list::-webkit-scrollbar-thumb { background: #444; border-radius: 3px; }

  .dir-item {
    display: flex;
    align-items: center;
    gap: 7px;
    width: 100%;
    background: none;
    border: none;
    color: #ccc;
    padding: 6px 10px;
    font-size: 0.875rem;
    text-align: left;
    cursor: pointer;
    border-radius: 4px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .dir-item:hover { background: rgba(255,255,255,0.07); color: #e0e0e0; }

  .parent-item { color: #888; font-style: italic; }
  .parent-item:hover { color: #bbb; }

  .folder-icon { color: #c8a560; flex-shrink: 0; }

  .status {
    padding: 12px 10px;
    font-size: 0.85rem;
    color: #777;
    margin: 0;
  }
  .status.error { color: #f87171; }

  .browser-footer {
    border-top: 1px solid #333;
    padding: 10px 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    flex-shrink: 0;
  }

  .selected-path {
    font-size: 0.75rem;
    font-family: monospace;
    color: #777;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
  }

  .footer-actions {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
  }

  .btn-primary, .btn-secondary {
    border: none;
    border-radius: 4px;
    padding: 6px 16px;
    font-size: 0.875rem;
    cursor: pointer;
  }
  .btn-primary { background: #5c9cf5; color: #fff; }
  .btn-primary:disabled { opacity: 0.4; cursor: default; }
  .btn-secondary { background: #3a3a3a; color: #e0e0e0; border: 1px solid #555; }
  .btn-primary:not(:disabled):hover { opacity: 0.85; }
  .btn-secondary:hover { background: #444; }
</style>
