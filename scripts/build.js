const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
const distAssets = path.join(dist, "assets");

const editorParts = [
  "core.js",
  "selection.js",
  "ui.js",
  "export.js",
  "prompt.js",
];

const editorPayloadParts = [
  ...editorParts.map((file) => ({
    source: path.join("src", file),
  })),
  { source: path.join("src", "sharingan.js"), stripHeader: true },
  { source: path.join("src", "context.js") },
];

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyFile(from, to) {
  ensureDir(path.dirname(to));
  fs.copyFileSync(from, to);
}

function stripSharinganHeader(source) {
  return source.replace(/^\s*\/\*\*[\s\S]*?\*\/\s*/, "");
}

function buildEditor() {
  const assembled = [];
  for (const part of editorPayloadParts) {
    const source = part.stripHeader ? stripSharinganHeader(read(part.source)) : read(part.source);
    const output = source.trim() + "\n\n";
    if (output.includes("__SHARINGAN_MODULE__")) {
      throw new Error(`Unreplaced Sharingan marker in ${part.source}`);
    }
    assembled.push(output);
  }
  // Check the exact picker bundle for syntax errors before packaging it.
  const joined = assembled.join("");
  new Function(joined);
  fs.writeFileSync(path.join(distAssets, "editor.js"), joined);
}

function build() {
  fs.rmSync(dist, { recursive: true, force: true });
  ensureDir(distAssets);
  copyFile(path.join(root, "index.html"), path.join(dist, "index.html"));
  copyFile(path.join(root, "assets", "editor.css"), path.join(distAssets, "editor.css"));
  copyFile(path.join(root, "assets", "favicon.svg"), path.join(distAssets, "favicon.svg"));
  buildEditor();
}

build();
