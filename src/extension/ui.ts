export const UI_EXTRAS = [
  { type: "select", key: "screenshotScope", labelEn: "Screenshot area", descEn: "Capture beyond the visible viewport", options: [
    { value: "fullElement", labelEn: "Full element" },
    { value: "viewport", labelEn: "Visible selection" },
    { value: "fullPage", labelEn: "Full page" },
  ] },
  { type: "toggle", key: "inlineCrossOrigin", labelEn: "Include external assets", descEn: "Embed eligible images, styles and fonts in reports" },
];
