import { normalizeHexColor } from "./colorSystem";

export const STICKY_STYLE_STORAGE_KEY = "note-markdown-sticky-style-v1";
export const DEFAULT_STICKY_COLOR = "#f6de76";
export const DEFAULT_STICKY_OPACITY = 1;
export const PRESET_STICKY_COLORS = ["#f6de76", "#f8c3a8", "#f2f0b4", "#c8f0be", "#bedff8", "#d7c7f5"];

export type StickyStyle = { color?: string; opacity?: number };
export type StickyStyleMap = Record<string, StickyStyle>;

export const normalizeOpacity = (value: unknown) => {
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

export const applyStoredStyle = (tabId: string) => {
  const styles = readStickyStyles();
  const style = styles[tabId];
  const color = normalizeHexColor(style?.color) ?? DEFAULT_STICKY_COLOR;
  const opacity = normalizeOpacity(style?.opacity) ?? DEFAULT_STICKY_OPACITY;
  return { color, opacity };
};

export const saveStyleForTab = (tabId: string, color: string, opacity: number) => {
  const styles = readStickyStyles();
  styles[tabId] = { color, opacity };
  writeStickyStyles(styles);
};

export const removeStyleForTab = (tabId: string) => {
  const styles = readStickyStyles();
  if (!(tabId in styles)) return;
  delete styles[tabId];
  writeStickyStyles(styles);
};
