import { CHANNEL, errorMessage, isRecord, parseRequest, type Response } from "@/extension/protocol";

// This file runs in the isolated extension world. Page scripts never see chrome APIs.
const bridgeKey = "__selectorLocalBridge";
const scope = globalThis as typeof globalThis & { __selectorLocalBridge?: boolean };
if (!scope[bridgeKey]) {
  scope[bridgeKey] = true;
  let running = false;
  let desired = true;
  let generation = 0;
  let authorizedUntil = 0;
  let booting: Promise<void> | undefined;
  const send = (payload: unknown) => window.postMessage({ channel: CHANNEL, direction: "host", ...isRecord(payload) ? payload : {} }, location.origin);
  document.addEventListener("pointerdown", event => {
    if (event.isTrusted && event.target instanceof Element && event.target.closest(".ai-editor-root")) authorizedUntil = Date.now() + 120_000;
  }, true);
  document.addEventListener("keydown", event => {
    if (event.isTrusted && running) authorizedUntil = Date.now() + 120_000;
    if (event.target instanceof Element && event.target.closest(".ai-editor-shortcut-record")) return;
    if (event.isTrusted && event.code === "F2" && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && !event.repeat) {
      event.preventDefault();
      event.stopImmediatePropagation();
      void chrome.runtime.sendMessage({ channel: CHANNEL, op: "toggle", args: {} }).catch(error => console.warn("[Selector Local]", errorMessage(error)));
    }
  }, true);

  async function activate() {
    if (running) { send({ event: "reactivate" }); return; }
    if (booting) {
      await booting;
      if (desired && !running) return activate();
      return;
    }
    const started = generation;
    booting = (async () => {
      const response: Response = await chrome.runtime.sendMessage({ channel: CHANNEL, op: "bootstrap", args: {} });
      if (!response.ok) throw new Error(response.error);
      if (!isRecord(response.value) || !response.value.enabled) return;
      if (!desired || started !== generation) return;
      const mounted: Response = await chrome.runtime.sendMessage({ channel: CHANNEL, op: "mount", args: {} });
      if (!mounted.ok) throw new Error(mounted.error);
      if (!desired || started !== generation) { send({ event: "destroy" }); return; }
      running = true;
    })().catch(error => console.warn("[Selector Local]", errorMessage(error))).finally(() => { booting = undefined; });
    return booting;
  }

  window.addEventListener("message", async (event: MessageEvent<unknown>) => {
    if (event.source !== window || !isRecord(event.data) || event.data.channel !== CHANNEL || event.data.direction !== "page") return;
    const id = event.data.id;
    const request = parseRequest(event.data);
    if (typeof id !== "string" || !request) return;
    if (request.op === "mount" || request.op === "toggle" || (request.op !== "bootstrap" && (!running || Date.now() > authorizedUntil))) {
      send({ id, ok: false, error: "Use the Selector controls or shortcuts to perform this action." }); return;
    }
    if (request.op === "closed") { desired = false; generation++; running = false; }
    try {
      const response: Response = await chrome.runtime.sendMessage({ channel: CHANNEL, ...request });
      send({ id, ...response });
    } catch (error) { send({ id, ok: false, error: errorMessage(error) }); }
  });

  chrome.runtime.onMessage.addListener((message: unknown) => {
    if (!isRecord(message) || message.channel !== CHANNEL) return;
    if (message.event === "activate") { desired = true; void activate(); }
    else if (message.event === "deactivate") { desired = false; generation++; running = false; authorizedUntil = 0; send({ event: "destroy" }); }
    else if (message.event === "navigation") send({ event: "navigation" });
    else if (message.event === "preferences") send({ event: "preferences", value: message.value });
  });
  void activate();
}
