import { CHANNEL, errorMessage, normalizeSettings, parseRequest, type Preferences, type Request, type Response } from "@/extension/protocol";

async function preferences(): Promise<Preferences> {
  const data = await chrome.storage.sync.get("settings");
  return { settings: normalizeSettings(data.settings) };
}

async function enabled(): Promise<boolean> {
  return (await chrome.storage.session.get("enabled")).enabled === true;
}

async function notifyAll(message: unknown): Promise<void> {
  const tabs = await chrome.tabs.query({});
  await Promise.allSettled(tabs.filter(tab => tab.id && /^https?:/.test(tab.url || "")).map(tab => chrome.tabs.sendMessage(tab.id!, message)));
}

async function setEnabled(value: boolean): Promise<void> {
  await chrome.storage.session.set({ enabled: value });
  await chrome.action.setBadgeBackgroundColor({ color: "#66d9a4" });
  await chrome.action.setBadgeText({ text: value ? "ON" : "" });
  await notifyAll({ channel: CHANNEL, event: value ? "activate" : "deactivate" });
}

let activationQueue: Promise<void> = Promise.resolve();
function changeActivation(action: () => Promise<void>): Promise<void> {
  const job = activationQueue.catch(() => {}).then(action);
  activationQueue = job;
  return job;
}

function activate(tabId?: number, toggle = false): Promise<void> {
  return changeActivation(() => activateNow(tabId, toggle));
}

async function activateNow(tabId?: number, toggle = false): Promise<void> {
  const tab = tabId ? await chrome.tabs.get(tabId) : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  if (!tab?.id || !/^https?:/.test(tab.url || "") || /https:\/\/chromewebstore\.google\.com\//.test(tab.url || "")) {
    await chrome.runtime.openOptionsPage();
    return;
  }
  const next = toggle ? !(await enabled()) : true;
  await setEnabled(next);
  if (next) await inject(tab.id);
}

async function inject(tabId: number): Promise<void> {
  try {
    if (!(await enabled())) return;
    const tab = await chrome.tabs.get(tabId);
    if (!/^https?:/.test(tab.url || "")) return;
    await chrome.scripting.executeScript({ target: { tabId }, files: ["bridge.js"] });
    await chrome.tabs.sendMessage(tabId, { channel: CHANNEL, event: "activate" });
  } catch (error) { console.debug("Selector cannot run on this page:", errorMessage(error)); }
}

let captureQueue: Promise<unknown> = Promise.resolve();
let lastCapture = 0;
let captureEpoch = 0;
async function capture(tabId: number): Promise<string> {
  const job = captureQueue.catch(() => {}).then(async () => {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.active) throw new Error("Keep the selected tab active while capturing.");
    await new Promise(resolve => setTimeout(resolve, Math.max(0, 550 - (Date.now() - lastCapture))));
    const current = await chrome.tabs.get(tabId);
    if (!current.active) throw new Error("The selected tab changed during capture.");
    lastCapture = Date.now();
    const epoch = captureEpoch;
    const frame = await chrome.tabs.captureVisibleTab(current.windowId, { format: "png" });
    if (epoch !== captureEpoch || !(await chrome.tabs.get(tabId)).active) throw new Error("The selected tab changed during capture.");
    return frame;
  });
  captureQueue = job;
  return job;
}

async function fetchAsset(url: string, kind: "image" | "font" | "stylesheet"): Promise<string> {
  const response = await fetch(url, { credentials: "omit", signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`Asset returned HTTP ${response.status}`);
  const mime = (response.headers.get("content-type") || "").split(";")[0] || "";
  const limit = kind === "stylesheet" ? 2_000_000 : 6_000_000;
  if (Number(response.headers.get("content-length")) > limit) throw new Error("Asset is too large to inline.");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Asset has no response body.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > limit) throw new Error("Asset is too large to inline.");
      chunks.push(chunk.value);
    }
  } finally { await reader.cancel(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  if (kind === "stylesheet") {
    if (mime && mime !== "text/css" && mime !== "text/plain") throw new Error("Asset is not a stylesheet.");
    return new TextDecoder().decode(bytes);
  }
  if (kind === "image" && !mime.startsWith("image/")) throw new Error("Asset is not an image.");
  if (kind === "font" && !/^(font\/|application\/(font|x-font|octet-stream|vnd\.ms-fontobject))/.test(mime)) throw new Error("Asset is not a font.");
  let binary = "";
  for (let index = 0; index < bytes.length; index += 8192) binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  return `data:${mime};base64,${btoa(binary)}`;
}

async function downloadFile(args: Extract<Request, { op: "download" }>["args"]): Promise<{ path: string }> {
  const id = await chrome.downloads.download({ url: args.dataURL, filename: `Selector/${args.filename}`, saveAs: false, conflictAction: "uniquify" });
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => finish(new Error("Download did not complete within 60 seconds.")), 60_000);
    const listener = (delta: chrome.downloads.DownloadDelta) => { if (delta.id === id) void inspect(); };
    function finish(error?: Error, path?: string) {
      clearTimeout(timeout);
      chrome.downloads.onChanged.removeListener(listener);
      if (error) reject(error); else resolve({ path: path! });
    }
    async function inspect() {
      try {
        const [item] = await chrome.downloads.search({ id });
        if (item?.state === "interrupted") finish(new Error(item.error || "Download was interrupted."));
        else if (item?.state === "complete" && item.filename) finish(undefined, item.filename);
      } catch (error) { finish(new Error(errorMessage(error))); }
    }
    chrome.downloads.onChanged.addListener(listener);
    void inspect();
  });
}

async function handle(request: Request, sender: chrome.runtime.MessageSender): Promise<unknown> {
  if (sender.id !== chrome.runtime.id) throw new Error("Unknown sender.");
  const tabId = sender.tab?.id;
  switch (request.op) {
    case "toggle": {
      if (!tabId) throw new Error("Activation needs a page tab.");
      await activate(tabId, true);
      return null;
    }
    case "mount": {
      if (!tabId || !(await enabled())) throw new Error("Selector is not active.");
      const commands = await chrome.commands.getAll();
      const config = { ...await preferences(), activationShortcut: "F2", browserShortcut: commands.find(command => command.name === "toggle-selector")?.shortcut || "" };
      await chrome.scripting.executeScript({ target: { tabId }, world: "MAIN", func: (value) => {
        Object.assign(window, { __SELECTOR_LOCAL_CONFIG__: value });
      }, args: [config] });
      await chrome.scripting.removeCSS({ target: { tabId }, files: ["editor.css"], origin: "USER" });
      await chrome.scripting.insertCSS({ target: { tabId }, files: ["editor.css"], origin: "USER" });
      await chrome.scripting.executeScript({ target: { tabId }, world: "MAIN", files: ["host.js", "vendor/editor.js"] });
      return null;
    }
    case "bootstrap": {
      const commands = await chrome.commands.getAll();
      return { ...await preferences(), enabled: await enabled(), activationShortcut: "F2", browserShortcut: commands.find(command => command.name === "toggle-selector")?.shortcut || "" };
    }
    case "settings": await chrome.storage.sync.set({ settings: request.args.settings }); return null;
    case "closed": await changeActivation(() => setEnabled(false)); return null;
    case "shortcuts": await chrome.tabs.create({ url: "chrome://extensions/shortcuts" }); return null;
    default: {
      if (!tabId || !(await enabled()) || !/^https?:/.test(sender.url || "")) throw new Error("Selector is not active on this page.");
      if (request.op === "capture") return capture(tabId);
      if (request.op === "asset") return fetchAsset(request.args.url, request.args.kind);
      return downloadFile(request.args);
    }
  }
}

chrome.runtime.onMessage.addListener((message: unknown, sender, reply: (response: Response) => void) => {
  if (!message || typeof message !== "object" || !("channel" in message) || message.channel !== CHANNEL) return;
  const request = parseRequest(message);
  if (!request) { reply({ ok: false, error: "Invalid Selector request." }); return; }
  handle(request, sender).then(value => reply({ ok: true, value })).catch(error => reply({ ok: false, error: errorMessage(error) }));
  return true;
});

chrome.action.onClicked.addListener(tab => { void activate(tab.id, true); });
chrome.commands.onCommand.addListener(command => { if (command === "toggle-selector") void activate(undefined, true); });
chrome.contextMenus.onClicked.addListener((info, tab) => { if (info.menuItemId === "selector-open") void activate(tab?.id); });
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: "selector-open", title: "Select with Selector Local", contexts: ["page", "selection", "image", "link"] });
});
chrome.tabs.onActivated.addListener(info => { captureEpoch++; void inject(info.tabId); });
chrome.tabs.onUpdated.addListener((tabId, change) => { if (change.status === "complete") void inject(tabId); });
chrome.webNavigation.onHistoryStateUpdated.addListener(details => {
  if (details.frameId === 0) void chrome.tabs.sendMessage(details.tabId, { channel: CHANNEL, event: "navigation" }).catch(() => {});
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.settings) void preferences().then(value => notifyAll({ channel: CHANNEL, event: "preferences", value }));
});
