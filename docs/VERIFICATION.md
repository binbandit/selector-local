# Verification

Selector Local 1.0.3 is based on upstream revision `d88e9a6`. Repository cleanup was checked on 14 October 2026. The extension build, strict TypeScript checks and all 50 automated tests pass. GitHub Actions runs the same checks with the committed Bun lockfile.

## Coverage

The tests execute the assembled picker, host, bridge and options code in a DOM simulation, and exercise service-worker entry points with Chrome API doubles. They cover selection, annotations, exact-element locators, Markdown, settings, shortcut conflicts, activation races, navigation resets, screenshot stitching and cleanup, download completion and external asset recovery.

Chrome playground checks on 8 October confirmed actual clipboard output for annotated prompts, Markdown and Sharingan reports, including a custom shortcut. The default Cmd/Ctrl+C browser-driver check was inconclusive because that key event did not reach the app; the bundled handler passes its DOM test. Desktop and narrow layouts were reviewed, and the PRO badge, activation promotion and Chinese language controls were removed.

Those playground checks do not prove native Chrome permissions, screenshot pixels, downloads or synchronization. Native tests remain pending manual extension installation. The browser tool blocks Chrome's extension manager and subsequently requested an update to its browser add-on.

## Remaining native checks

Load `dist/extension` manually through Chrome's Developer mode and Load unpacked. Use `http://127.0.0.1:4173/native.html` to check activation, long-element/full-page PNG pixels, fixed-element capture, saved absolute paths, clipboard paste, restored scroll, reloads, tab switches and options persistence. Check Chrome Sync separately across profiles.

Generated packages, screenshots, hashes and local verification logs are not repository source. They are kept outside Git; builds produce the installable extension and ZIP in the ignored `dist/` directory. Historical verification files were preserved locally during cleanup.

## Picker appearance and comment placement

On 14 October 2026, the packaged picker reproduced a bottom-left comment box extending outside a 1280x720 viewport (left -91.8px, bottom 770.4px). After the fix it sits above the selected button and inside both edges (left 8px, bottom 638px). Resizing to 390x500 kept it within bounds and retained the typed note; saving and reopening preserved the note. The same floating controls were inspected on a dark page and retained their explicit light palette. The appearance fixture is at `/appearance.html?theme=light` or `?theme=dark` after a build.

The extension previously injected normal USER-origin CSS, which page AUTHOR styles could override. Mount now removes both prior origins and inserts AUTHOR-origin CSS, and the picker declares its own light color scheme. Chrome API doubles cover that native injection contract; the visual checks used the packaged picker in the in-app browser. Native installation behavior is not inferred from the fixture. See [Chrome scripting](https://developer.chrome.com/docs/extensions/reference/api/scripting) and [color-scheme](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/color-scheme).
