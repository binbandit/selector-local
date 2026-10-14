import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { buildTestLocators } from "@/extension/locators";
import { DEFAULT_SETTINGS } from "@/extension/protocol";

const source = await Bun.file("dist/assets/editor.js").text();
let browser: Window;
const copies: string[] = [];
const saved: unknown[] = [];

beforeEach(() => {
  browser = new Window({ url: "https://example.com/dashboard" });
  Object.defineProperty(browser.HTMLElement.prototype, "getBoundingClientRect", { configurable: true, value: () => new browser.DOMRect(20, 20, 200, 60) });
  Object.defineProperty(browser.HTMLElement.prototype, "getClientRects", { configurable: true, value: () => [new browser.DOMRect(20, 20, 200, 60)] });
  browser.document.body.innerHTML = '<main aria-label="Dashboard"><h1 id="title">Welcome back</h1><button data-testid="start">Get started</button><button>Repeat</button><button>Repeat</button></main>';
  Object.defineProperty(browser.navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => { copies.push(text); } } });
  Object.assign(globalThis, { document: browser.document, CSS: browser.CSS, getComputedStyle: browser.getComputedStyle.bind(browser) });
  Object.assign(browser, { __SELECTOR_HOST__: {
    isExtension: true, pageShortcuts: true, activationShortcut: "F2", browserShortcut: "Alt+Shift+S", initialLang: "en", initialSettings: { ...DEFAULT_SETTINGS },
    buildTestLocators,
    setSettings: (settings: unknown) => saved.push(settings),
  } });
  copies.length = 0; saved.length = 0;
  browser.eval(source);
  browser.document.dispatchEvent(new browser.Event("DOMContentLoaded"));
});
afterEach(async () => { await browser.happyDOM.close(); });

function click(selector: string) {
  const element = browser.document.querySelector(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  element.dispatchEvent(new browser.MouseEvent("click", { bubbles: true, cancelable: true, clientX: 50, clientY: 40 }));
}
async function copy() { click(".ai-editor-copy-btn"); await Bun.sleep(5); return copies.at(-1) || ""; }

describe("bundled picker interaction", () => {
  test("a selected heading exports semantic context and a locator for that exact element", async () => {
    click("#title");
    const text = await copy();
    expect(text).toContain("Page: https://example.com/dashboard");
    expect(text).toContain("Welcome back");
    expect(text).toContain('page.getByRole("heading", { name: "Welcome back", exact: true }) // verified unique');
  });
  test("the default copy shortcut invokes the bundled copy path", async () => {
    click("#title");
    browser.document.querySelector(".ai-editor-copy-btn")!.dispatchEvent(new browser.KeyboardEvent("keydown", { key: "c", code: "KeyC", ctrlKey: true, bubbles: true, cancelable: true }));
    await Bun.sleep(5);
    expect(copies.at(-1)).toContain("Welcome back");
  });
  test("clipboard failure keeps the selected element and shows failure feedback", async () => {
    Object.assign(browser.navigator.clipboard, { writeText: async () => { throw new Error("Clipboard denied"); } });
    Object.defineProperty(browser.document, "execCommand", { configurable: true, value: () => false });
    click("#title"); click(".ai-editor-copy-btn");
    await Bun.sleep(5);
    expect(browser.document.querySelector(".ai-editor-copy-btn")?.textContent).toContain("Copy failed");
    expect(browser.document.querySelector(".ai-editor-tag-label")?.textContent).toContain("Welcome back");
  });
  test("annotation is included in copied context and reflected in the selection chip", async () => {
    click("#title"); click(".ai-editor-annotate-btn:not(.ai-editor-markdown-btn)");
    const input = browser.document.querySelector(".ai-editor-annotate-input") as typeof browser.HTMLTextAreaElement.prototype;
    input.value = "Make this green and larger.";
    click(".ai-editor-annotate-done");
    expect(browser.document.querySelector(".ai-editor-tag-note")?.textContent).toBe("✎");
    expect(await copy()).toContain("instruction: Make this green and larger.");
  });
  test("test IDs are preferred and duplicate role names fall back to an exact CSS path", async () => {
    click('[data-testid="start"]');
    expect(await copy()).toContain('page.getByTestId("start") // verified unique');
    click("main button:nth-of-type(2)");
    const text = await copy();
    const expression = text.match(/test: page\.locator\(("(?:[^"\\]|\\.)*")\) \/\/ verified unique/);
    expect(expression).not.toBeNull();
    const selector = JSON.parse(expression![1]!) as string;
    expect(browser.document.querySelectorAll(selector).length).toBe(1);
    expect(browser.document.querySelector(selector)).toBe(browser.document.querySelector("main button:nth-of-type(2)"));
  });
  test("markup in page labels stays text instead of becoming picker HTML", () => {
    const title = browser.document.querySelector("#title")!;
    title.textContent = '<img src=x onerror="attack()">';
    click("#title");
    expect(browser.document.querySelector(".ai-editor-tag-label img")).toBeNull();
    expect(browser.document.querySelector(".ai-editor-tag-label")?.textContent).toContain("<img");
  });
  test("Markdown export preserves a heading", async () => {
    click("#title");
    click(".ai-editor-markdown-btn");
    await Bun.sleep(5);
    expect(browser.document.querySelector(".ai-editor-revprompt")?.textContent).toContain("# Welcome back");
    expect(await copy()).toContain("# Welcome back");
  });
  test("changing a preference calls the host persistence hook", () => {
    click('[data-action="settings"]');
    const input = browser.document.querySelector('.ai-editor-setting-row[data-setting-key="sharingan"] input') as typeof browser.HTMLInputElement.prototype;
    input.checked = true; input.dispatchEvent(new browser.Event("change", { bubbles: true }));
    expect(saved.at(-1)).toMatchObject({ sharingan: true });
  });
  test("the in-page recorder refuses the reserved browser shortcut", () => {
    click('[data-action="settings"]');
    click('[data-shortcut-key="shortcutCopyContext"] button');
    browser.document.querySelector('[data-shortcut-key="shortcutCopyContext"] button')!.dispatchEvent(new browser.KeyboardEvent("keydown", { key: "S", code: "KeyS", altKey: true, shiftKey: true, bubbles: true, cancelable: true }));
    expect(saved.length).toBe(0);
    expect(browser.document.querySelector('[data-shortcut-key="shortcutCopyContext"]')!.textContent).toContain("already assigned");
  });
  test("resetting shortcuts restores defaults without resetting screenshot preferences", () => {
    const apply = Reflect.get(browser, "__SELECTOR_APPLY_SETTINGS__") as (settings: unknown) => void;
    apply({ ...DEFAULT_SETTINGS, combined: true, screenshotScope: "fullPage", shortcutCopyContext: "Mod+Alt+K" });
    click('[data-action="settings"]');
    click('[aria-label="Reset page shortcuts"]');
    expect(saved.at(-1)).toMatchObject({ shortcutCopyContext: "Mod+C", shortcutScreenshotContext: "Mod+Shift+C", shortcutMarkdown: "Mod+M", combined: true, screenshotScope: "fullPage" });
  });
  test("personal settings omit language switching and the Pro activation panel", () => {
    click('[data-action="settings"]');
    const panel = browser.document.querySelector(".ai-editor-settings")!;
    expect(panel.textContent).toContain("Sharingan mode");
    expect(panel.querySelector('[data-setting-key="lang"]')).toBeNull();
    expect(panel.querySelector(".ai-editor-settings-pro")).toBeNull();
    expect(panel.textContent).not.toContain("Activation shortcut");
  });
  test("closing during capture cancels the later save and clipboard action", async () => {
    Object.defineProperty(browser.document.documentElement, "scrollWidth", { configurable: true, value: 1024 });
    Object.defineProperty(browser.document.documentElement, "scrollHeight", { configurable: true, value: 2000 });
    let finishCapture: (() => void) | undefined;
    let downloads = 0;
    Object.assign(Reflect.get(browser, "__SELECTOR_HOST__") as object, {
      autoSaveScreenshots: true,
      captureRegion: () => new Promise(resolve => { finishCapture = () => resolve(new browser.Blob(["png"], { type: "image/png" })); }),
      downloadFile: async () => { downloads++; return { path: "/Downloads/selector-capture.png" }; },
    });
    click("#title");
    click(".ai-editor-screenshot-btn");
    for (let attempt = 0; attempt < 40 && !finishCapture; attempt++) await Bun.sleep(2);
    expect(finishCapture).toBeDefined();
    click('[data-action="close"]');
    finishCapture!();
    await Bun.sleep(5);
    expect(downloads).toBe(0);
    expect(copies.length).toBe(0);
  });
  test("native capture saves a PNG even when an HTTP page has no clipboard API", async () => {
    Object.defineProperty(browser.navigator, "clipboard", { configurable: true, value: undefined });
    Object.defineProperty(browser.document.documentElement, "scrollWidth", { configurable: true, value: 1024 });
    Object.defineProperty(browser.document.documentElement, "scrollHeight", { configurable: true, value: 2000 });
    let downloads = 0;
    Object.assign(Reflect.get(browser, "__SELECTOR_HOST__") as object, {
      autoSaveScreenshots: true,
      captureRegion: async () => new browser.Blob(["png"], { type: "image/png" }),
      downloadFile: async () => { downloads++; return { path: "/Downloads/selector-test.png" }; },
    });
    click("#title"); click(".ai-editor-screenshot-btn");
    for (let attempt = 0; attempt < 40 && !downloads; attempt++) await Bun.sleep(2);
    expect(downloads).toBe(1);
    await Bun.sleep(2);
    expect(browser.document.querySelector(".ai-editor-screenshot-btn")?.getAttribute("title")).toContain("PNG saved to /Downloads/selector-test.png");
  });
  test("navigation while capture is pending cancels the old page's save", async () => {
    Object.defineProperty(browser.document.documentElement, "scrollWidth", { configurable: true, value: 1024 });
    Object.defineProperty(browser.document.documentElement, "scrollHeight", { configurable: true, value: 2000 });
    let finishCapture: (() => void) | undefined;
    let downloads = 0;
    Object.assign(Reflect.get(browser, "__SELECTOR_HOST__") as object, {
      autoSaveScreenshots: true,
      captureRegion: () => new Promise(resolve => { finishCapture = () => resolve(new browser.Blob(["png"], { type: "image/png" })); }),
      downloadFile: async () => { downloads++; return { path: "/Downloads/selector-test.png" }; },
    });
    click("#title"); click(".ai-editor-screenshot-btn");
    for (let attempt = 0; attempt < 40 && !finishCapture; attempt++) await Bun.sleep(2);
    expect(finishCapture).toBeDefined();
    (Reflect.get(browser, "__SELECTOR_ON_NAVIGATION__") as () => void)();
    finishCapture!();
    await Bun.sleep(5);
    expect(downloads).toBe(0);
  });
  test("a fixed selection is captured in place instead of scrolling it out of its original bounds", async () => {
    browser.document.querySelector("#title")!.setAttribute("style", "position:fixed");
    Object.defineProperty(browser, "scrollY", { configurable: true, value: 300 });
    Object.defineProperty(browser.document.documentElement, "scrollWidth", { configurable: true, value: 1024 });
    Object.defineProperty(browser.document.documentElement, "scrollHeight", { configurable: true, value: 2000 });
    let regionCaptures = 0, viewportCaptures = 0;
    Object.assign(Reflect.get(browser, "__SELECTOR_HOST__") as object, {
      captureRegion: async () => { regionCaptures++; return new browser.Blob(["png"], { type: "image/png" }); },
      grabViewportFrame: async () => { viewportCaptures++; return { width: 1024, height: 768 }; },
    });
    Object.defineProperty(browser.HTMLCanvasElement.prototype, "getContext", { configurable: true, value: () => ({ drawImage: () => {} }) });
    Object.defineProperty(browser.HTMLCanvasElement.prototype, "toBlob", { configurable: true, value: (callback: (blob: InstanceType<typeof browser.Blob>) => void) => callback(new browser.Blob(["png"], { type: "image/png" })) });
    click("#title"); click(".ai-editor-screenshot-btn");
    for (let attempt = 0; attempt < 40 && !regionCaptures && !viewportCaptures; attempt++) await Bun.sleep(2);
    expect(viewportCaptures).toBe(1);
    expect(regionCaptures).toBe(0);
  });
  test("a capture keeps its original element context if selection changes while it runs", async () => {
    Object.defineProperty(browser.document.documentElement, "scrollWidth", { configurable: true, value: 1024 });
    Object.defineProperty(browser.document.documentElement, "scrollHeight", { configurable: true, value: 2000 });
    let finishCapture: (() => void) | undefined;
    let capturedText = "";
    Object.assign(Reflect.get(browser, "__SELECTOR_HOST__") as object, {
      screenshotClipboardContext: true,
      captureRegion: () => new Promise(resolve => { finishCapture = () => resolve(new browser.Blob(["png"], { type: "image/png" })); }),
    });
    Object.assign(browser, { ClipboardItem: class { constructor(readonly parts: Record<string, Blob | Promise<Blob>>) {} } });
    Object.assign(browser.navigator.clipboard, { write: async (items: { parts: Record<string, Blob | Promise<Blob>> }[]) => {
      capturedText = await (await items[0]!.parts["text/plain"]!).text();
    } });
    click("#title"); click(".ai-editor-screenshot-btn");
    for (let attempt = 0; attempt < 40 && !finishCapture; attempt++) await Bun.sleep(2);
    expect(finishCapture).toBeDefined();
    click('[data-testid="start"]');
    finishCapture!();
    for (let attempt = 0; attempt < 40 && !capturedText; attempt++) await Bun.sleep(2);
    expect(capturedText).toContain("Welcome back");
    expect(capturedText).not.toContain("Get started");
  });
  test("changing selection while assets prepare cancels the outdated replication copy", async () => {
    let finishAssets: (() => void) | undefined;
    Object.assign(Reflect.get(browser, "__SELECTOR_HOST__") as object, { prepareAssets: () => new Promise<void>(resolve => { finishAssets = resolve; }) });
    const apply = Reflect.get(browser, "__SELECTOR_APPLY_SETTINGS__") as (settings: unknown) => void;
    apply({ ...DEFAULT_SETTINGS, sharingan: true });
    click("#title"); click(".ai-editor-copy-btn");
    expect(finishAssets).toBeDefined();
    click('[data-testid="start"]');
    finishAssets!();
    await Bun.sleep(5);
    expect(copies.length).toBe(0);
  });
});
