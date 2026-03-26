<script lang="ts">
  export let collapsed: boolean;
  export let onToggle: () => void;
</script>

<button
  class="toggle"
  on:click={onToggle}
  title={collapsed ? "Expand file list" : "Collapse file list"}
  aria-label={collapsed ? "Expand file list" : "Collapse file list"}
>
  <svg
    width="14"
    height="14"
    viewBox="0 0 14 14"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    class:rotated={collapsed}
  >
    <path d="M9 2L4 7L9 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
</button>

<style>
  .toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-muted, #999);
    border-radius: 4px;
    flex-shrink: 0;
  }

  .toggle:hover {
    background: var(--hover, rgba(255, 255, 255, 0.08));
    color: var(--text, #e0e0e0);
  }

  svg {
    transition: transform 0.18s ease;
  }

  svg.rotated {
    transform: rotate(180deg);
  }
</style>
