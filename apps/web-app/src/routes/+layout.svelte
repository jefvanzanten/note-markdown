<slot />

<style>
  :global(*, *::before, *::after) { box-sizing: border-box; }

  :global(body) {
    margin: 0;
    padding: 0;
    background: #1e1e1e;
    color: #e0e0e0;
    font-family: system-ui, sans-serif;
    height: 100vh;
    overflow: hidden;
  }

  :global(#svelte) {
    height: 100vh;
    display: flex;
    flex-direction: column;
  }
</style>
