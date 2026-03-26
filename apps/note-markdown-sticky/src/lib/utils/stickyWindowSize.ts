export const STICKY_WINDOW_SIZE_STORAGE_KEY = "note-markdown-sticky-window-size-v1";

type StickyWindowSize = {
  width: number;
  height: number;
};

const normalizeDimension = (value: unknown, minimum: number) => {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return Math.max(minimum, Math.round(value));
};

export const readStoredWindowSize = (minWidth: number, minHeight: number): StickyWindowSize | null => {
  try {
    const raw = localStorage.getItem(STICKY_WINDOW_SIZE_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<StickyWindowSize> | null;
    if (!parsed || typeof parsed !== "object") return null;

    const width = normalizeDimension(parsed.width, minWidth);
    const height = normalizeDimension(parsed.height, minHeight);
    if (width === null || height === null) return null;

    return { width, height };
  } catch {
    return null;
  }
};

export const saveWindowSize = (width: number, height: number, minWidth: number, minHeight: number) => {
  const nextWidth = normalizeDimension(width, minWidth);
  const nextHeight = normalizeDimension(height, minHeight);
  if (nextWidth === null || nextHeight === null) return;

  try {
    localStorage.setItem(
      STICKY_WINDOW_SIZE_STORAGE_KEY,
      JSON.stringify({ width: nextWidth, height: nextHeight })
    );
  } catch {
    // ignore storage write failures
  }
};
