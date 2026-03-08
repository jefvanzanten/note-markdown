<script lang="ts">
  import { onMount } from "svelte";
  import { LogicalSize } from "@tauri-apps/api/dpi";
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
  import {
    DEFAULT_EDITOR_FONT_SIZE_PX,
    EDITOR_FONT_SIZE_STEP_PX,
    clampEditorFontSize,
    isZoomInShortcut,
    isZoomOutShortcut,
    loadEditorFontSize,
    removeEditorFontSize,
    runAction,
    saveEditorFontSize,
    saveWithFallback,
    toDirectory
  } from "@note/shared-utils";
  import HamburgerMenu from "./lib/components/HamburgerMenu.svelte";
  import SettingsMenu from "./lib/components/SettingsMenu/SettingsMenu.svelte";
  import { deriveStickyTheme, normalizeHexColor } from "./lib/utils/colorSystem";
  import {
    applyStoredStyle,
    DEFAULT_STICKY_COLOR,
    DEFAULT_STICKY_OPACITY,
    normalizeOpacity,
    removeStyleForTab,
    saveStyleForTab
  } from "./lib/utils/stickyStyle";
  import { readStoredWindowSize, saveWindowSize } from "./lib/utils/stickyWindowSize";

  const currentWindow = getCurrentWindow();
  const requestedTabId = new URLSearchParams(window.location.search).get("tabId");
  const STICKY_WIDTH = 380;
  const STICKY_HEIGHT = 430;
  const STICKY_MIN_WIDTH = 300;
  const STICKY_MIN_HEIGHT = 260;
  const SETTINGS_MENU_ID = "sticky-settings-menu";
  const ACTIONS_MENU_ID = "sticky-actions-menu";
  const STICKY_EDITOR_ZOOM_STORAGE_KEY = "note-markdown-sticky-editor-zoom-v1";

  let tab: TabDto | null = null;
  let sessionSaveDirectory: string | null = null;
  let closeInProgress = false;
  let showSettings = false;
  let stickyColor = DEFAULT_STICKY_COLOR;
  let stickyOpacity = DEFAULT_STICKY_OPACITY;
  let settingsPanelElement: HTMLDivElement | null = null;
  let errorMessage: string | null = null;
  let theme = deriveStickyTheme(stickyColor);
  let persistWindowSizeTimer: number | null = null;
  let copyFeedbackTimer: number | null = null;
  let markdownCopied = false;
  let editorFontSize = DEFAULT_EDITOR_FONT_SIZE_PX;

  const clearError = () => {
    errorMessage = null;
  };

  const setError = (message: string) => {
    errorMessage = message;
  };

  const closeSettings = () => {
    showSettings = false;
  };

  const openSettings = () => {
    showSettings = true;
  };

  const preferredWindowSize = () =>
    readStoredWindowSize(STICKY_MIN_WIDTH, STICKY_MIN_HEIGHT) ?? {
      width: STICKY_WIDTH,
      height: STICKY_HEIGHT
    };

  const persistWindowSize = () => {
    saveWindowSize(window.innerWidth, window.innerHeight, STICKY_MIN_WIDTH, STICKY_MIN_HEIGHT);
  };

  const clearPersistWindowSizeTimer = () => {
    if (persistWindowSizeTimer === null) return;
    window.clearTimeout(persistWindowSizeTimer);
    persistWindowSizeTimer = null;
  };

  const clearCopyFeedbackTimer = () => {
    if (copyFeedbackTimer === null) return;
    window.clearTimeout(copyFeedbackTimer);
    copyFeedbackTimer = null;
  };

  const showCopiedState = () => {
    markdownCopied = true;
    clearCopyFeedbackTimer();
    copyFeedbackTimer = window.setTimeout(() => {
      markdownCopied = false;
      copyFeedbackTimer = null;
    }, 1200);
  };

  const schedulePersistWindowSize = () => {
    clearPersistWindowSizeTimer();

    persistWindowSizeTimer = window.setTimeout(() => {
      persistWindowSize();
      persistWindowSizeTimer = null;
    }, 120);
  };

  const applyStoredWindowSize = async () => {
    const storedSize = readStoredWindowSize(STICKY_MIN_WIDTH, STICKY_MIN_HEIGHT);
    if (!storedSize) {
      persistWindowSize();
      return;
    }

    await currentWindow.setSize(new LogicalSize(storedSize.width, storedSize.height)).catch((error) => {
      console.warn("Sticky window size restore failed", error);
    });
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

  const applyEditorZoomState = (tabId: string) => {
    editorFontSize = loadEditorFontSize(STICKY_EDITOR_ZOOM_STORAGE_KEY, tabId);
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

    const size = preferredWindowSize();

    new WebviewWindow(label, {
      url: `/?tabId=${encodeURIComponent(tabId)}`,
      title: "sticky",
      width: size.width,
      height: size.height,
      minWidth: STICKY_MIN_WIDTH,
      minHeight: STICKY_MIN_HEIGHT,
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
    applyEditorZoomState(nextTab.tab_id);
  };

  const adjustEditorZoom = (delta: number) => {
    if (!tab) return;
    const nextSize = clampEditorFontSize(editorFontSize + delta);
    if (nextSize === editorFontSize) return;
    editorFontSize = nextSize;
    saveEditorFontSize(STICKY_EDITOR_ZOOM_STORAGE_KEY, tab.tab_id, nextSize);
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

  const copyMarkdown = async () => {
    if (!tab || tab.content.length === 0) return;
    clearError();

    if (!navigator.clipboard) {
      setError("Klembord is niet beschikbaar.");
      return;
    }

    try {
      await navigator.clipboard.writeText(tab.content);
      showCopiedState();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Kopieren naar klembord is mislukt.");
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

    clearPersistWindowSizeTimer();
    persistWindowSize();

    const current = tab;
    if (current) {
      const keepForRestore = await shouldKeepTempOnClose(current);
      if (keepForRestore) {
        await updateTabContent(current.tab_id, current.content, current.cursor).catch(() => null);
      } else {
        await closeTab(current.tab_id).catch(() => null);
        removeStyleForTab(current.tab_id);
        removeEditorFontSize(STICKY_EDITOR_ZOOM_STORAGE_KEY, current.tab_id);
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
    if (settingsPanelElement?.contains(target)) {
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

    if (isZoomInShortcut(event)) {
      event.preventDefault();
      adjustEditorZoom(EDITOR_FONT_SIZE_STEP_PX);
      return;
    }

    if (isZoomOutShortcut(event)) {
      event.preventDefault();
      adjustEditorZoom(-EDITOR_FONT_SIZE_STEP_PX);
      return;
    }

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

    if (key === "c" && event.shiftKey) {
      event.preventDefault();
      void copyMarkdown();
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
      await applyStoredWindowSize();
      await bootstrap();
      unlistenCloseRequest = await currentWindow.onCloseRequested(async (event) => {
        event.preventDefault();
        await requestClose();
      });
    })();

    const handleBeforeUnload = () => {
      if (!closeInProgress) {
        clearPersistWindowSizeTimer();
        persistWindowSize();
      }
      void persistSession();
    };

    const handleWindowResize = () => {
      schedulePersistWindowSize();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("resize", handleWindowResize);
    window.addEventListener("pointerdown", handleGlobalPointerDown);
    window.addEventListener("keydown", handleGlobalKeydown);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("resize", handleWindowResize);
      window.removeEventListener("pointerdown", handleGlobalPointerDown);
      window.removeEventListener("keydown", handleGlobalKeydown);
      clearPersistWindowSizeTimer();
      clearCopyFeedbackTimer();
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
    <HamburgerMenu
      menuId={ACTIONS_MENU_ID}
      canSave={!!tab}
      onNewSticky={() => void createSticky()}
      onSave={() => void saveSticky()}
      onSettings={openSettings}
    />

    <div class="drag-strip" data-tauri-drag-region>
      <span>{stickyTitleText(tab)}</span>
    </div>

    <button class="close-action" title="Sluiten" aria-label="Sluiten" on:click={() => void requestClose()}>
      Sluiten
    </button>
  </header>

  {#if errorMessage}
    <div class="error-banner" role="alert">
      <span>{errorMessage}</span>
      <button class="dismiss" aria-label="Melding sluiten" on:click={clearError}>Sluiten</button>
    </div>
  {/if}

  {#if showSettings}
    <SettingsMenu
      menuId={SETTINGS_MENU_ID}
      bind:panelElement={settingsPanelElement}
      color={stickyColor}
      opacity={stickyOpacity}
      onColorInput={handleColorInput}
      onOpacityInput={handleOpacityInput}
    />
  {/if}

  <section class="editor-shell" style="--editor-font-size: {editorFontSize}px">
    {#if tab}
      <MarkdownEditor content={tab.content} onChange={(value, cursor) => void syncTabContent(value, cursor)} />
    {:else}
      <div class="empty">Sticky laden...</div>
    {/if}
  </section>

  <button
    class="copy-fab"
    class:copied={markdownCopied}
    title={markdownCopied ? "Gekopieerd" : "Kopieer markdown"}
    aria-label={markdownCopied ? "Markdown gekopieerd" : "Kopieer markdown"}
    disabled={!tab || tab.content.length === 0}
    on:click={() => void copyMarkdown()}
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {#if markdownCopied}
        <path d="M5 12l5 5 9-9" />
      {:else}
        <rect x="9" y="9" width="10" height="10" rx="2" ry="2" />
        <path d="M6 15V7a2 2 0 0 1 2-2h8" />
      {/if}
    </svg>
  </button>

  {#if markdownCopied}
    <div class="copy-toast" role="status" aria-live="polite">Markdown gekopieerd</div>
  {/if}
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
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 4px;
    padding: 0 8px;
    border-bottom: 1px dashed rgba(56, 45, 20, 0.35);
    background: var(--sticky-toolbar);
    backdrop-filter: blur(2px);
  }

  .drag-strip {
    align-self: stretch;
    display: flex;
    align-items: center;
    padding: 0 8px;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    letter-spacing: 0.03em;
    color: var(--sticky-ink);
    user-select: none;
  }

  .close-action {
    height: 24px;
    border: none;
    border-radius: 7px;
    background: transparent;
    color: var(--sticky-action-ink);
    cursor: pointer;
    padding: 0 10px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.02em;
    transition: background-color 120ms ease, transform 120ms ease;
    text-shadow: 0 0 6px rgba(0, 0, 0, 0.18);
  }

  .close-action:hover {
    background: var(--sticky-action-hover);
  }

  .close-action:active {
    background: var(--sticky-action-active);
    transform: translateY(1px);
  }

  .copy-fab {
    position: absolute;
    left: 12px;
    bottom: 12px;
    width: 36px;
    height: 36px;
    border: none;
    border-radius: 10px;
    background: color-mix(in srgb, var(--sticky-toolbar) 84%, #fff 16%);
    color: var(--sticky-action-ink);
    box-shadow: 0 10px 22px color-mix(in srgb, var(--sticky-shadow) 70%, #000 30%);
    cursor: pointer;
    display: grid;
    place-items: center;
    z-index: 20;
    transition: transform 120ms ease, background-color 120ms ease;
  }

  .copy-fab:hover:not(:disabled) {
    background: var(--sticky-action-hover);
  }

  .copy-fab:active:not(:disabled) {
    transform: translateY(1px);
    background: var(--sticky-action-active);
  }

  .copy-fab:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .copy-fab.copied {
    background: var(--sticky-action-hover);
  }

  .copy-toast {
    position: absolute;
    left: 50%;
    bottom: 10px;
    transform: translateX(-50%);
    z-index: 25;
    pointer-events: none;
    max-width: calc(100% - 24px);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--sticky-action-active) 72%, #fff 28%);
    background: color-mix(in srgb, var(--sticky-toolbar) 88%, #fff 12%);
    color: var(--sticky-action-ink);
    padding: 6px 12px;
    font-size: 12px;
    font-weight: 600;
    box-shadow: 0 8px 18px color-mix(in srgb, var(--sticky-shadow) 60%, #000 40%);
    animation: copy-toast-in 140ms ease-out;
  }

  @keyframes copy-toast-in {
    from {
      opacity: 0;
      transform: translate(-50%, 6px);
    }

    to {
      opacity: 1;
      transform: translate(-50%, 0);
    }
  }

  .copy-fab svg {
    width: 15px;
    height: 15px;
    fill: none;
    stroke: currentcolor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
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
    font-size: var(--editor-font-size, 14px);
  }

  .editor-shell :global(.cm-content) {
    min-height: 100%;
    padding: 14px 0 56px;
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

  .editor-shell :global(.cm-line) {
    padding: 0 14px;
  }

  .editor-shell :global(.cm-cursor),
  .editor-shell :global(.cm-dropCursor) {
    border-left-color: var(--sticky-caret) !important;
    border-left-width: 2px;
  }

  .editor-shell :global(.cm-scroller) {
    background: var(--sticky-editor-bg);
    padding: 0;
    font-size: var(--editor-font-size, 14px);
    line-height: 1.45;
    color: var(--sticky-ink);
  }

  .empty {
    padding: 18px;
    font-size: 13px;
    color: var(--sticky-muted);
  }
</style>
