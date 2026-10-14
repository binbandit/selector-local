import { DEFAULT_SETTINGS, normalizeSettings, type Settings } from "@/extension/protocol";
import { bindingFromEvent, normalizeBinding } from "@/extension/shortcuts";

const status = document.querySelector<HTMLParagraphElement>("#status")!;
let settings: Settings = { ...DEFAULT_SETTINGS };
let activationShortcut = "";
const keys = ["shortcutCopyContext", "shortcutScreenshotContext", "shortcutMarkdown"] as const;
const field = (key: string) => document.getElementById(key) as HTMLInputElement | HTMLSelectElement;

function render() {
  for (const key of Object.keys(settings) as (keyof Settings)[]) {
    const input = field(key);
    if (typeof settings[key] === "boolean") (input as HTMLInputElement).checked = Boolean(settings[key]);
    else input.value = String(settings[key]);
  }
}

async function save() {
  try { await chrome.storage.sync.set({ settings }); status.textContent = "Preferences saved."; }
  catch { status.textContent = "Could not save preferences. Try the change again."; }
}

async function init() {
  const data = await chrome.storage.sync.get("settings");
  settings = normalizeSettings(data.settings);
  render();
  const commands = await chrome.commands.getAll();
  activationShortcut = commands.find(command => command.name === "toggle-selector")?.shortcut || "";
  document.getElementById("shortcuts")!.textContent = `${activationShortcut || "Unassigned"} · Change`;
}
void init().catch(() => { status.textContent = "Could not read preferences. Reload this page."; });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.settings) {
    settings = normalizeSettings(changes.settings.newValue);
    render();
  }
});

for (const key of ["combined", "sharingan", "inlineCrossOrigin"] as const) {
  field(key).addEventListener("change", () => { settings[key] = (field(key) as HTMLInputElement).checked; void save(); });
}
field("screenshotScope").addEventListener("change", () => {
  settings = normalizeSettings({ ...settings, screenshotScope: field("screenshotScope").value }); void save();
});
document.getElementById("shortcuts")!.addEventListener("click", () => { void chrome.tabs.create({ url: "chrome://extensions/shortcuts" }); });
document.getElementById("reset")!.addEventListener("click", () => { settings = { ...DEFAULT_SETTINGS }; render(); void save(); });

for (const key of keys) {
  const input = field(key);
  input.addEventListener("focus", () => { status.textContent = "Press a shortcut. Escape cancels; Backspace clears."; });
  input.addEventListener("keydown", event => {
    const e = event as KeyboardEvent;
    if (e.key === "Tab") return;
    e.preventDefault();
    if (e.key === "Escape") { input.blur(); return; }
    if (["Control", "Alt", "Meta", "Shift"].includes(e.key)) return;
    let next = "";
    if (e.key !== "Backspace" && e.key !== "Delete") {
      next = bindingFromEvent(e);
      if (!next) { status.textContent = "Typing keys need Command, Control, or Alt."; return; }
      if (next === "F2" || next === normalizeBinding(activationShortcut) || keys.some(other => other !== key && normalizeBinding(settings[other]) === next)) {
        status.textContent = "This shortcut is already in use. Choose another."; return;
      }
    }
    settings[key] = next; input.value = next; input.blur(); void save();
  });
}
