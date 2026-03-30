<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import WorkspacePicker from "$lib/components/WorkspacePicker.svelte";
  import { isServerMode, getRecentWorkspaces } from "../services/serverApi";
  import { loadDirectoryHandle, loadFallbackWorkspace } from "../services/workspacePersistence";

  let status: "loading" | "picking" = "loading";
  let existingHandle: FileSystemDirectoryHandle | null = null;
  let serverModeAvailable = false;
  let recentWorkspaces: { path: string; name: string }[] = [];

  onMount(async () => {
    // Priority 1: Server mode — load recents but always show picker
    if (await isServerMode()) {
      serverModeAvailable = true;
      recentWorkspaces = await getRecentWorkspaces();
      status = "picking";
      return;
    }

    // Priority 2: File System Access API (Chrome/Edge)
    if ("showDirectoryPicker" in window) {
      try {
        const handle = await loadDirectoryHandle();
        if (handle) {
          const perm = await handle.queryPermission({ mode: "readwrite" });
          if (perm === "granted") existingHandle = handle;
        }
      } catch {
        // IndexedDB unavailable or handle stale
      }
      status = "picking";
      return;
    }

    // Priority 3: Fallback cache (Brave/Firefox) — show picker with hint
    status = "picking";
  });

  function onChosen(path: string) {
    goto(`/workspace?path=${encodeURIComponent(path)}`);
  }
</script>

{#if status === "loading"}
  <div class="splash">Loading…</div>
{:else}
  <WorkspacePicker
    {existingHandle}
    serverMode={serverModeAvailable}
    {recentWorkspaces}
    {onChosen}
  />
{/if}

<style>
  .splash {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100vh;
    color: #777;
    font-size: 0.9rem;
  }
</style>
