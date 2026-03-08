<script lang="ts">
  import { onMount } from "svelte";

  export let menuId = "sticky-hamburger-menu";
  export let canSave = false;
  export let onNewSticky: () => void = () => {};
  export let onSave: () => void = () => {};
  export let onSettings: () => void = () => {};

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
    aria-label="Open sticky menu"
    aria-controls={menuId}
    aria-expanded={showMenu}
    on:click={toggleMenu}
  >
    Menu
  </button>

  {#if showMenu}
    <div id={menuId} bind:this={menuPanelElement} class="menu-panel" role="menu">
      <button class="menu-item" role="menuitem" type="button" on:click={() => runMenuAction(onNewSticky)}>
        Nieuwe sticky
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

      <button class="menu-item" role="menuitem" type="button" on:click={() => runMenuAction(onSettings)}>
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
    z-index: 20;
  }

  .menu-trigger {
    height: 24px;
    min-width: 58px;
    border: none;
    border-radius: 7px;
    background: transparent;
    color: var(--sticky-action-ink);
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.02em;
    padding: 0 10px;
    transition: background-color 120ms ease, transform 120ms ease;
    text-shadow: 0 0 6px rgba(0, 0, 0, 0.18);
  }

  .menu-trigger:hover {
    background: var(--sticky-action-hover);
  }

  .menu-trigger:active {
    transform: translateY(1px);
    background: var(--sticky-action-active);
  }

  .menu-panel {
    position: absolute;
    top: calc(100% + 8px);
    left: 0;
    z-index: 60;
    min-width: 170px;
    padding: 6px;
    border: 1px solid color-mix(in srgb, var(--sticky-action-active) 76%, #fff 24%);
    border-radius: 10px;
    background: color-mix(in srgb, var(--sticky-toolbar) 90%, #fff 10%);
    box-shadow: 0 10px 20px color-mix(in srgb, var(--sticky-shadow) 60%, #000 40%);
    display: grid;
    gap: 4px;
  }

  .menu-item {
    width: 100%;
    border: none;
    background: transparent;
    color: var(--sticky-action-ink);
    border-radius: 7px;
    padding: 7px 10px;
    text-align: left;
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
  }

  .menu-item:hover:not(:disabled) {
    background: var(--sticky-action-hover);
  }

  .menu-item:active:not(:disabled) {
    background: var(--sticky-action-active);
  }

  .menu-item:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
</style>
