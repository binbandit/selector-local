import { computeAccessibleName, getRole } from "dom-accessibility-api";

// Each expression is resolved against this page before it reaches the clipboard.
export function buildTestLocators(element: Element): string[] {
  const quote = JSON.stringify;
  const testId = element.getAttribute("data-testid");
  if (testId) {
    const matches = [...document.querySelectorAll(`[data-testid=${quote(testId)}]`)];
    if (matches.length === 1 && matches[0] === element) return [`page.getByTestId(${quote(testId)}) // verified unique`];
  }
  const role = getRole(element);
  const name = computeAccessibleName(element);
  if (role && name && name.length < 100) {
    const matches = [...document.querySelectorAll("*")].filter(node =>
      getRole(node) === role && computeAccessibleName(node) === name &&
      !node.closest('[aria-hidden="true"], [hidden], [inert]') && getComputedStyle(node).visibility !== "hidden" && node.getClientRects().length > 0);
    if (matches.length === 1 && matches[0] === element) {
      return [`page.getByRole(${quote(role)}, { name: ${quote(name)}, exact: true }) // verified unique`];
    }
  }
  if (element.id) {
    const selector = `#${CSS.escape(element.id)}`;
    if (document.querySelectorAll(selector).length === 1) return [`page.locator(${quote(selector)}) // verified unique`];
  }
  const parts: string[] = [];
  let current: Element | null = element;
  while (current) {
    const siblings = current.parentElement ? [...current.parentElement.children].filter(sibling => sibling.tagName === current?.tagName) : [current];
    parts.unshift(`${current.localName}:nth-of-type(${siblings.indexOf(current) + 1})`);
    const selector = parts.join(" > ");
    const matches = document.querySelectorAll(selector);
    if (matches.length === 1 && matches[0] === element) return [`page.locator(${quote(selector)}) // verified unique`];
    current = current.parentElement;
  }
  return [];
}
