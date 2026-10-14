# Verification

Selector Local 1.0.2 is based on upstream revision `d88e9a6`. Repository cleanup was checked on 14 October 2026. The extension build, strict TypeScript checks and all 47 automated tests pass. GitHub Actions runs the same checks with the committed Bun lockfile.

## Coverage

The tests execute the assembled picker, host, bridge and options code in a DOM simulation, and exercise service-worker entry points with Chrome API doubles. They cover selection, annotations, exact-element locators, Markdown, settings, shortcut conflicts, activation races, navigation resets, screenshot stitching and cleanup, download completion and external asset recovery.

Chrome playground checks on 8 October confirmed actual clipboard output for annotated prompts, Markdown and Sharingan reports, including a custom shortcut. The default Cmd/Ctrl+C browser-driver check was inconclusive because that key event did not reach the app; the bundled handler passes its DOM test. Desktop and narrow layouts were reviewed, and the PRO badge, activation promotion and Chinese language controls were removed.

Those playground checks do not prove native Chrome permissions, screenshot pixels, downloads or synchronization. Native tests remain pending manual extension installation. The browser tool blocks Chrome's extension manager and subsequently requested an update to its browser add-on.

## Remaining native checks

Load `dist/extension` manually through Chrome's Developer mode and Load unpacked. Use `http://127.0.0.1:4173/native.html` to check activation, long-element/full-page PNG pixels, fixed-element capture, saved absolute paths, clipboard paste, restored scroll, reloads, tab switches and options persistence. Check Chrome Sync separately across profiles.

Generated packages, screenshots, hashes and local verification logs are not repository source. They are kept outside Git; builds produce the installable extension and ZIP in the ignored `dist/` directory. Historical verification files were preserved locally during cleanup.
