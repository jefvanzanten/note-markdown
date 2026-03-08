<script lang="ts">
  export let menuId = "sticky-hamburger-menu";
  export let canSave = false;
  export let onNewSticky: () => void = () => {};
  export let onOpenMarkdown: () => void = () => {};
  export let onSave: () => void = () => {};
  export let onSettings: () => void = () => {};

  let menuOpen = false;
  let menuPanelElement: HTMLDivElement | null = null;

  const closeMenu = () => {
    if (!menuPanelElement?.matches(":popover-open")) return;
    menuPanelElement.hidePopover();
  };

  const runMenuAction = (action: () => void) => {
    closeMenu();
    action();
  };

  const syncMenuState = (event: Event) => {
    const popover = event.currentTarget as HTMLDivElement | null;
    menuOpen = popover?.matches(":popover-open") ?? false;
  };
</script>

<div class="menu-shell">
  <button
    class="menu-trigger"
    type="button"
    title="Menu"
    aria-label="Open sticky menu"
    aria-haspopup="menu"
    aria-controls={menuId}
    aria-expanded={menuOpen}
    popovertarget={menuId}
    popovertargetaction="toggle"
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  </button>

  <div id={menuId} bind:this={menuPanelElement} class="menu-panel" role="menu" popover="auto" on:toggle={syncMenuState}>
    <button class="menu-item" role="menuitem" type="button" on:click={() => runMenuAction(onNewSticky)}>
      Nieuwe sticky
    </button>

    <button class="menu-item" role="menuitem" type="button" on:click={() => runMenuAction(onOpenMarkdown)}>
      Open markdown
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
</div>

<style>
  .menu-shell {
    position: relative;
    display: grid;
    align-items: center;
    z-index: 30;
  }

  .menu-trigger {
    width: 30px;
    height: 24px;
    anchor-name: --sticky-actions-anchor;
    border: none;
    border-radius: 7px;
    background: transparent;
    color: var(--sticky-action-ink);
    cursor: pointer;
    padding: 0;
    display: grid;
    place-items: center;
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

  .menu-trigger svg {
    width: 15px;
    height: 15px;
    fill: none;
    stroke: currentcolor;
    stroke-width: 2;
    stroke-linecap: round;
  }

  .menu-panel {
    margin: 0;
    inset: auto;
    position: fixed;
    top: 42px;
    left: 8px;
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

  @supports (position-anchor: --sticky-actions-anchor) and (top: anchor(bottom)) {
    .menu-panel {
      position-anchor: --sticky-actions-anchor;
      top: calc(anchor(bottom) + 8px);
      left: anchor(left);
    }
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
