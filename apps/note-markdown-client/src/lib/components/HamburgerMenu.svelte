<script lang="ts">
  import { onMount } from "svelte";

  export let menuId = "client-hamburger-menu";
  export let canSave = false;
  export let onOpenMarkdown: () => void = () => {};
  export let onNewTab: () => void = () => {};
  export let onSave: () => void = () => {};
  export let onSaveAs: () => void = () => {};

  let showMenu = false;
  let menuButtonElement: HTMLButtonElement | null = null;
  let menuPanelElement: HTMLDivElement | null = null;

  const closeMenu = () => {
    showMenu = false;
  };

  const toggleMenu = () => {
    showMenu = !showMenu;
  };

  const runMenuAction = (action: () => void) => {
    closeMenu();
    action();
  };

  onMount(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!showMenu || event.button !== 0) return;
      const target = event.target as Node | null;
      if (!target) return;
      if (menuPanelElement?.contains(target) || menuButtonElement?.contains(target)) {
        return;
      }
      closeMenu();
    };

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeydown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeydown);
    };
  });
</script>

<div class="menu-shell">
  <button
    bind:this={menuButtonElement}
    class="menu-trigger"
    type="button"
    title="Menu"
    aria-label="Open menu"
    aria-controls={menuId}
    aria-expanded={showMenu}
    on:click={toggleMenu}
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  </button>

  {#if showMenu}
    <div id={menuId} bind:this={menuPanelElement} class="menu-panel" role="menu">
      <button class="menu-item" role="menuitem" type="button" on:click={() => runMenuAction(onOpenMarkdown)}>
        Open markdown
      </button>

      <button class="menu-item" role="menuitem" type="button" on:click={() => runMenuAction(onNewTab)}>
        Nieuwe tab
      </button>

      <button
        class="menu-item"
        role="menuitem"
        type="button"
        disabled={!canSave}
        aria-disabled={!canSave}
        on:click={() => runMenuAction(onSave)}
      >
        Opslaan
      </button>

      <button
        class="menu-item"
        role="menuitem"
        type="button"
        disabled={!canSave}
        aria-disabled={!canSave}
        on:click={() => runMenuAction(onSaveAs)}
      >
        Opslaan als
      </button>

      <button
        class="menu-item"
        role="menuitem"
        type="button"
        disabled
        aria-disabled="true"
      >
        Instellingen
      </button>
    </div>
  {/if}
</div>

<style>
  .menu-shell {
    position: relative;
    display: grid;
    align-items: center;
  }

  .menu-trigger {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    border: 1px solid #475569;
    background: #334155;
    color: #f8fafc;
    cursor: pointer;
    display: grid;
    place-items: center;
    transition: background-color 120ms ease, transform 120ms ease;
  }

  .menu-trigger:hover {
    background: #475569;
  }

  .menu-trigger:active {
    transform: translateY(1px);
  }

  .menu-trigger svg {
    width: 16px;
    height: 16px;
    fill: none;
    stroke: currentcolor;
    stroke-width: 2;
    stroke-linecap: round;
  }

  .menu-panel {
    position: absolute;
    top: calc(100% + 8px);
    left: 0;
    z-index: 60;
    min-width: 180px;
    padding: 6px;
    border: 1px solid #334155;
    border-radius: 10px;
    background: #1e293b;
    box-shadow: 0 10px 20px rgba(2, 6, 23, 0.4);
    display: grid;
    gap: 4px;
  }

  .menu-item {
    width: 100%;
    border: none;
    background: transparent;
    color: #f8fafc;
    border-radius: 6px;
    padding: 8px 10px;
    text-align: left;
    cursor: pointer;
    font-size: 13px;
  }

  .menu-item:hover:not(:disabled) {
    background: #334155;
  }

  .menu-item:disabled {
    color: #64748b;
    cursor: not-allowed;
  }
</style>
