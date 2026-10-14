import { resolve, sep } from "node:path";

const root = resolve("dist");
const server = Bun.serve({
  hostname: "127.0.0.1", port: 4173,
  async fetch(request) {
    const url = new URL(request.url);
    let pathname: string;
    try { pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname); } catch { return new Response("Bad path", { status: 400 }); }
    const filePath = resolve(root, `.${pathname}`);
    if (!filePath.startsWith(`${root}${sep}`)) return new Response("Not found", { status: 404 });
    const file = Bun.file(filePath);
    return await file.exists() ? new Response(file, { headers: { "Cache-Control": "no-store" } }) : new Response("Not found", { status: 404 });
  },
});
console.log(`Selector playground: ${server.url}`);
