import { build } from "esbuild";
import { cp, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const output = resolve("dist/extension");
await mkdir(`${output}/vendor`, { recursive: true });
await cp("extension", output, { recursive: true });
await cp("dist/assets/editor.js", `${output}/vendor/editor.js`);
await cp("assets/editor.css", `${output}/editor.css`);
await cp("LICENSE", `${output}/LICENSE`);
await cp("docs/INSTALL.md", `${output}/INSTALL.md`);
await build({ entryPoints: ["src/extension/background.ts", "src/extension/bridge.ts", "src/extension/host.ts", "src/extension/options.ts"], outdir: output, bundle: true, format: "iife", target: "chrome120", tsconfig: "tsconfig.json", minify: false });
await build({ entryPoints: ["src/extension/demo.ts"], outfile: "dist/demo.js", bundle: true, format: "iife", target: "chrome120", tsconfig: "tsconfig.json" });
await cp("tests/fixtures/native.html", "dist/native.html");
console.log(`Extension ready: ${output}`);
