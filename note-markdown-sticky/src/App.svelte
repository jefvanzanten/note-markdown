<script lang="ts">
  import { onMount } from "svelte";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
  import MarkdownEditor from "@note/shared-editor";
  import {
    closeTab,
    listRestoreSession,
    newNote,
    persistSession,
    saveTab,
    saveTabAs,
    updateTabContent
  } from "@note/shared-api";
  import type { TabDto } from "@note/shared-types";
  import { runAction, saveWithFallback, toDirectory } from "@note/shared-utils";
  import SettingsMenu from "./lib/components/SettingsMenu/SettingsMenu.svelte";
  import { deriveStickyTheme, normalizeHexColor } from "./lib/utils/colorSystem";
  import {
    applyStoredStyle,
    DEFAULT_STICKY_COLOR,
    DEFAULT_STICKY_OPACITY,
    normalizeOpacity,
    PRESET_STICKY_COLORS,
    removeStyleForTab,
    saveStyleForTab
  } from "./lib/utils/stickyStyle";

  const currentWindow = getCurrentWindow();
  const requestedTabId = new URLSearchParams(window.location.search).get("tabId");
  const STICKY_WIDTH = 380;
  const STICKY_HEIGHT = 430;

  let tab: TabDto | null = null;
  let sessionSaveDirectory: string | null = null;
  let closeInProgress = false;
  let showSettings = false;
  let stickyColor = DEFAULT_STICKY_COLOR;
  let stickyOpacity = DEFAULT_STICKY_OPACITY;
  let settingsButtonElement: HTMLButtonElement | null = null;
  let settingsPanelElement: HTMLDivElement | null = null;
  let errorMessage: string | null = null;
  let theme = deriveStickyTheme(stickyColor);

  const clearError = () => {
    errorMessage = null;
  };

  const setError = (message: string) => {
    errorMessage = message;
  };

  const closeSettings = () => {
    showSettings = false;
  };

  const toggleSettings = () => {
    showSettings = !showSettings;
  };

  const hydrateSessionDirectory = (nextTab: TabDto) => {
    const dir = toDirectory(nextTab.linked_path);
    if (dir) sessionSaveDirectory = dir;
  };

  const stickyLabelFor = (tabId: string) => `sticky-${tabId}`;

  const stickyTitleText = (current: TabDto | null) => {
    if (!current) return "sticky";
    if (current.is_temp) return "";
    return `${current.title}${current.is_dirty ? " *" : ""}`;
  };

  const stickySaveName = (current: TabDto) => (current.is_temp ? "sticky" : current.title);

  const applyStyleState = (tabId: string) => {
    const style = applyStoredStyle(tabId);
    stickyColor = style.color;
    stickyOpacity = style.opacity;
  };

  const persistStyleState = () => {
    if (!tab) return;
    saveStyleForTab(tab.tab_id, stickyColor, stickyOpacity);
  };

  const setStickyColor = (nextColor: string) => {
    stickyColor = normalizeHexColor(nextColor) ?? DEFAULT_STICKY_COLOR;
    persistStyleState();
  };

  const setStickyOpacity = (nextOpacity: number) => {
    stickyOpacity = normalizeOpacity(nextOpacity) ?? DEFAULT_STICKY_OPACITY;
    persistStyleState();
  };

  const handleColorInput = (event: Event) => {
    const target = event.currentTarget as HTMLInputElement | null;
    if (!target) return;
    setStickyColor(target.value);
  };

  const handleOpacityInput = (event: Event) => {
    const target = event.currentTarget as HTMLInputElement | null;
    if (!target) return;
    setStickyOpacity(Number.parseFloat(target.value));
  };

  const shouldKeepTempOnClose = async (current: TabDto) => {
    if (!current.is_temp || current.content.trim().length === 0) return false;

    const restored = await listRestoreSession().catch(() => [] as TabDto[]);
    const tempTabs = restored.filter((candidate) => candidate.is_temp);
    return tempTabs.length === 1 && tempTabs[0]?.tab_id === current.tab_id;
  };

  const openStickyWindow = async (tabId: string) => {
    const label = stickyLabelFor(tabId);
    if (label === currentWindow.label) return;

    const existing = await WebviewWindow.getByLabel(label);
    if (existing) return;

    new WebviewWindow(label, {
      url: `/?tabId=${encodeURIComponent(tabId)}`,
      title: "sticky",
      width: STICKY_WIDTH,
      height: STICKY_HEIGHT,
      minWidth: 300,
      minHeight: 260,
      decorations: false,
      transparent: true,
      alwaysOnTop: true,
      resizable: true
    });
  };

  const setCurrentTab = (nextTab: TabDto) => {
    tab = nextTab;
    hydrateSessionDirectory(nextTab);
    applyStyleState(nextTab.tab_id);
  };

  const syncTabContent = async (content: string, cursor: number) => {
    if (!tab) return;
    if (tab.content === content && tab.cursor === cursor) return;

    clearError();
    const current = tab;
    tab = { ...current, content, cursor, is_dirty: true };

    try {
      await updateTabContent(current.tab_id, content, cursor);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Bijwerken van de sticky is mislukt.");
    }
  };

  const createSticky = async () => {
    clearError();
    const outcome = await runAction(() => newNote());
    if (outcome.error) {
      setError(outcome.error);
      return;
    }

    if (!outcome.result) return;
    await openStickyWindow(outcome.result.tab_id);
  };

  const saveSticky = async () => {
    if (!tab) return;
    clearError();

    const current = tab;
    const outcome = await saveWithFallback({
      save: () => saveTab(current.tab_id),
      saveAs: () => saveTabAs(current.tab_id, sessionSaveDirectory, stickySaveName(current))
    });

    if (outcome.error) {
      setError(outcome.error);
      return;
    }

    if (outcome.result) {
      setCurrentTab(outcome.result.tab);
    }
  };

  const saveStickyAs = async () => {
    if (!tab) return;
    clearError();

    const current = tab;
    const outcome = await runAction(() =>
      saveTabAs(current.tab_id, sessionSaveDirectory, stickySaveName(current))
    );
    if (outcome.error) {
      setError(outcome.error);
      return;
    }

    if (outcome.result) {
      setCurrentTab(outcome.result.tab);
    }
  };

  const confirmClose = async (current: TabDto) => {
    if (!current.is_dirty) return true;

    if (current.is_temp) {
      if (current.content.trim().length === 0) return true;

      const keepForRestore = await shouldKeepTempOnClose(current);
      if (keepForRestore) return true;
    }

    return window.confirm(
      "Deze sticky heeft niet-opgeslagen wijzigingen. Weet je zeker dat je wilt sluiten?"
    );
  };

  const finalizeClose = async () => {
    if (closeInProgress) return;
    closeInProgress = true;

    const current = tab;
    if (current) {
      const keepForRestore = await shouldKeepTempOnClose(current);
      if (keepForRestore) {
        await updateTabContent(current.tab_id, current.content, current.cursor).catch(() => null);
      } else {
        await closeTab(current.tab_id).catch(() => null);
        removeStyleForTab(current.tab_id);
      }
    }

    await persistSession().catch(() => null);
    await currentWindow.destroy();
  };

  const requestClose = async () => {
    if (closeInProgress) return;
    if (tab && !(await confirmClose(tab))) return;
    await finalizeClose();
  };

  const bootstrap = async () => {
    clearError();
    const restored = await listRestoreSession().catch((error) => {
      setError(error instanceof Error ? error.message : "Sticky sessie laden is mislukt.");
      return [] as TabDto[];
    });

    if (requestedTabId) {
      const requested = restored.find((candidate) => candidate.tab_id === requestedTabId);
      if (requested) {
        setCurrentTab(requested);
        return;
      }

      const fallback = await newNote();
      setCurrentTab(fallback);
      return;
    }

    if (restored.length === 0) {
      const first = await newNote();
      setCurrentTab(first);
      return;
    }

    setCurrentTab(restored[0]);
    for (const restoredTab of restored.slice(1)) {
      await openStickyWindow(restoredTab.tab_id);
    }
  };

  const handleGlobalPointerDown = (event: PointerEvent) => {
    if (!showSettings || event.button !== 0) return;
    const target = event.target as Node | null;
    if (!target) return;
    if (settingsPanelElement?.contains(target) || settingsButtonElement?.contains(target)) {
      return;
    }
    closeSettings();
  };

  const handleGlobalKeydown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      closeSettings();
      return;
    }

    const hasCommandModifier = event.ctrlKey || event.metaKey;
    if (!hasCommandModifier) return;

    const key = event.key.toLowerCase();
    if (key === "n") {
      event.preventDefault();
      void createSticky();
      return;
    }

    if (key === "s") {
      event.preventDefault();
      if (event.shiftKey) void saveStickyAs();
      else void saveSticky();
      return;
    }

    if (key === "w") {
      event.preventDefault();
      void requestClose();
    }
  };

  $: theme = deriveStickyTheme(stickyColor);

  $: if (tab) {
    void currentWindow.setTitle(stickyTitleText(tab));
  }

  onMount(() => {
    let unlistenCloseRequest: (() => void) | null = null;

    void (async () => {
      await bootstrap();
      unlistenCloseRequest = await currentWindow.onCloseRequested(async (event) => {
        event.preventDefault();
        await requestClose();
      });
    })();

    const handleBeforeUnload = () => {
      void persistSession();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pointerdown", handleGlobalPointerDown);
    window.addEventListener("keydown", handleGlobalKeydown);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pointerdown", handleGlobalPointerDown);
      window.removeEventListener("keydown", handleGlobalKeydown);
      if (unlistenCloseRequest) {
        unlistenCloseRequest();
      }
    };
  });
</script>

<main
  class="sticky-window"
  style="
    --sticky-base: {stickyColor};
    --sticky-light: {theme.stickyLight};
    --sticky-dark: {theme.stickyDark};
    --sticky-border: {theme.stickyBorder};
    --sticky-toolbar: {theme.stickyToolbar};
    --sticky-shadow: {theme.stickyShadow};
    --sticky-glow: {theme.stickyGlow};
    --sticky-ink: {theme.stickyTextColor};
    --sticky-muted: {theme.stickyTextMuted};
    --sticky-caret: {theme.stickyCaret};
    --sticky-editor-bg: {theme.stickyEditorShell};
    --sticky-action-ink: {theme.stickyActionText};
    --sticky-action-hover: {theme.stickyActionHover};
    --sticky-action-active: {theme.stickyActionActive};
    --sticky-opacity: {stickyOpacity};
  "
>
  <header class="toolbar">
    <div class="drag-strip" data-tauri-drag-region>
      <span>{stickyTitleText(tab)}</span>
    </div>

    <div class="actions">
      <button class="action" title="Nieuwe sticky" aria-label="Nieuwe sticky" on:click={() => void createSticky()}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
      <button class="action" title="Opslaan" aria-label="Opslaan" disabled={!tab} on:click={() => void saveSticky()}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 4h13l3 3v13H4z" />
          <path d="M8 4v7h8V4" />
          <path d="M8 20v-6h8v6" />
        </svg>
      </button>
      <button
        bind:this={settingsButtonElement}
        class="action settings"
        title="Instellingen"
        aria-expanded={showSettings}
        on:click={toggleSettings}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M19.14 12.94a7.7 7.7 0 0 0 .05-.94 7.7 7.7 0 0 0-.05-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.32 7.32 0 0 0-1.63-.94l-.36-2.54a.49.49 0 0 0-.49-.42h-3.84a.49.49 0 0 0-.49.42l-.36 2.54c-.58.23-1.12.54-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.84a.5.5 0 0 0 .12.64l2.03 1.58a7.7 7.7 0 0 0-.05.94 7.7 7.7 0 0 0 .05.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .6.22l2.39-.96c.5.4 1.05.72 1.63.94l.36 2.54a.49.49 0 0 0 .49.42h3.84a.49.49 0 0 0 .49-.42l.36-2.54c.58-.22 1.13-.54 1.63-.94l2.39.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64z"
          />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </button>
      <button class="action close" title="Sluiten" aria-label="Sluiten" on:click={() => void requestClose()}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  </header>

  {#if errorMessage}
    <div class="error-banner" role="alert">
      <span>{errorMessage}</span>
      <button class="dismiss" aria-label="Melding sluiten" on:click={clearError}>Sluiten</button>
    </div>
  {/if}

  {#if showSettings}
    <SettingsMenu
      bind:panelElement={settingsPanelElement}
      color={stickyColor}
      opacity={stickyOpacity}
      presetColors={PRESET_STICKY_COLORS}
      onColorInput={handleColorInput}
      onOpacityInput={handleOpacityInput}
      onPresetSelect={setStickyColor}
    />
  {/if}

  <section class="editor-shell">
    {#if tab}
      <MarkdownEditor content={tab.content} onChange={(value, cursor) => void syncTabContent(value, cursor)} />
    {:else}
      <div class="empty">Sticky laden...</div>
    {/if}
  </section>
</main>

<style>
  :global(body) {
    margin: 0;
    font-family: "Trebuchet MS", "Segoe UI", sans-serif;
    background: transparent;
    color: #2f2a1f;
    overflow: hidden;
  }

  .sticky-window {
    height: 100vh;
    display: grid;
    grid-template-rows: 36px auto minmax(0, 1fr);
    opacity: var(--sticky-opacity);
    border: 1px solid var(--sticky-border);
    border-radius: 14px;
    background:
      linear-gradient(160deg, var(--sticky-light) 0%, var(--sticky-base) 55%, var(--sticky-dark) 100%),
      radial-gradient(circle at 0% 0%, rgba(255, 255, 255, 0.55) 0%, transparent 60%);
    box-shadow:
      0 18px 34px var(--sticky-shadow),
      inset 0 -1px 0 var(--sticky-glow);
    overflow: hidden;
    position: relative;
  }

  .toolbar {
    grid-row: 1;
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    padding: 0 6px 0 10px;
    border-bottom: 1px dashed rgba(56, 45, 20, 0.35);
    background: var(--sticky-toolbar);
    backdrop-filter: blur(2px);
  }

  .drag-strip {
    align-self: stretch;
    display: flex;
    align-items: center;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    letter-spacing: 0.03em;
    color: var(--sticky-ink);
    user-select: none;
  }

  .actions {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .action {
    width: 28px;
    height: 24px;
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

  .action:hover:not(:disabled) {
    background: var(--sticky-action-hover);
  }

  .action:active:not(:disabled) {
    background: var(--sticky-action-active);
    transform: translateY(1px);
  }

  .action:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .action svg {
    width: 15px;
    height: 15px;
    fill: none;
    stroke: currentcolor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .action.settings {
    transform: rotate(0deg);
  }

  .action.settings:hover:not(:disabled) {
    transform: rotate(20deg);
  }

  .error-banner {
    grid-row: 2;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 8px 10px;
    background: rgba(127, 29, 29, 0.86);
    color: #fff4f4;
    font-size: 12px;
  }

  .dismiss {
    border: 1px solid rgba(255, 244, 244, 0.3);
    background: rgba(0, 0, 0, 0.14);
    color: inherit;
    border-radius: 999px;
    padding: 3px 9px;
    cursor: pointer;
  }

  .editor-shell {
    grid-row: 3;
    min-height: 0;
    background: var(--sticky-editor-bg);
  }

  .editor-shell :global(.cm-editor) {
    height: 100%;
    background: var(--sticky-editor-bg);
  }

  .editor-shell :global(.cm-content) {
    min-height: 100%;
    color: var(--sticky-ink);
    caret-color: var(--sticky-caret);
  }

  .editor-shell :global(.cm-line),
  .editor-shell :global(.md-mark),
  .editor-shell :global(.md-strong),
  .editor-shell :global(.md-em),
  .editor-shell :global(.md-strike),
  .editor-shell :global(.md-code),
  .editor-shell :global(.md-link),
  .editor-shell :global(.md-url) {
    color: var(--sticky-ink);
  }

  .editor-shell :global(.cm-cursor),
  .editor-shell :global(.cm-dropCursor) {
    border-left-color: var(--sticky-caret) !important;
    border-left-width: 2px;
  }

  .editor-shell :global(.cm-scroller) {
    background: var(--sticky-editor-bg);
    padding: 14px 14px 18px;
    font-size: 14px;
    line-height: 1.45;
    color: var(--sticky-ink);
  }

  .empty {
    padding: 18px;
    font-size: 13px;
    color: var(--sticky-muted);
  }
</style>
