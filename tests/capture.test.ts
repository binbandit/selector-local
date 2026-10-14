import { afterEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { CHANNEL, type Geometry } from "@/extension/protocol";

const source = await Bun.file("dist/extension/host.js").text();
let browser: Window | undefined;
afterEach(async () => { await browser?.happyDOM.close(); browser = undefined; });

function setup(failAt = 0, oldPicker = false) {
  const window = new Window({ url: "https://example.com/" });
  browser = window;
  window.document.body.innerHTML = '<header style="position:fixed;visibility:visible!important">Sticky header</header><main>Long element</main>';
  for (const [key, value] of Object.entries({ innerWidth: 800, innerHeight: 600, scrollX: 10, scrollY: 40, devicePixelRatio: 2 })) Object.defineProperty(window, key, { value, writable: true, configurable: true });
  const root = window.document.documentElement;
  for (const [key, value] of Object.entries({ clientWidth: 800, clientHeight: 600, scrollWidth: 1600, scrollHeight: 2000 })) Object.defineProperty(root, key, { value, configurable: true });
  Object.defineProperty(window.document, "fonts", { value: { ready: Promise.resolve() } });
  Object.defineProperty(window, "scrollTo", { value: ({ left, top }: { left: number; top: number }) => {
    Reflect.set(window, "scrollX", Math.min(left, 800)); Reflect.set(window, "scrollY", Math.min(top, 1400));
  } });
  Object.defineProperty(window, "Image", { value: class { src = ""; naturalWidth = 1600; naturalHeight = 1200; async decode() {} } });
  const draws: number[][] = [];
  Object.defineProperty(window.HTMLCanvasElement.prototype, "getContext", { configurable: true, value: () => ({ drawImage: (_image: unknown, ...coordinates: number[]) => draws.push(coordinates) }) });
  Object.defineProperty(window.HTMLCanvasElement.prototype, "toBlob", { configurable: true, value: (callback: (blob: Blob) => void) => callback(new Blob(["capture"], { type: "image/png" })) });
  window.eval(`window.captureFrames = 0; window.postMessage = function(message) {
    if (message.direction !== "page") return;
    window.captureFrames++;
    const response = window.captureFrames === ${failAt} ? { ok: false, error: "Tab changed." } : { ok: true, value: "data:image/png;base64,frame" };
    const event = new MessageEvent("message", { data: { channel: "${CHANNEL}", direction: "host", id: message.id, ...response } });
    Object.defineProperty(event, "source", { value: window });
    window.dispatchEvent(event);
  };`);
  if (oldPicker) {
    const prior = window.document.createElement("div"); prior.className = "ai-editor-root";
    window.document.body.appendChild(prior);
    Object.assign(window, { previousDestroyCount: 0, __SELECTOR_DESTROY__: () => {
      Reflect.set(window, "previousDestroyCount", Number(Reflect.get(window, "previousDestroyCount")) + 1);
      prior.remove();
    } });
  }
  window.eval(source);
  const host = Reflect.get(window, "__SELECTOR_HOST__") as { captureRegion: (scope: string, geometry: Geometry) => Promise<Blob> };
  return { window, host, draws, frames: () => Reflect.get(window, "captureFrames") as number };
}

describe("full-element capture orchestration", () => {
  test("first mount replaces an old bookmarklet but reinjection preserves the native host", () => {
    const { window } = setup(0, true);
    expect(Reflect.get(window, "previousDestroyCount")).toBe(1);
    expect(window.document.querySelector(".ai-editor-root")).toBeNull();
    const original = Reflect.get(window, "__SELECTOR_HOST__");
    window.eval(source);
    expect(Reflect.get(window, "previousDestroyCount")).toBe(1);
    expect(Reflect.get(window, "__SELECTOR_HOST__")).toBe(original);
  });
  const geometry: Geometry = { x: 20, y: 20, w: 400, h: 1250, dpr: 2, pageWidth: 1600 };
  test("stitches the whole element including its final partial tile and restores page state", async () => {
    const { window, host, draws, frames } = setup();
    const blob = await host.captureRegion("fullElement", geometry);
    expect(blob.type).toBe("image/png");
    expect(frames()).toBe(3);
    expect(draws.map(draw => draw.slice(4))).toEqual([[0, 0, 800, 1200], [0, 1200, 800, 1200], [0, 2400, 800, 100]]);
    expect([window.scrollX, window.scrollY]).toEqual([10, 40]);
    expect(window.document.querySelector("header")!.style.getPropertyValue("visibility")).toBe("visible");
    expect(window.document.querySelector("header")!.style.getPropertyPriority("visibility")).toBe("important");
    expect(window.document.querySelector("style")).toBeNull();
  });
  test("a failed tile restores scroll, fixed elements and motion styles before propagating the error", async () => {
    const { window, host } = setup(2);
    await expect(host.captureRegion("fullElement", geometry)).rejects.toThrow("Tab changed.");
    expect([window.scrollX, window.scrollY]).toEqual([10, 40]);
    expect(window.document.querySelector("header")!.style.visibility).toBe("visible");
    expect(window.document.querySelector("style")).toBeNull();
    // A failure must release the capture lock so the user can try again.
    await expect(host.captureRegion("fullElement", geometry)).resolves.toBeInstanceOf(Blob);
  });
  test("rejects huge captures before changing the page", async () => {
    const { window, host, frames } = setup();
    await expect(host.captureRegion("fullElement", { ...geometry, dpr: 100 })).rejects.toThrow("too large");
    expect(frames()).toBe(0);
    expect([window.scrollX, window.scrollY]).toEqual([10, 40]);
  });
});
