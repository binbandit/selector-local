import { afterEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { CHANNEL, DEFAULT_SETTINGS } from "@/extension/protocol";

const source = await Bun.file("dist/extension/bridge.js").text();
let browser: Window | undefined;
afterEach(async () => { await browser?.happyDOM.close(); browser = undefined; });

function setup(deferMount = false) {
  const window = new Window({ url: "https://example.com" });
  browser = window;
  window.document.body.innerHTML = '<div class="ai-editor-root"><button id="copy">Copy</button></div>';
  const requests: string[] = [], responses: unknown[] = [];
  let enabled = false;
  let finishMount: () => void = () => {};
  let listener: ((message: unknown) => void) | undefined;
  Object.assign(window, { chrome: { runtime: {
    sendMessage: async (request: { op: string }) => {
      requests.push(request.op);
      if (request.op === "bootstrap") return { ok: true, value: { enabled, settings: DEFAULT_SETTINGS } };
      if (request.op === "mount" && deferMount) await new Promise<void>(resolve => { finishMount = resolve; });
      if (request.op === "toggle") {
        enabled = !enabled;
        queueMicrotask(() => listener?.({ channel: CHANNEL, event: enabled ? "activate" : "deactivate" }));
      }
      return { ok: true, value: null };
    },
    onMessage: { addListener: (value: (message: unknown) => void) => { listener = value; } },
  } } });
  Object.defineProperty(window, "postMessage", { value: (message: unknown) => responses.push(message) });
  window.eval(source);
  return { window, requests, responses, finishMount: () => finishMount() };
}

test("F2 opens and closes through trusted page input without an invalid manifest command", async () => {
  const { window, requests } = setup();
  await Bun.sleep(5);
  for (let index = 0; index < 2; index++) {
    const event = new window.KeyboardEvent("keydown", { key: "F2", code: "F2", bubbles: true, cancelable: true });
    Object.defineProperty(event, "isTrusted", { value: true });
    window.document.dispatchEvent(event);
    await Bun.sleep(5);
    expect(event.defaultPrevented).toBe(true);
  }
  expect(requests.filter(op => op === "toggle").length).toBe(2);
  expect(requests.filter(op => op === "mount").length).toBe(1);
});

test("page scripts cannot turn the extension on through the message bridge", async () => {
  const { window, requests, responses } = setup();
  await Bun.sleep(5);
  window.eval(`const attempt = new MessageEvent("message", { data: { channel: "${CHANNEL}", direction: "page", id: "untrusted-toggle", op: "toggle", args: {} } });
    Object.defineProperty(attempt, "source", { value: window }); window.dispatchEvent(attempt);`);
  await Bun.sleep(5);
  expect(requests).not.toContain("toggle");
  expect(responses.at(-1)).toMatchObject({ id: "untrusted-toggle", ok: false });
});
test("F2 in a shortcut recorder is left for validation instead of toggling the extension", async () => {
  const { window, requests } = setup();
  await Bun.sleep(5);
  const button = window.document.getElementById("copy")!;
  button.className = "ai-editor-shortcut-record";
  const event = new window.KeyboardEvent("keydown", { key: "F2", code: "F2", bubbles: true, cancelable: true });
  Object.defineProperty(event, "isTrusted", { value: true });
  button.dispatchEvent(event);
  await Bun.sleep(5);
  expect(requests).not.toContain("toggle");
});

test("closing while injection is pending cannot leave the bridge active", async () => {
  const { window, requests, responses, finishMount } = setup(true);
  await Bun.sleep(5);
  for (let index = 0; index < 2; index++) {
    const event = new window.KeyboardEvent("keydown", { key: "F2", code: "F2", bubbles: true, cancelable: true });
    Object.defineProperty(event, "isTrusted", { value: true });
    window.document.dispatchEvent(event);
    await Bun.sleep(5);
  }
  expect(requests).toContain("mount");
  finishMount();
  await Bun.sleep(5);
  window.eval(`const pointer = new PointerEvent("pointerdown", { bubbles: true }); Object.defineProperty(pointer, "isTrusted", { value: true }); document.getElementById("copy").dispatchEvent(pointer);
    const attempt = new MessageEvent("message", { data: { channel: "${CHANNEL}", direction: "page", id: "after-close", op: "capture", args: {} } }); Object.defineProperty(attempt, "source", { value: window }); window.dispatchEvent(attempt);`);
  await Bun.sleep(5);
  expect(requests).not.toContain("capture");
  expect(responses.at(-1)).toMatchObject({ id: "after-close", ok: false });
});
