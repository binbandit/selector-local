export const CHANNEL = "selector-local-v1";

export const DEFAULT_SETTINGS = {
  combined: false,
  sharingan: false,
  inlineCrossOrigin: true,
  screenshotScope: "fullElement",
  shortcutCopyContext: "Mod+C",
  shortcutScreenshotContext: "Mod+Shift+C",
  shortcutMarkdown: "Mod+M",
} as const;

export interface Settings {
  combined: boolean;
  sharingan: boolean;
  inlineCrossOrigin: boolean;
  screenshotScope: "viewport" | "fullElement" | "fullPage";
  shortcutCopyContext: string;
  shortcutScreenshotContext: string;
  shortcutMarkdown: string;
}

export interface Preferences { settings: Settings }
export interface Geometry { x: number; y: number; w: number; h: number; dpr: number; pageWidth: number }
export interface Operations {
  mount: { args: Record<string, never>; result: null };
  toggle: { args: Record<string, never>; result: null };
  bootstrap: { args: Record<string, never>; result: Preferences & { enabled: boolean; activationShortcut: string; browserShortcut: string } };
  settings: { args: { settings: Settings }; result: null };
  closed: { args: Record<string, never>; result: null };
  capture: { args: Record<string, never>; result: string };
  asset: { args: { url: string; kind: "image" | "font" | "stylesheet" }; result: string };
  download: { args: { filename: string; dataURL: string; mime: "image/png" | "text/markdown" }; result: { path: string } };
  shortcuts: { args: Record<string, never>; result: null };
}
export type Operation = keyof Operations;
export type Request = { [K in Operation]: { op: K; args: Operations[K]["args"] } }[Operation];
export type Response = { ok: true; value: unknown } | { ok: false; error: string };

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeSettings(value: unknown): Settings {
  const source = isRecord(value) ? value : {};
  const scope = source.screenshotScope;
  const shortcut = (key: "shortcutCopyContext" | "shortcutScreenshotContext" | "shortcutMarkdown") =>
    typeof source[key] === "string" && source[key].length <= 80 ? source[key] : DEFAULT_SETTINGS[key];
  return {
    combined: source.combined === true,
    sharingan: source.sharingan === true,
    inlineCrossOrigin: source.inlineCrossOrigin !== false,
    screenshotScope: scope === "viewport" || scope === "fullPage" ? scope : "fullElement",
    shortcutCopyContext: shortcut("shortcutCopyContext"),
    shortcutScreenshotContext: shortcut("shortcutScreenshotContext"),
    shortcutMarkdown: shortcut("shortcutMarkdown"),
  };
}

export function parseRequest(value: unknown): Request | null {
  if (!isRecord(value) || !isRecord(value.args)) return null;
  const args = value.args;
  switch (value.op) {
    case "mount": case "toggle": case "bootstrap": case "closed": case "capture": case "shortcuts": return { op: value.op, args: {} };
    case "settings": return { op: "settings", args: { settings: normalizeSettings(args.settings) } };
    case "asset": {
      if (typeof args.url !== "string" || args.url.length > 4096) return null;
      if (args.kind !== "image" && args.kind !== "font" && args.kind !== "stylesheet") return null;
      try { if (!/^https?:$/.test(new URL(args.url).protocol)) return null; } catch { return null; }
      return { op: "asset", args: { url: args.url, kind: args.kind } };
    }
    case "download": {
      if (typeof args.filename !== "string" || args.filename.length > 200 || !/^selector-[\p{L}\p{N}_.-]+\.(png|md)$/u.test(args.filename)) return null;
      if (args.mime !== "image/png" && args.mime !== "text/markdown") return null;
      if (!args.filename.endsWith(args.mime === "image/png" ? ".png" : ".md")) return null;
      if (typeof args.dataURL !== "string" || !args.dataURL.startsWith(`data:${args.mime};base64,`) || args.dataURL.length > 80_000_000) return null;
      return { op: "download", args: { filename: args.filename, dataURL: args.dataURL, mime: args.mime } };
    }
    default: return null;
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
