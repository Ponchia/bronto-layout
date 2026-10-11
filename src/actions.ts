/** Declarative, explicitly opted-in interactions to reach a website's intended visual state.
 * These are executed inside a real browser tab by the CLI, never in the pure layout engine.
 * Click/fill are intentionally allowed only when written in the user's contract.
 */
export type LayoutAction =
  | { type: 'click'; selector: string }
  | { type: 'fill'; selector: string; value: string }
  | { type: 'wait-for'; selector: string }
  | { type: 'scroll-into-view'; selector: string }
  | { type: 'pause'; milliseconds: number };
