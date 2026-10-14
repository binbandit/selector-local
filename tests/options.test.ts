import { afterEach, beforeEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { DEFAULT_SETTINGS } from "@/extension/protocol";

const html = await Bun.file("dist/extension/options.html").text();
const source = await Bun.file("dist/extension/options.js").text();
let browser: Window;
let stored: Record<string, unknown>;
let changeListener: ((changes: Record<string, { newValue: unknown }>, area: string) => void) | undefined;

beforeEach(async () => {
  browser = new Window({ url: "https://example.com/options" });
  browser.document.write(html.replace(/<script[^>]*>[\s\S]*?<\/script>/g, ""));
  stored = { settings: { ...DEFAULT_SETTINGS } };
  changeListener = undefined;
  Object.assign(browser, { chrome: {
    storage: {
      sync: { get: async () => ({ ...stored }), set: async (value: Record<string, unknown>) => { Object.assign(stored, value); } },
      onChanged: { addListener: (listener: typeof changeListener) => { changeListener = listener; } },
    },
    commands: { getAll: async () => [{ name: "toggle-selector", shortcut: "Alt+Shift+S" }] },
    tabs: { create: async () => {} },
  } });
  browser.eval(source);
  await Bun.sleep(5);
});
afterEach(async () => { await browser.happyDOM.close(); });

function record(key: string, modifiers = {}) {
  const input = browser.document.getElementById("shortcutCopyContext")!;
  input.dispatchEvent(new browser.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...modifiers }));
}

test("the options recorder refuses F2 because F2 is reserved for activation", async () => {
  record("F2");
  await Bun.sleep(5);
  expect(stored.settings).toMatchObject({ shortcutCopyContext: "Mod+C" });
  expect(browser.document.getElementById("status")!.textContent).toContain("already in use");
});

test("typing keys require a modifier and valid custom bindings save", async () => {
  record("a");
  await Bun.sleep(5);
  expect(stored.settings).toMatchObject({ shortcutCopyContext: "Mod+C" });
  record("k", { metaKey: true, altKey: true });
  await Bun.sleep(5);
  expect(stored.settings).toMatchObject({ shortcutCopyContext: "Mod+Alt+K" });
});

test("an open options page applies settings changed from the picker", () => {
  changeListener?.({ settings: { newValue: { ...DEFAULT_SETTINGS, combined: true, screenshotScope: "fullPage" } } }, "sync");
  expect((browser.document.getElementById("combined") as typeof browser.HTMLInputElement.prototype).checked).toBe(true);
  expect((browser.document.getElementById("screenshotScope") as typeof browser.HTMLSelectElement.prototype).value).toBe("fullPage");
});
