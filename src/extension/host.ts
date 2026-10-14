import { buildTestLocators } from "@/extension/locators";
import { UI_EXTRAS } from "@/extension/ui";
import { CHANNEL, DEFAULT_SETTINGS, isRecord, normalizeSettings, type Geometry, type Operation, type Operations, type Preferences, type Settings } from "@/extension/protocol";

interface SelectorWindow extends Window {
  __SELECTOR_LOCAL_CONFIG__?: Preferences & { activationShortcut: string; browserShortcut: string };
  __SELECTOR_LOCAL_HOST_READY__?: boolean;
  __SELECTOR_HOST__?: object;
  __SELECTOR_DESTROY__?: () => void;
  __SELECTOR_ON_REACTIVATE__?: () => void;
  __SELECTOR_ON_NAVIGATION__?: () => void;
  __SELECTOR_APPLY_SETTINGS__?: (settings: Settings) => void;
}
const page = window as SelectorWindow;
const pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
const assets = new Map<string, string>();
const stylesheets = new Map<string, CSSRuleList>();
let closingFromHost = false;
let capturing = false;
let resourceGeneration = 0;

function rpc<K extends Operation>(op: K, args: Operations[K]["args"]): Promise<Operations[K]["result"]> {
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error("Selector request timed out. Reload the extension and page.")); }, 75_000);
    pending.set(id, {
      resolve: value => { clearTimeout(timeout); resolve(value as Operations[K]["result"]); },
      reject: error => { clearTimeout(timeout); reject(error); },
    });
    window.postMessage({ channel: CHANNEL, direction: "page", id, op, args }, location.origin);
  });
}

function rememberSettings(settings: Settings) {
  const next = normalizeSettings(settings);
  if (page.__SELECTOR_LOCAL_CONFIG__) page.__SELECTOR_LOCAL_CONFIG__.settings = next;
  void rpc("settings", { settings: next }).catch(error => {
    console.warn("[Selector Local] Settings could not be saved:", error);
    void rpc("bootstrap", {}).then(saved => {
      page.__SELECTOR_LOCAL_CONFIG__ = saved;
      page.__SELECTOR_APPLY_SETTINGS__?.(saved.settings);
    });
  });
}

async function toDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Cannot read capture."));
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Cannot encode capture."));
    reader.readAsDataURL(blob);
  });
}

async function viewport(): Promise<HTMLImageElement> {
  const source = await rpc("capture", {});
  const image = new Image();
  image.src = source;
  await image.decode();
  return image;
}

const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

async function captureRegion(_scope: string, region: Geometry): Promise<Blob> {
  if (capturing) throw new Error("A screenshot is already being captured.");
  if (![region.x, region.y, region.w, region.h, region.dpr].every(Number.isFinite)) throw new Error("Invalid capture bounds.");
  const root = document.documentElement;
  const x = Math.max(0, region.x), y = Math.max(0, region.y);
  const width = Math.min(region.w, root.scrollWidth - x);
  const height = Math.min(region.h, Math.max(root.scrollHeight, document.body?.scrollHeight || 0) - y);
  const ratio = region.dpr || devicePixelRatio || 1;
  const outputWidth = Math.round(width * ratio), outputHeight = Math.round(height * ratio);
  if (outputWidth < 1 || outputHeight < 1 || outputWidth > 32_000 || outputHeight > 32_000 || outputWidth * outputHeight > 60_000_000) {
    throw new Error("This capture is too large. Select a smaller element.");
  }
  const canvas = document.createElement("canvas");
  canvas.width = outputWidth; canvas.height = outputHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Cannot create screenshot canvas.");
  const savedScroll = { x: scrollX, y: scrollY };
  const fixed = [...document.querySelectorAll<HTMLElement>("body *")].filter(element =>
    !element.closest(".ai-editor-layer, .ai-editor-root") && /^(fixed|sticky)$/.test(getComputedStyle(element).position));
  const previousVisibility = fixed.map(element => [element, element.style.getPropertyValue("visibility"), element.style.getPropertyPriority("visibility")] as const);
  const motion = document.createElement("style");
  motion.textContent = ".ai-editor-root { display: none !important; } html, body { scroll-behavior: auto !important; scroll-snap-type: none !important; overflow-anchor: none !important; } *, *::before, *::after { animation-play-state: paused !important; transition: none !important; caret-color: transparent !important; }";
  capturing = true;
  document.documentElement.appendChild(motion);
  try {
    await document.fonts.ready;
    const stepX = root.clientWidth, stepY = root.clientHeight;
    if (stepX < 1 || stepY < 1) throw new Error("Page has no visible viewport.");
    let tile = 0;
    for (let top = y; top < y + height; top += stepY) {
      for (let left = x; left < x + width; left += stepX) {
        if (tile++ > 0) fixed.forEach(element => element.style.setProperty("visibility", "hidden", "important"));
        window.scrollTo({ left, top, behavior: "instant" });
        await nextFrame();
        const frame = await viewport();
        const scaleX = frame.naturalWidth / innerWidth, scaleY = frame.naturalHeight / innerHeight;
        const tileWidth = Math.min(stepX, x + width - left), tileHeight = Math.min(stepY, y + height - top);
        const sourceX = left - scrollX, sourceY = top - scrollY;
        if (sourceX < -1 || sourceY < -1 || sourceX + tileWidth > innerWidth + 1 || sourceY + tileHeight > innerHeight + 1) {
          throw new Error("Page layout changed during capture. Try again after it finishes loading.");
        }
        const destX = Math.round((left - x) * ratio), destY = Math.round((top - y) * ratio);
        const destWidth = Math.round((left - x + tileWidth) * ratio) - destX;
        const destHeight = Math.round((top - y + tileHeight) * ratio) - destY;
        context.drawImage(frame, sourceX * scaleX, sourceY * scaleY, tileWidth * scaleX, tileHeight * scaleY, destX, destY, destWidth, destHeight);
      }
    }
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Cannot encode screenshot.")), "image/png"));
  } finally {
    for (const [element, value, priority] of previousVisibility) {
      if (value) element.style.setProperty("visibility", value, priority); else element.style.removeProperty("visibility");
    }
    window.scrollTo({ left: savedScroll.x, top: savedScroll.y, behavior: "instant" });
    motion.remove();
    capturing = false;
  }
}

async function cacheAsset(url: string, kind: "image" | "font") {
  if (assets.has(url) || !/^https?:/.test(url)) return;
  const generation = resourceGeneration;
  try {
    const data = await rpc("asset", { url, kind });
    if (generation === resourceGeneration) assets.set(url, data);
  } catch { /* Keep the original resource URL when it cannot be fetched. */ }
}

async function prepareAssets(elements: Element[]) {
  const images = new Set<HTMLImageElement>();
  elements.forEach(element => {
    if (element instanceof HTMLImageElement) images.add(element);
    element.querySelectorAll("img").forEach(image => images.add(image));
  });
  const urls = [...images].slice(0, 40).map(image => image.currentSrc || image.src);
  for (let index = 0; index < urls.length; index += 4) await Promise.all(urls.slice(index, index + 4).map(url => cacheAsset(url, "image")));
}

function wrapImport(css: string, conditions: string): string {
  if (!css) return "";
  let rest = conditions.trim();
  const wrappers: string[] = [];
  while (rest) {
    const modifier = /^(layer|supports|scope)(?=\s|\(|$)/i.exec(rest);
    if (!modifier) break;
    const kind = modifier[1]!.toLowerCase();
    rest = rest.slice(modifier[0].length).trimStart();
    let value = "";
    if (rest.startsWith("(")) {
      let depth = 0, quote = "", end = 0;
      for (; end < rest.length; end++) {
        const char = rest[end]!;
        if (char === "\\") { end++; continue; }
        if (quote) { if (char === quote) quote = ""; continue; }
        if (char === '"' || char === "'") { quote = char; continue; }
        if (char === "(") depth++;
        if (char === ")" && --depth === 0) break;
      }
      if (depth !== 0) throw new Error("Invalid stylesheet import condition.");
      value = rest.slice(1, end).trim();
      rest = rest.slice(end + 1).trimStart();
    }
    if (kind === "supports" && /^[\w-]+\s*:/.test(value)) value = `(${value})`;
    if (kind === "scope" && value && !value.startsWith("(")) value = `(${value})`;
    wrappers.push(`@${kind}${value ? ` ${value}` : ""}`);
  }
  if (rest) wrappers.push(`@media ${rest}`);
  return wrappers.reduceRight((content, wrapper) => `${wrapper} { ${content} }`, css);
}

async function prepareStyles() {
  if (page.__SELECTOR_LOCAL_CONFIG__?.settings.inlineCrossOrigin === false) return;
  const generation = resourceGeneration;
  const loaded = new Set<string>();
  async function loadSheet(href: string, depth = 0): Promise<CSSRuleList | null> {
    if (stylesheets.has(href)) return stylesheets.get(href)!;
    if (loaded.has(href) || depth > 3 || loaded.size >= 20) return null;
    loaded.add(href);
    try {
      let css = await rpc("asset", { url: href, kind: "stylesheet" });
      const imports = [...css.matchAll(/@import\s+(?:url\(\s*(?:"([^"]+)"|'([^']+)'|([^\s)]+))\s*\)|"([^"]+)"|'([^']+)')\s*([^;]*);/gi)];
      for (const entry of imports) {
        const target = new URL((entry[1] || entry[2] || entry[3] || entry[4] || entry[5])!, href).href;
        const rules = await loadSheet(target, depth + 1);
        const conditions = entry[6]!.trim();
        const imported = rules ? [...rules].map(rule => rule.cssText).join("\n") : "";
        css = css.replace(entry[0], wrapImport(imported, conditions));
      }
      css = css.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/g, (whole: string, _quote: string, url: string) => {
        try { return `url(${JSON.stringify(new URL(url.trim(), href).href)})`; } catch { return whole; }
      });
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
      if (generation !== resourceGeneration) return null;
      stylesheets.set(href, sheet.cssRules);
      return sheet.cssRules;
    } catch { return null; }
  }
  for (const sheet of [...document.styleSheets]) {
    if (sheet.href && !sheet.href.startsWith("chrome-extension:")) {
      try { void sheet.cssRules; } catch { await loadSheet(sheet.href); }
    }
  }
  const fonts = new Set<string>();
  if (generation !== resourceGeneration) return;
  function findFonts(rules: CSSRuleList) {
    for (const rule of [...rules]) {
      if (rule instanceof CSSFontFaceRule) {
        const base = rule.parentStyleSheet?.href || document.baseURI;
        for (const url of rule.style.getPropertyValue("src").matchAll(/url\(\s*["']?([^"')]+)/g)) {
          try { fonts.add(new URL(url[1]!, base).href); } catch { /* Ignore malformed URLs. */ }
        }
      } else if ("cssRules" in rule) findFonts((rule as CSSGroupingRule).cssRules);
    }
  }
  for (const sheet of [...document.styleSheets]) {
    try { findFonts(sheet.cssRules); } catch { const cached = sheet.href && stylesheets.get(sheet.href); if (cached) findFonts(cached); }
  }
  const urls = [...fonts].slice(0, 16);
  for (let index = 0; index < urls.length; index += 4) await Promise.all(urls.slice(index, index + 4).map(url => cacheAsset(url, "font")));
}

if (!page.__SELECTOR_LOCAL_HOST_READY__) {
  // A bookmarklet instance holds its original host in a closure. Replace it
  // before mounting so the extension cannot inherit weaker capture behavior.
  page.__SELECTOR_DESTROY__?.();
  page.__SELECTOR_LOCAL_HOST_READY__ = true;
  window.addEventListener("message", (event: MessageEvent<unknown>) => {
    if (event.source !== window || !isRecord(event.data) || event.data.channel !== CHANNEL || event.data.direction !== "host") return;
    const data = event.data;
    if (typeof data.id === "string") {
      const request = pending.get(data.id);
      if (request) { pending.delete(data.id); if (data.ok) request.resolve(data.value); else request.reject(new Error(String(data.error))); }
      return;
    }
    if (data.event === "reactivate") page.__SELECTOR_ON_REACTIVATE__?.();
    if (data.event === "navigation") {
      resourceGeneration++;
      assets.clear(); stylesheets.clear();
      page.__SELECTOR_ON_NAVIGATION__?.();
    }
    if (data.event === "destroy") {
      closingFromHost = true;
      try { page.__SELECTOR_DESTROY__?.(); } finally { closingFromHost = false; }
    }
    if (data.event === "preferences" && isRecord(data.value)) {
      const next = { settings: normalizeSettings(data.value.settings) };
      page.__SELECTOR_LOCAL_CONFIG__ = { ...next, activationShortcut: page.__SELECTOR_LOCAL_CONFIG__?.activationShortcut || "", browserShortcut: page.__SELECTOR_LOCAL_CONFIG__?.browserShortcut || "" };
      page.__SELECTOR_APPLY_SETTINGS__?.(next.settings);
    }
  });
  page.__SELECTOR_HOST__ = {
    isExtension: true,
    pageShortcuts: true,
    autoSaveScreenshots: true,
    screenshotClipboardContext: true,
    get initialSettings() { return page.__SELECTOR_LOCAL_CONFIG__?.settings || DEFAULT_SETTINGS; },
    get activationShortcut() { return page.__SELECTOR_LOCAL_CONFIG__?.activationShortcut ?? "F2"; },
    get browserShortcut() { return page.__SELECTOR_LOCAL_CONFIG__?.browserShortcut ?? "Alt+Shift+S"; },
    setSettings: rememberSettings,
    onClosed: () => { if (!closingFromHost) void rpc("closed", {}); },
    openShortcutSettings: () => { void rpc("shortcuts", {}); },
    grabViewportFrame: viewport,
    captureRegion,
    downloadFile: async (filename: string, blob: Blob, mime: "image/png" | "text/markdown") => rpc("download", { filename, dataURL: await toDataURL(blob), mime }),
    buildTestLocators,
    prepareAssets,
    prepareStyles,
    cachedAssetDataURL: (url: string) => assets.get(url),
    cachedFontDataURL: (url: string) => assets.get(url),
    cachedStylesheetRules: (url: string) => stylesheets.get(url),
    uiExtras: UI_EXTRAS,
  };
}
