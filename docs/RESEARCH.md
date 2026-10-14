# Product research and implementation

Research date: 7 October 2026. Target: the Selector Pro browser extension, rather than its marketing website.

Sources:
- https://selector-pro.org/
- https://oil-oil.github.io/selector/
- https://github.com/oil-oil/selector (MIT declared in README; imported revision d88e9a6)
- https://chromewebstore.google.com/detail/selector-pro/gkmaenhmkhhbjlefcmljfeimcdipbnpl (Pro 0.2.8)
- https://developer.chrome.com/docs/extensions/reference/api/tabs
- https://developer.chrome.com/docs/extensions/reference/api/downloads
- https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts
- https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@import

## Comparison

| Capability | Free product | Pro product | Selector Local |
| --- | --- | --- | --- |
| Click, multiple selection, marquee, DOM navigation, annotations | Yes | Yes | Upstream picker |
| Structured prompt, semantic context, React/Vue details | Yes | Yes | Upstream picker |
| Markdown and Sharingan replication reports | Yes | Yes | Upstream picker |
| Activation by shortcut, toolbar and context menu | Bookmarklet | Yes | MV3 extension |
| Keep enabled across tabs, reloads and navigation | Re-run bookmarklet | Yes | Browser session state and navigation listeners |
| Verify a ready-to-paste Playwright locator | No | Yes | Live DOM uniqueness and identity checks |
| Full element and page capture without share picker | Limited | Yes | Native Chrome screenshots and tile stitching |
| Save PNG automatically with absolute file path | Browser dialogs | Yes | Chrome downloads completion and filename |
| Capture original external images and fonts | Limited by page CORS | Yes | Rendered native screenshot |
| Embed eligible cross-origin assets in rich report | Same-origin restrictions | Yes | Credential-free extension fetch and cache |
| Sync preferences and customizable action shortcuts | Local settings | Chrome Sync | Chrome storage.sync |

## Design boundary

Preserve the upstream compact white floating picker, monospace controls, green status cue, monochrome selection frame, reflective Pro header, translucent overlays and per-selection tools. The primary user action is selecting a real element and copying actionable context. The personal build is English only, omits the in-picker activation promotion, and has no login or licensing. The independent build is named Selector Local.

The playground is a functional page for exercising the same bundled picker. Browser-only screenshot and synchronization capabilities require loading the extension. Reference screenshot dimensions were 1280x720 (free page) and the in-app browser's default web-store viewport. Paid extension screenshots did not fully render in the research browser; UI fidelity is grounded in the public core's own Pro styling, not a claim of pixel-identical paid implementation.

## Verification boundary

The in-app browser cannot load unpacked Chrome extensions. Validate the picker on the local playground, and test the service-worker contracts with Chrome API doubles. Actual Chrome captureVisibleTab, Chrome Sync across profiles, and operating-system clipboard/image paste need a loaded extension. Never claim those native paths verified from a local playground.
