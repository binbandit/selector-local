import { expect, test } from "bun:test";

test("the packaged browser shortcut follows Chrome's command-key restrictions", async () => {
  const manifest = await Bun.file("dist/extension/manifest.json").json() as { commands: Record<string, { suggested_key: { default: string } }> };
  const shortcut = manifest.commands["toggle-selector"]!.suggested_key.default;
  expect(shortcut).toBe("Alt+Shift+S");
  expect(shortcut).toMatch(/^(Ctrl|Alt)\+(Shift\+)?[A-Z0-9]$/);
});
