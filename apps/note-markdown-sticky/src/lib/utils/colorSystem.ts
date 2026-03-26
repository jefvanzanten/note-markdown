const DEFAULT_STICKY_COLOR = "#f6de76";
const DARK_TEXT = "#1f180a";
const LIGHT_TEXT = "#fff9e8";

const isValidHexColor = (value: string) => /^#[0-9a-fA-F]{6}$/.test(value);

export const normalizeHexColor = (value: string | null | undefined) => {
  if (!value) return null;
  return isValidHexColor(value) ? value.toLowerCase() : null;
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

export const mixHexColor = (hexA: string, hexB: string, ratio: number) => {
  const a = parseHexColor(hexA);
  const b = parseHexColor(hexB);
  const m = Math.max(0, Math.min(1, ratio));
  return toHexColor(a.r + (b.r - a.r) * m, a.g + (b.g - a.g) * m, a.b + (b.b - a.b) * m);
};

export const toRgba = (hex: string, alpha: number) => {
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

export const contrastColorFor = (baseHex: string) =>
  contrastRatio(baseHex, DARK_TEXT) >= contrastRatio(baseHex, LIGHT_TEXT) ? DARK_TEXT : LIGHT_TEXT;

export const deriveStickyTheme = (stickyColor: string) => {
  const stickyTextColor = contrastColorFor(stickyColor);
  const stickyIsDark = stickyTextColor === LIGHT_TEXT;
  const stickyEditorBase = stickyIsDark
    ? mixHexColor(stickyColor, "#000000", 0.16)
    : mixHexColor(stickyColor, "#ffffff", 0.18);
  const stickyToolbarBase = stickyIsDark
    ? mixHexColor(stickyEditorBase, "#000000", 0.22)
    : mixHexColor(stickyEditorBase, "#ffffff", 0.52);

  return {
    stickyLight: mixHexColor(stickyColor, "#ffffff", 0.34),
    stickyDark: mixHexColor(stickyColor, "#000000", 0.16),
    stickyBorder: toRgba(mixHexColor(stickyColor, "#000000", 0.62), 0.34),
    stickyToolbar: toRgba(stickyToolbarBase, stickyIsDark ? 0.9 : 0.86),
    stickyShadow: toRgba(mixHexColor(stickyColor, "#000000", 0.82), 0.28),
    stickyGlow: toRgba(mixHexColor(stickyColor, "#ffffff", 0.2), 0.5),
    stickyTextColor,
    stickyTextMuted: stickyIsDark ? "rgba(255, 249, 232, 0.76)" : "rgba(31, 24, 10, 0.64)",
    stickyCaret: stickyTextColor,
    stickyEditorShell: toRgba(stickyEditorBase, stickyIsDark ? 0.72 : 0.84),
    stickyActionText: stickyTextColor,
    stickyActionHover: toRgba(stickyTextColor, 0.14),
    stickyActionActive: toRgba(stickyTextColor, 0.24)
  };
};
