<script lang="ts">
  export let color = "#f6de76";
  export let opacity = 1;
  export let onColorInput: (event: Event) => void;
  export let onOpacityInput: (event: Event) => void;
  export let panelElement: HTMLDivElement | null = null;
  export let menuId = "sticky-settings-menu";
</script>

<div id={menuId} bind:this={panelElement} class="settings-popover">
  <div class="controls-row">
    <input
      id="sticky-color"
      class="color-picker"
      type="color"
      value={color}
      aria-label="Sticky kleur"
      on:input={onColorInput}
    />

    <div class="opacity-group">
      <label for="sticky-opacity">Opacity ({Math.round(opacity * 100)}%)</label>
      <input
        id="sticky-opacity"
        type="range"
        min="0.3"
        max="1"
        step="0.05"
        value={opacity}
        on:input={onOpacityInput}
      />
    </div>
  </div>
</div>

<style>
  .settings-popover {
    position: fixed;
    top: 42px;
    right: 8px;
    z-index: 10;
    min-width: 190px;
    padding: 10px;
    border-radius: 10px;
    border: 1px solid var(--sticky-action-active);
    background: rgba(255, 255, 255, 0.92);
    box-shadow: 0 12px 20px rgba(0, 0, 0, 0.24);
    display: grid;
    gap: 8px;
  }

  .controls-row {
    display: grid;
    grid-template-columns: 42px minmax(0, 1fr);
    gap: 10px;
    align-items: center;
  }

  @supports (position-anchor: --sticky-settings-anchor) and (top: anchor(bottom)) {
    .settings-popover {
      position-anchor: --sticky-settings-anchor;
      top: calc(anchor(bottom) + 8px);
      left: anchor(right);
      right: auto;
      transform: translateX(-100%);
    }
  }

  .color-picker {
    width: 42px;
    height: 42px;
    border: 1px solid rgba(82, 66, 27, 0.35);
    border-radius: 10px;
    background: transparent;
    cursor: pointer;
    padding: 0;
  }

  .color-picker::-webkit-color-swatch-wrapper {
    padding: 0;
    border-radius: 9px;
  }

  .color-picker::-webkit-color-swatch {
    border: none;
    border-radius: 9px;
  }

  .color-picker::-moz-color-swatch {
    border: none;
    border-radius: 9px;
  }

  .opacity-group label {
    font-size: 12px;
    font-weight: 600;
    color: #372a12;
  }

  .opacity-group {
    display: grid;
    gap: 6px;
  }

  .opacity-group input[type="range"] {
    width: 100%;
    accent-color: #3b2f13;
    cursor: pointer;
  }
</style>
