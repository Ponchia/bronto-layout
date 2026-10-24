/** Browser-only composed selectors for geometry, readiness and declared actions.
 * `host >>> descendant` traverses OPEN shadow roots only. This self-contained
 * function can be serialized into a page's Chromium execution context.
 */
export function queryComposedElements(selector: string): Element[] {
  // Split on a literal token, then trim each part. A leading \s* in a
  // separator regexp retries at every whitespace position when no token exists.
  const parts = selector.split('>>>').map(part => part.trim());
  if (parts.some(part => !part.trim())) throw new Error(`Invalid deep selector: ${selector}`);
  let roots: Array<Document | ShadowRoot> = [document];
  let matches: Element[] = [];
  for (let index = 0; index < parts.length; index++) {
    matches = roots.flatMap(root => Array.from(root.querySelectorAll(parts[index])));
    if (index < parts.length - 1)
      roots = matches.flatMap(element => element.shadowRoot ? [element.shadowRoot] : []);
  }
  return matches;
}
