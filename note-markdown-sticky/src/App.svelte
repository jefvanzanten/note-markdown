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

  const currentWindow = getCurrentWindow();
  const requestedTabId = new URLSearchParams(window.location.search).get("tabId");
  const STICKY_WIDTH = 380;
  const STICKY_HEIGHT = 430;
  const STICKY_STYLE_STORAGE_KEY = "note-markdown-sticky-style-v1";
  const DEFAULT_STICKY_COLOR = "#f6de76";
  const DEFAULT_STICKY_OPACITY = 1;
  const presetColors = ["#f6de76", "#f8c3a8", "#f2f0b4", "#c8f0be", "#bedff8", "#d7c7f5"];

  type StickyStyle = { color?: string; opacity?: number };
  type StickyStyleMap = Record<string, StickyStyle>;

  let tab: TabDto | null = null;
  let sessionSaveDirectory: string | null = null;
  let closeInProgress = false;
  let showSettings = false;
  let stickyColor = DEFAULT_STICKY_COLOR;
  let stickyOpacity = DEFAULT_STICKY_OPACITY;
  let settingsButtonElement: HTMLButtonElement | null = null;
  let settingsPanelElement: HTMLDivElement | null = null;

  const isValidHexColor = (value: string) => /^#[0-9a-fA-F]{6}$/.test(value);

  const normalizeHexColor = (value: string | null | undefined) => {
    if (!value) return null;
    return isValidHexColor(value) ? value.toLowerCase() : null;
  };

  const normalizeOpacity = (value: unknown) => {
    if (typeof value !== "number" || Number.isNaN(value)) return null;
    return Math.max(0.3, Math.min(1, value));
  };

  const readStickyStyles = (): StickyStyleMap => {
    try {
      const raw = localStorage.getItem(STICKY_STYLE_STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as StickyStyleMap;
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  };

  const writeStickyStyles = (next: StickyStyleMap) => {
    try {
      localStorage.setItem(STICKY_STYLE_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore storage write failures
    }
  };

  const applyStoredStyle = (tabId: string) => {
    const styles = readStickyStyles();
    const style = styles[tabId];
    const storedColor = normalizeHexColor(style?.color);
    const storedOpacity = normalizeOpacity(style?.opacity);
    stickyColor = storedColor ?? DEFAULT_STICKY_COLOR;
    stickyOpacity = storedOpacity ?? DEFAULT_STICKY_OPACITY;
  };

  const saveStyleForTab = (tabId: string, color: string, opacity: number) => {
    const styles = readStickyStyles();
    styles[tabId] = { color, opacity };
    writeStickyStyles(styles);
  };

  const removeColorForTab = (tabId: string) => {
    const styles = readStickyStyles();
    if (!(tabId in styles)) return;
    delete styles[tabId];
    writeStickyStyles(styles);
  };

  const parseHexColor = (hex: string) => {
    const normalized = normalizeHexColor(hex) ?? DEFAULT_STICKY_COLOR;
    const value = normalized.slice(1);
    return {
      r: parseInt(value.slice(0, 2), 16),
      g: parseInt(value.slice(2, 4), 16),
      b: parseInt(value.slice(4, 6), 16)
    };
  };

  const toHexColor = (r: number, g: number, b: number) => {
    const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
    return `#${[clamp(r), clamp(g), clamp(b)].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
  };

  const mixHexColor = (hexA: string, hexB: string, ratio: number) => {
    const a = parseHexColor(hexA);
    const b = parseHexColor(hexB);
    const m = Math.max(0, Math.min(1, ratio));
    return toHexColor(a.r + (b.r - a.r) * m, a.g + (b.g - a.g) * m, a.b + (b.b - a.b) * m);
  };

  const toRgba = (hex: string, alpha: number) => {
    const { r, g, b } = parseHexColor(hex);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const colorLuminance = (hex: string) => {
    const { r, g, b } = parseHexColor(hex);
    const toLinear = (value: number) => {
      const c = value / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };

    return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  };

  const contrastRatio = (hexA: string, hexB: string) => {
    const a = colorLuminance(hexA);
    const b = colorLuminance(hexB);
    const brightest = Math.max(a, b);
    const darkest = Math.min(a, b);
    return (brightest + 0.05) / (darkest + 0.05);
  };

  const contrastColorFor = (baseHex: string) => {
    const dark = "#1f180a";
    const light = "#fff9e8";
    return contrastRatio(baseHex, dark) >= contrastRatio(baseHex, light) ? dark : light;
  };

  const setStickyColor = (nextColor: string) => {
    const normalized = normalizeHexColor(nextColor) ?? DEFAULT_STICKY_COLOR;
    stickyColor = normalized;
    if (tab) {
      saveStyleForTab(tab.tab_id, normalized, stickyOpacity);
    }
  };

  const setStickyOpacity = (nextOpacity: number) => {
    const normalized = normalizeOpacity(nextOpacity) ?? DEFAULT_STICKY_OPACITY;
    stickyOpacity = normalized;
    if (tab) {
      saveStyleForTab(tab.tab_id, stickyColor, normalized);
    }
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

  const toggleSettings = () => {
    showSettings = !showSettings;
  };

  const closeSettings = () => {
    showSettings = false;
  };

  const toDirectory = (path: string | null) => {
    if (!path) return null;
    const normalized = path.replace(/\//g, "\\");
    const idx = normalized.lastIndexOf("\\");
    return idx > 0 ? normalized.slice(0, idx) : null;
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

  const stickySaveName = (current: TabDto) => {
    if (current.is_temp) return "sticky";
    return current.title;
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
    applyStoredStyle(nextTab.tab_id);
  };

  const syncTabContent = async (content: string, cursor: number) => {
    if (!tab) return;
    if (tab.content === content && tab.cursor === cursor) return;

    const current = tab;
    tab = { ...current, content, cursor, is_dirty: true };
    await updateTabContent(current.tab_id, content, cursor);
  };

  const createSticky = async () => {
    const created = await newNote();
    await openStickyWindow(created.tab_id);
  };

  const saveSticky = async () => {
    if (!tab) return;
    const current = tab;
    const result = await saveTab(current.tab_id).catch(() => null);
    if (!result) {
      const saveAsResult = await saveTabAs(current.tab_id, sessionSaveDirectory, stickySaveName(current));
      if (!saveAsResult) return;
      setCurrentTab(saveAsResult.tab);
      return;
    }

    setCurrentTab(result.tab);
  };

  const saveStickyAs = async () => {
    if (!tab) return;
    const result = await saveTabAs(tab.tab_id, sessionSaveDirectory, stickySaveName(tab));
    if (!result) return;
    setCurrentTab(result.tab);
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
        removeColorForTab(current.tab_id);
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
    const restored = await listRestoreSession();

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

  let stickyLight = mixHexColor(stickyColor, "#ffffff", 0.34);
  let stickyDark = mixHexColor(stickyColor, "#000000", 0.16);
  let stickyBorder = toRgba(mixHexColor(stickyColor, "#000000", 0.62), 0.34);
  let stickyToolbar = toRgba(mixHexColor(stickyColor, "#ffffff", 0.55), 0.8);
  let stickyShadow = toRgba(mixHexColor(stickyColor, "#000000", 0.82), 0.28);
  let stickyGlow = toRgba(mixHexColor(stickyColor, "#ffffff", 0.2), 0.5);
  let stickyTextColor = contrastColorFor(stickyColor);
  let stickyIsDark = stickyTextColor === "#fff9e8";
  let stickyTextMuted = stickyIsDark ? "rgba(255, 249, 232, 0.76)" : "rgba(31, 24, 10, 0.64)";
  let stickyCaret = stickyTextColor;
  let stickyEditorShell = stickyIsDark ? "rgba(22, 18, 10, 0.3)" : "rgba(255, 253, 228, 0.62)";
  let stickyActionText = stickyTextColor;
  let stickyActionHover = toRgba(stickyActionText, 0.14);
  let stickyActionActive = toRgba(stickyActionText, 0.24);

  $: stickyLight = mixHexColor(stickyColor, "#ffffff", 0.34);
  $: stickyDark = mixHexColor(stickyColor, "#000000", 0.16);
  $: stickyBorder = toRgba(mixHexColor(stickyColor, "#000000", 0.62), 0.34);
  $: stickyToolbar = toRgba(mixHexColor(stickyColor, "#ffffff", 0.55), 0.8);
  $: stickyShadow = toRgba(mixHexColor(stickyColor, "#000000", 0.82), 0.28);
  $: stickyGlow = toRgba(mixHexColor(stickyColor, "#ffffff", 0.2), 0.5);
  $: stickyTextColor = contrastColorFor(stickyColor);
  $: stickyIsDark = stickyTextColor === "#fff9e8";
  $: stickyTextMuted = stickyIsDark ? "rgba(255, 249, 232, 0.76)" : "rgba(31, 24, 10, 0.64)";
  $: stickyCaret = stickyTextColor;
  $: stickyEditorShell = stickyIsDark ? "rgba(22, 18, 10, 0.3)" : "rgba(255, 253, 228, 0.62)";
  $: stickyActionText = stickyTextColor;
  $: stickyActionHover = toRgba(stickyActionText, 0.14);
  $: stickyActionActive = toRgba(stickyActionText, 0.24);

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
    --sticky-light: {stickyLight};
    --sticky-dark: {stickyDark};
    --sticky-border: {stickyBorder};
    --sticky-toolbar: {stickyToolbar};
    --sticky-shadow: {stickyShadow};
    --sticky-glow: {stickyGlow};
    --sticky-ink: {stickyTextColor};
    --sticky-muted: {stickyTextMuted};
    --sticky-caret: {stickyCaret};
    --sticky-editor-bg: {stickyEditorShell};
    --sticky-action-ink: {stickyActionText};
    --sticky-action-hover: {stickyActionHover};
    --sticky-action-active: {stickyActionActive};
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

  {#if showSettings}
    <div bind:this={settingsPanelElement} class="settings-popover">
      <label for="sticky-color">Sticky kleur</label>
      <input id="sticky-color" type="color" value={stickyColor} on:input={handleColorInput} />

      <div class="opacity-group">
        <label for="sticky-opacity">Opacity ({Math.round(stickyOpacity * 100)}%)</label>
        <input
          id="sticky-opacity"
          type="range"
          min="0.3"
          max="1"
          step="0.05"
          value={stickyOpacity}
          on:input={handleOpacityInput}
        />
      </div>

      <div class="swatches">
        {#each presetColors as color}
          <button
            class:active={stickyColor === color}
            class="swatch"
            style="background: {color}"
            title={color}
            on:click={() => setStickyColor(color)}
          ></button>
        {/each}
      </div>
    </div>
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
    grid-template-rows: 36px 1fr;
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

  .action.close {
    color: var(--sticky-action-ink);
  }

  .action.settings {
    transform: rotate(0deg);
  }

  .action.settings:hover:not(:disabled) {
    transform: rotate(20deg);
  }

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

  .editor-shell {
    min-height: 0;
    background: var(--sticky-editor-bg);
  }

  .editor-shell :global(.cm-editor) {
    height: 100%;
    background: transparent;
  }

  .editor-shell :global(.cm-content) {
    color: var(--sticky-ink);
    caret-color: var(--sticky-caret);
  }

  .editor-shell :global(.cm-cursor),
  .editor-shell :global(.cm-dropCursor) {
    border-left-color: var(--sticky-caret) !important;
    border-left-width: 2px;
  }

  .editor-shell :global(.cm-scroller) {
    padding: 14px 14px 18px;
    font-size: 14px;
    line-height: 1.45;
    color: #2b230f;
  }

  .empty {
    padding: 18px;
    font-size: 13px;
    color: var(--sticky-muted);
  }
</style>
