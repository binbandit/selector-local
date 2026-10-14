# Selector Local

A personal Chrome extension based on the MIT licensed Selector picker, with independently implemented Pro features. No purchase, account, API key or server is required.

## Install

1. Build with `bun install` then `bun run build` (or use the supplied ZIP).
2. Open `chrome://extensions` in Chrome or another Chromium browser.
3. Enable **Developer mode**, click **Load unpacked**, and choose `dist/extension`. If using the ZIP, extract it first and choose the extracted folder containing `manifest.json`.
4. Pin **Selector Local** to the toolbar. Open an ordinary website and press **F2**, click the toolbar icon, or right-click and choose **Select with Selector Local**.

The extension remains enabled across tabs, reloads and navigations for the current browser session. F2 or the close button turns it off across all tabs. Alt+Shift+S is the browser-level fallback shortcut; F2 is handled on the page because Chrome's extension command registry does not accept function keys. Preferences sync with Chrome Sync when enabled in your browser. Chrome's internal pages, the Chrome Web Store, other extensions, closed shadow roots and cross-origin iframe contents cannot be selected.

## Use

| Action | Result |
| --- | --- |
| Click | Select an element |
| Shift + click | Add an element |
| Drag on the page | Select a group |
| Arrow keys | Select parent, child or sibling |
| Pencil beside a selection | Add instructions |
| Cmd/Ctrl+C | Copy structured context and a verified Playwright locator |
| Cmd/Ctrl+Shift+C | Copy screenshot and context, automatically save PNG |
| Cmd/Ctrl+M | Preview selected content as Markdown, then use Copy Markdown |
| Cmd/Ctrl+Z | Undo selection |
| Escape | Clear selection or close a popover |
| F2 / toolbar | Toggle Selector across tabs |

Use the picker gear button for screenshot scope, Sharingan mode and per-action shortcuts. The interface is English only. The extension's Details page also provides **Extension options**. Change the activation shortcut at `chrome://extensions/shortcuts`.

## Screenshots and reports

Full element is the default. Choose visible selection or full page in settings. Captures use Chrome's rendered viewport, stitch multiple tiles, restore scrolling afterward, and save to Downloads/Selector. The prompt includes the browser-confirmed absolute file path. Keep the page's tab active until capture finishes. Clipboard access must be allowed; on ordinary HTTP pages Chrome may refuse clipboard access, but the PNG is saved before the clipboard operation.

Very large captures are limited to 60 million pixels or 32,000 pixels per side to protect browser memory. Pages that animate, lazy-load, virtualize, use nested scroll containers, or reflow while scrolling may need a smaller selection. Full element captures the element's rendered box; it does not expand internally scrollable panels.

Fixed and sticky selections are captured at their current viewport position. If the selection extends beyond that viewport, choose Visible selection. Navigation or closing the picker discards a pending capture before its download starts.

Sharingan mode preserves sanitized DOM, layout, effective styles, available framework context, and eligible external images, CSS and fonts. Asset requests omit credentials. Private, blocked, missing or oversized assets retain their original references. Each image/font is limited to 6 MB; each stylesheet to 2 MB. Large reports download as Markdown, with their confirmed file path copied in the summary.

## Privacy and permissions

There is no telemetry, AI service or licensing backend. Context is copied to your clipboard or saved to disk. Broad website access is needed to keep the picker available across websites and to fetch page assets. Settings alone use Chrome Sync; page content is not synced. Downloads permission supplies the real saved file path. Scripts are packaged locally and run through Chrome's injection API, including on pages with strict CSP.

## Update

After a rebuild, click Reload on the extension's card in `chrome://extensions`, then reload pages using the picker. Do not delete your unpacked extension folder while using it.
