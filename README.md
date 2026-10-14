# Selector Local

A personal Chrome extension with Selector Pro-style features, built on the MIT licensed [Selector](https://github.com/oil-oil/selector) picker. Repository: [binbandit/selector-local](https://github.com/binbandit/selector-local). No login, payments, licensing service, API keys or subscription. The interface is English only.

## Install

An unpacked build is ready in `dist/extension`, and `dist/selector-local.zip` contains the same extension.

1. Open `chrome://extensions` in Chrome.
2. Turn on Developer mode.
3. Choose **Load unpacked** and select `dist/extension`.
4. Pin Selector Local, open a website, and press **F2** or click its toolbar icon.

See [installation and shortcuts](docs/INSTALL.md) for details and capture limits.

## Features

- Select, annotate, multi-select, marquee-select, and navigate real page elements.
- Copy semantic context, page location, nearby content, available React/Vue details and a verified Playwright locator.
- Preview and copy Markdown, or export a detailed Sharingan DOM/CSS/font/layout report.
- Keep the picker available across tabs, reloads and SPA navigation.
- Capture complete elements or pages using Chrome screenshots and tile stitching.
- Automatically save PNGs and include the browser-confirmed absolute path with the copied context.
- Preserve rendered cross-origin assets in screenshots and embed eligible external resources in reports.
- Sync preferences through Chrome Sync and customize copy, screenshot and Markdown shortcuts.

## Development

```sh
bun install --frozen-lockfile
bun run build
bun run dev
```

Open http://127.0.0.1:4173/ for the picker playground. The playground exercises the same picker; native screenshots, downloads and Chrome Sync require loading the extension.

```sh
bun run check
bun run test
```

The tests cover the actual assembled picker and extension host with DOM/Chrome API doubles. Native browser permissions and cross-profile synchronization require checks in Chrome. GitHub Actions runs the build, type checks and tests. Generated files in `dist/` and local verification artifacts stay out of Git.

## Source

- `src/*.js` and `assets/editor.css`: upstream picker, with focused usability and English-only changes.
- `src/extension`: independent, typed MV3 browser integration.
- `extension`: manifest, icons and extension options.
- `docs/RESEARCH.md`: comparison with the free and paid products, sources and implementation boundaries.
- `docs/VERIFICATION.md`: validation evidence and remaining native-browser checks.

MIT. Upstream picker copyright belongs to oil-oil and its contributors; the paid extension's code is not included.
