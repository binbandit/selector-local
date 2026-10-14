import { afterEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { CHANNEL } from "@/extension/protocol";

const source = await Bun.file("dist/extension/host.js").text();
let browser: Window | undefined;
afterEach(async () => { await browser?.happyDOM.close(); browser = undefined; });

function setup(importLine: string) {
  const window = new Window({ url: "https://page.example/" }); browser = window;
  const sheet = { href: "https://cdn.example/styles/main.css", get cssRules(): CSSRuleList { throw new Error("Cross-origin sheet"); } };
  Object.defineProperty(window.document, "styleSheets", { value: [sheet] });
  const responses = {
    "https://cdn.example/styles/main.css": `${importLine}\n.card { color: red; }`,
    "https://cdn.example/styles/nested/fonts.css": '@font-face { font-family: TestFont; src: url("../test.woff2"); }',
    "https://cdn.example/styles/test.woff2": "data:font/woff2;base64,dGVzdA==",
  };
  window.eval(`window.assetRequests = []; window.assetResponses = ${JSON.stringify(responses)};
    window.postMessage = function(message) {
      if (message.direction !== "page") return;
      window.assetRequests.push(message.args.url);
      const value = window.assetResponses[message.args.url];
      const reply = new MessageEvent("message", { data: { channel: "${CHANNEL}", direction: "host", id: message.id, ok: !!value, value, error: "Missing asset" } });
      Object.defineProperty(reply, "source", { value: window }); window.dispatchEvent(reply);
    };`);
  window.eval(source);
  const host = Reflect.get(window, "__SELECTOR_HOST__") as {
    prepareStyles: () => Promise<void>;
    cachedFontDataURL: (url: string) => string | undefined;
    cachedStylesheetRules: (url: string) => CSSRuleList | undefined;
  };
  return { window, host };
}

for (const line of ['@import "nested/fonts.css" screen;', '@import url(nested/fonts.css) screen;']) {
  test(`external stylesheet imports recover font binaries: ${line}`, async () => {
    const { window, host } = setup(line);
    await host.prepareStyles();
    expect(Reflect.get(window, "assetRequests")).toContain("https://cdn.example/styles/nested/fonts.css");
    expect(host.cachedFontDataURL("https://cdn.example/styles/test.woff2")).toBe("data:font/woff2;base64,dGVzdA==");
    expect(host.cachedStylesheetRules("https://cdn.example/styles/main.css")?.length).toBeGreaterThan(0);
  });
}

test("conditional imports preserve feature checks instead of turning them into media queries", async () => {
  const { host } = setup('@import "nested/fonts.css" supports((display: grid) and (color: red)) screen;');
  await host.prepareStyles();
  const rules = host.cachedStylesheetRules("https://cdn.example/styles/main.css");
  expect(rules?.[0]?.cssText).toStartWith("@supports");
  expect(rules?.[0]?.cssText).toContain("@media screen");
  expect(host.cachedFontDataURL("https://cdn.example/styles/test.woff2")).toBeDefined();
});

test("same-document navigation discards cached external resources", async () => {
  const { window, host } = setup('@import "nested/fonts.css" screen;');
  await host.prepareStyles();
  expect(host.cachedFontDataURL("https://cdn.example/styles/test.woff2")).toBeDefined();
  window.eval(`const navigation = new MessageEvent("message", { data: { channel: "${CHANNEL}", direction: "host", event: "navigation" } });
    Object.defineProperty(navigation, "source", { value: window }); window.dispatchEvent(navigation);`);
  expect(host.cachedFontDataURL("https://cdn.example/styles/test.woff2")).toBeUndefined();
  expect(host.cachedStylesheetRules("https://cdn.example/styles/main.css")).toBeUndefined();
  await host.prepareStyles();
  expect(host.cachedFontDataURL("https://cdn.example/styles/test.woff2")).toBeDefined();
});
