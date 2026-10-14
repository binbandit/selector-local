import { beforeEach, describe, expect, test } from "bun:test";
import { CHANNEL, type Request, type Response } from "@/extension/protocol";

function event<Args extends unknown[]>() {
  const listeners = new Set<(...args: Args) => unknown>();
  return {
    addListener: (listener: (...args: Args) => unknown) => { listeners.add(listener); },
    removeListener: (listener: (...args: Args) => unknown) => { listeners.delete(listener); },
    emit: (...args: Args) => { for (const listener of listeners) listener(...args); },
    count: () => listeners.size,
  };
}
const sync: Record<string, unknown> = {}, session: Record<string, unknown> = {};
let active = true, interrupted = false;
const messages: { tabId: number; message: unknown }[] = [];
const injected: unknown[] = [];
const insertedStyles: chrome.scripting.CSSInjection[] = [];
const removedStyles: chrome.scripting.CSSInjection[] = [];
const downloaded: chrome.downloads.DownloadOptions[] = [];
const store = (data: Record<string, unknown>) => ({ get: async () => ({ ...data }), set: async (value: Record<string, unknown>) => { Object.assign(data, value); } });
const onMessage = event<[unknown, chrome.runtime.MessageSender, (response: Response) => void]>();
const downloadsChanged = event<[chrome.downloads.DownloadDelta]>();
const actionClicked = event<[chrome.tabs.Tab]>();
const commands = event<[string]>();
const activated = event<[{ tabId: number; windowId: number }]>();
const updated = event<[number, { status: string }]>();
const history = event<[{ tabId: number; frameId: number }]>();
const closed = event<[unknown]>();
const fakeChrome = {
  runtime: { id: "test-extension", onMessage, onInstalled: closed, openOptionsPage: async () => {} },
  storage: { sync: store(sync), session: store(session), onChanged: event<[Record<string, unknown>, string]>() },
  action: { onClicked: actionClicked, setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
  commands: { onCommand: commands, getAll: async () => [{ name: "toggle-selector", shortcut: "Alt+Shift+S" }] },
  tabs: {
    query: async () => [{ id: 7, windowId: 1, url: "https://example.com/", active }, { id: 8, windowId: 1, url: "https://example.org/", active: false }],
    get: async (id: number) => ({ id, windowId: 1, url: "https://example.com/", active }),
    sendMessage: async (tabId: number, message: unknown) => { messages.push({ tabId, message }); },
    captureVisibleTab: async () => "data:image/png;base64,captured",
    create: async () => {}, onActivated: activated, onUpdated: updated,
  },
  scripting: { executeScript: async (args: unknown) => { injected.push(args); }, insertCSS: async (args: chrome.scripting.CSSInjection) => { insertedStyles.push(args); }, removeCSS: async (args: chrome.scripting.CSSInjection) => { removedStyles.push(args); } },
  downloads: {
    download: async (options: chrome.downloads.DownloadOptions) => { downloaded.push(options); return 42; },
    search: async () => [{ id: 42, state: interrupted ? "interrupted" : "complete", error: interrupted ? "FILE_ACCESS_DENIED" : undefined, filename: "/Users/test/Downloads/Selector/selector-test (1).png" }],
    onChanged: downloadsChanged,
  },
  contextMenus: { onClicked: event<[chrome.contextMenus.OnClickData, chrome.tabs.Tab]>(), create: () => {} },
  webNavigation: { onHistoryStateUpdated: history },
};
Object.assign(globalThis, { chrome: fakeChrome });
await import("@/extension/background");

function request(value: Request, sender: chrome.runtime.MessageSender = { id: "test-extension", tab: { id: 7 } as chrome.tabs.Tab, url: "https://example.com/" }): Promise<Response> {
  return new Promise(resolve => onMessage.emit({ channel: CHANNEL, ...value }, sender, resolve));
}
async function until(check: () => boolean) {
  for (let attempt = 0; attempt < 40; attempt++) { if (check()) return; await Bun.sleep(5); }
  throw new Error("Expected event did not occur.");
}

beforeEach(() => {
  for (const key of Object.keys(sync)) delete sync[key];
  for (const key of Object.keys(session)) delete session[key];
  messages.length = 0; injected.length = 0; downloaded.length = 0; active = true; interrupted = false;
  insertedStyles.length = 0; removedStyles.length = 0;
});

describe("browser integration through service-worker entry points", () => {
  test("two rapid toggle requests open then close instead of both opening", async () => {
    const replies = await Promise.all([request({ op: "toggle", args: {} }), request({ op: "toggle", args: {} })]);
    expect(replies.every(reply => reply.ok)).toBe(true);
    expect(session.enabled).toBe(false);
  });
  test("the page F2 trigger toggles session activation through the worker", async () => {
    expect((await request({ op: "toggle", args: {} })).ok).toBe(true);
    expect(session.enabled).toBe(true);
    expect((await request({ op: "toggle", args: {} })).ok).toBe(true);
    expect(session.enabled).toBe(false);
  });
  test("activation is broadcast and resumes on tab switch and reload", async () => {
    commands.emit("toggle-selector");
    await until(() => injected.length > 0);
    expect(session.enabled).toBe(true);
    expect(messages.filter(message => message.tabId === 8).length).toBeGreaterThan(0);
    injected.length = 0;
    activated.emit({ tabId: 8, windowId: 1 });
    await until(() => injected.length > 0);
    injected.length = 0;
    updated.emit(7, { status: "complete" });
    await until(() => injected.length > 0);
  });
  test("closing disables sticky activation across tabs", async () => {
    session.enabled = true;
    expect((await request({ op: "closed", args: {} })).ok).toBe(true);
    expect(session.enabled).toBe(false);
    expect(messages.some(message => message.tabId === 8)).toBe(true);
    activated.emit({ tabId: 8, windowId: 1 });
    await Bun.sleep(10);
    expect(injected.length).toBe(0);
  });
  test("settings survive another bootstrap and use sync storage", async () => {
    await request({ op: "settings", args: { settings: { combined: true, sharingan: false, inlineCrossOrigin: false, screenshotScope: "fullPage", shortcutCopyContext: "Mod+Alt+C", shortcutScreenshotContext: "Mod+Shift+C", shortcutMarkdown: "Mod+M" } } });
    const response = await request({ op: "bootstrap", args: {} });
    expect(response).toMatchObject({ ok: true, value: { settings: { combined: true, screenshotScope: "fullPage", shortcutCopyContext: "Mod+Alt+C" }, activationShortcut: "F2" } });
  });
  test("mount injects the picker in the MAIN world through Chrome rather than a CSP-blocked script tag", async () => {
    session.enabled = true;
    const response = await request({ op: "mount", args: {} });
    expect(response.ok).toBe(true);
    expect(injected).toContainEqual({ target: { tabId: 7 }, world: "MAIN", files: ["host.js", "vendor/editor.js"] });
  });
  test("mount gives picker styles author priority and removes both previous stylesheet origins", async () => {
    session.enabled = true;
    await request({ op: "mount", args: {} });
    expect(insertedStyles).toContainEqual({ target: { tabId: 7 }, files: ["editor.css"], origin: "AUTHOR" });
    expect(removedStyles.map(styles => styles.origin)).toContain("USER");
    expect(removedStyles.map(styles => styles.origin)).toContain("AUTHOR");
  });
  test("capture refuses an inactive tab instead of capturing another page", async () => {
    session.enabled = true; active = false;
    expect(await request({ op: "capture", args: {} })).toMatchObject({ ok: false, error: "Keep the selected tab active while capturing." });
  });
  test("disabled extension and unknown senders cannot invoke capture", async () => {
    expect((await request({ op: "capture", args: {} })).ok).toBe(false);
    session.enabled = true;
    expect((await request({ op: "capture", args: {} }, { id: "another-extension" })).ok).toBe(false);
  });
  test("downloads return the completed, browser-reported real path", async () => {
    session.enabled = true;
    const response = await request({ op: "download", args: { filename: "selector-test.png", mime: "image/png", dataURL: "data:image/png;base64,AAAA" } });
    expect(response).toEqual({ ok: true, value: { path: "/Users/test/Downloads/Selector/selector-test (1).png" } });
    expect(downloaded[0]).toMatchObject({ filename: "Selector/selector-test.png", saveAs: false, conflictAction: "uniquify" });
    expect(downloadsChanged.count()).toBe(0);
  });
  test("interrupted downloads fail and release their listeners", async () => {
    session.enabled = true; interrupted = true;
    const response = await request({ op: "download", args: { filename: "selector-test.png", mime: "image/png", dataURL: "data:image/png;base64,AAAA" } });
    expect(response).toEqual({ ok: false, error: "FILE_ACCESS_DENIED" });
    expect(downloadsChanged.count()).toBe(0);
  });
  test("SPA navigation resets page selection through a navigation event", () => {
    history.emit({ tabId: 7, frameId: 0 });
    expect(messages[0]).toEqual({ tabId: 7, message: { channel: CHANNEL, event: "navigation" } });
  });
});
