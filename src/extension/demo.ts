import { buildTestLocators } from "@/extension/locators";
import { UI_EXTRAS } from "@/extension/ui";
import { DEFAULT_SETTINGS, normalizeSettings, type Settings } from "@/extension/protocol";

const page = window as Window & { __SELECTOR_HOST__?: object; __SELECTOR_DESTROY__?: () => void; __SELECTOR_ON_REACTIVATE__?: () => void };
const button = document.querySelector<HTMLButtonElement>("#launch")!;
const readSettings = () => { try { return normalizeSettings(JSON.parse(localStorage.getItem("selector-demo-settings") || "{}")); } catch { return { ...DEFAULT_SETTINGS }; } };

async function launch() {
  if (page.__SELECTOR_ON_REACTIVATE__) { page.__SELECTOR_ON_REACTIVATE__(); return; }
  page.__SELECTOR_HOST__ = {
    isExtension: true, pageShortcuts: true, screenshotClipboardContext: true, activationShortcut: "F2", browserShortcut: "Alt+Shift+S", uiExtras: UI_EXTRAS,
    initialSettings: readSettings(),
    setSettings: (settings: Settings) => localStorage.setItem("selector-demo-settings", JSON.stringify(settings)),
    buildTestLocators,
    onClosed: () => { button.textContent = "Open Selector"; },
    openShortcutSettings: () => { document.getElementById("install")!.scrollIntoView({ behavior: "smooth" }); },
  };
  const script = document.createElement("script");
  script.src = "assets/editor.js";
  await new Promise<void>((resolve, reject) => { script.onload = () => resolve(); script.onerror = () => reject(new Error("Picker failed to load.")); document.body.appendChild(script); });
  button.textContent = "Selector is open";
}
button.addEventListener("click", () => { void launch(); });
document.addEventListener("keydown", event => {
  if (event.key === "F2") { event.preventDefault(); if (page.__SELECTOR_DESTROY__) page.__SELECTOR_DESTROY__(); else void launch(); }
});
