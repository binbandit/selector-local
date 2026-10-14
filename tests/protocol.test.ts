import { describe, expect, test } from "bun:test";
import { normalizeSettings, parseRequest } from "@/extension/protocol";

describe("extension boundary", () => {
  test("defaults to a complete-element capture and preserves custom shortcuts", () => {
    const settings = normalizeSettings({ shortcutCopyContext: "Mod+Alt+C", screenshotScope: "invalid", combined: "true", unexpected: "ignore" });
    expect(settings.screenshotScope).toBe("fullElement");
    expect(settings.shortcutCopyContext).toBe("Mod+Alt+C");
    expect(settings.combined).toBe(false);
    expect(settings).not.toHaveProperty("unexpected");
  });
  test("only supports HTTP asset sources", () => {
    for (const url of ["file:///etc/passwd", "chrome://settings", "javascript:alert(1)", "data:image/png;base64,AAAA"]) {
      expect(parseRequest({ op: "asset", args: { url, kind: "image" } })).toBeNull();
    }
    expect(parseRequest({ op: "asset", args: { url: "https://example.com/logo.png", kind: "image" } })).not.toBeNull();
  });
  test("downloads cannot write arbitrary paths or executable files", () => {
    for (const filename of ["../../evil.png", "selector-code.js", "/tmp/selector-test.png", "other-test.png"]) {
      expect(parseRequest({ op: "download", args: { filename, mime: "image/png", dataURL: "data:image/png;base64,AAAA" } })).toBeNull();
    }
    expect(parseRequest({ op: "download", args: { filename: "selector-test.png", mime: "image/png", dataURL: "data:text/html;base64,AAAA" } })).toBeNull();
    expect(parseRequest({ op: "download", args: { filename: "selector-test.md", mime: "image/png", dataURL: "data:image/png;base64,AAAA" } })).toBeNull();
    expect(parseRequest({ op: "download", args: { filename: "selector-test.png", mime: "image/png", dataURL: "data:image/png;base64,AAAA" } })).not.toBeNull();
  });
});
