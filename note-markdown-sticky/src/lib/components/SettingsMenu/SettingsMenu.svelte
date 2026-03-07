<script lang="ts">
  export let color = "#f6de76";
  export let opacity = 1;
  export let presetColors: string[] = [];
  export let onColorInput: (event: Event) => void;
  export let onOpacityInput: (event: Event) => void;
  export let onPresetSelect: (color: string) => void;
  export let panelElement: HTMLDivElement | null = null;
</script>

<div bind:this={panelElement} class="settings-popover">
  <label for="sticky-color">Sticky kleur</label>
  <input id="sticky-color" type="color" value={color} on:input={onColorInput} />

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

  <div class="swatches">
    {#each presetColors as presetColor}
      <button
        class:active={color === presetColor}
        class="swatch"
        style="background: {presetColor}"
        title={presetColor}
        on:click={() => onPresetSelect(presetColor)}
      ></button>
    {/each}
  </div>
</div>

<style>
  .settings-popover {
    position: absolute;
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

  .settings-popover label {
    font-size: 12px;
    font-weight: 600;
    color: #372a12;
  }

  .settings-popover input[type="color"] {
    width: 100%;
    height: 34px;
    border: 1px solid rgba(82, 66, 27, 0.35);
    border-radius: 8px;
    background: transparent;
    cursor: pointer;
    padding: 2px;
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

  .swatches {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 6px;
  }

  .swatch {
    height: 22px;
    border-radius: 7px;
    border: 1px solid rgba(44, 34, 12, 0.25);
    cursor: pointer;
  }

  .swatch.active {
    outline: 2px solid #1f2937;
    outline-offset: 1px;
  }
</style>
